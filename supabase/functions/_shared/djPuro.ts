// Lógica pura do Modo DJ: sem Deno, sem rede, sem banco.
//
// Importada pelas Edge Functions (`../_shared/djPuro.ts`), pelo modo
// demonstração do app (que simula o Spotify com a MESMA decisão do
// loop) e pelos testes (tests/dj/djPuro.test.ts). Por isso não pode
// importar nada: um import aqui teria de funcionar no Deno e no Vite.

/** Uma faixa como o app guarda e mostra. */
export interface FaixaApi {
  uri: string
  titulo: string
  artista: string
  capa_url: string | null
  duracao_ms: number
}

interface ItemSpotify {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: Array<{ name?: string }>
  album?: { images?: Array<{ url?: string }> }
  // Episódio de podcast (pode aparecer na fila do professor)
  show?: { name?: string }
  images?: Array<{ url?: string }>
}

/**
 * Converte um item da Web API. Devolve null para o que não dá para
 * mostrar (sem uri ou sem nome) em vez de quebrar: a fila do Spotify do
 * professor pode ter qualquer coisa, inclusive episódio de podcast.
 */
export function faixaDaApi(t: unknown): FaixaApi | null {
  const f = t as ItemSpotify | null
  if (!f?.uri || !f.name) return null
  const artistas = (f.artists ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ')
  return {
    uri: f.uri,
    titulo: f.name,
    artista: artistas || f.show?.name || '',
    capa_url: f.album?.images?.[0]?.url ?? f.images?.[0]?.url ?? null,
    duracao_ms: f.duration_ms ?? 0,
  }
}

/** O que o loop precisa saber do player do professor. */
export interface EstadoPlayer {
  tocando: FaixaApi
  filaUris: string[]
}

/**
 * Lê a resposta de GET /me/player/queue. null = nenhum aparelho tocando:
 * o Spotify responde 204 (corpo vazio) ou `currently_playing: null`.
 */
export function estadoDoPlayer(resposta: unknown): EstadoPlayer | null {
  const r = resposta as { currently_playing?: unknown; queue?: unknown[] } | null
  const tocando = faixaDaApi(r?.currently_playing ?? null)
  if (!tocando) return null
  const filaUris = (r?.queue ?? [])
    .map((q) => faixaDaApi(q)?.uri)
    .filter((u): u is string => Boolean(u))
  return { tocando, filaUris }
}

export interface TokenGuardado {
  access_token: string
  refresh_token: string
  expira_em: string
}

/**
 * Junta a resposta do /api/token com o que já estava guardado. Na
 * renovação o Spotify às vezes NÃO manda refresh_token novo — aí o
 * antigo continua valendo e não pode ser apagado.
 */
export function mesclarToken(
  antigo: TokenGuardado | null,
  resposta: { access_token: string; refresh_token?: string; expires_in: number },
  agora: Date,
): TokenGuardado {
  const refresh = resposta.refresh_token ?? antigo?.refresh_token
  if (!refresh) throw new Error('O Spotify não devolveu refresh_token')
  return {
    access_token: resposta.access_token,
    refresh_token: refresh,
    expira_em: new Date(agora.getTime() + resposta.expires_in * 1000).toISOString(),
  }
}

/** Renova com folga de 1 minuto, para a chave não vencer no meio da passada. */
export function precisaRenovar(expiraEm: string, agora: Date): boolean {
  return new Date(expiraEm).getTime() - agora.getTime() < 60_000
}

/**
 * Quando acaba a noite `noite` (YYYY-MM-DD): 5h do dia seguinte em São
 * Paulo. UTC−3 fixo — o Brasil não tem horário de verão desde 2019. É a
 * mesma virada de `noite_do_checkin` no banco e de `diaDaNoite` no app.
 */
export function fimDaNoite(noite: string): Date {
  const [a, m, d] = noite.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + 1, 5 + 3))
}

/** Quanto um pedido nosso pode ficar "na fila" antes de ser dado como perdido. */
export const PRAZO_PENDENTE_MS = 15 * 60 * 1000

/**
 * O Spotify recusou enfileirar um pedido: ele volta para a fila ou sai?
 *
 * Volta quando o problema é do player ou do Spotify (chave, Premium,
 * limite, instabilidade): na próxima passada pode dar certo. Sai quando
 * a recusa é da música em si (400/404/410 — id que não existe mais,
 * faixa indisponível): devolver faria a mesma música falhar todo minuto
 * na cabeça da fila e travar a noite inteira.
 */
export function destinoDoPedidoRecusado(status: number): 'devolver' | 'descartar' {
  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    return 'devolver'
  }
  return 'descartar'
}

export type AcaoLoop =
  | { tipo: 'fechar'; motivo: 'virada' | 'conexao_perdida' }
  | { tipo: 'sem_aparelho' }
  | { tipo: 'passada'; marcarTocou: string | null; enviar: boolean }

/**
 * O que fazer nesta passada do loop.
 *
 * A fila do Spotify nunca tem mais de UM pedido nosso esperando: só se
 * manda o próximo quando o último enviado já começou a tocar (ou sumiu,
 * pulado no Spotify). É isso que mantém a ordem justa do nosso lado —
 * a API do Spotify só deixa acrescentar, nunca reordenar.
 *
 * `enviadoPendente` é o pedido `enviado` mais recente da noite.
 *
 * A fila do Spotify mistura o que foi enfileirado com as próximas da
 * playlist, sem dizer qual é qual. Um pedido pulado cuja música também
 * está na playlist pareceria "ainda na fila" até a playlist chegar
 * nele — por isso, passado PRAZO_PENDENTE_MS, ele é dado como perdido.
 */
export function decidirPassada(e: {
  agora: Date
  noite: string
  temConexao: boolean
  player: EstadoPlayer | null
  enviadoPendente: { id: string; trackUri: string; enviadoEm: string } | null
  temProximo: boolean
}): AcaoLoop {
  if (e.agora.getTime() >= fimDaNoite(e.noite).getTime()) {
    return { tipo: 'fechar', motivo: 'virada' }
  }
  if (!e.temConexao) return { tipo: 'fechar', motivo: 'conexao_perdida' }
  if (!e.player) return { tipo: 'sem_aparelho' }

  const p = e.enviadoPendente
  const tocando = p !== null && e.player.tocando.uri === p.trackUri
  const venceu =
    p !== null &&
    e.agora.getTime() - new Date(p.enviadoEm).getTime() > PRAZO_PENDENTE_MS
  const aindaNaFila =
    p !== null && !tocando && !venceu && e.player.filaUris.includes(p.trackUri)
  return {
    tipo: 'passada',
    marcarTocou: tocando && p ? p.id : null,
    enviar: !aindaNaFila && e.temProximo,
  }
}
