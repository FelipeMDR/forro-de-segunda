import type {
  AgendaEvent,
  Feriado,
  NivelTrilha,
  Papel,
  RegrasTrilha,
  PassoTrilha,
  Turma,
} from './types'

/**
 * Trilha de vídeo-aulas: QUANDO cada passo abre para cada aluno.
 *
 * Os vídeos ficam no YouTube (não listados) e a trava é de tela — o
 * banco só confere o gasto de chave (migração 036). Por isso toda a
 * regra de datas mora aqui, como a de presença mora em `presenca.ts`.
 *
 * As datas saem da Agenda: as aulas de uma turma são os eventos
 * semanais dela a partir de `trilha_inicio`, menos os cancelamentos,
 * mais as reposições (evento de data única com `reposicao_de`). A aula
 * nº N da turma é o N-ésimo passo do nível dela.
 */

export const NIVEIS: readonly NivelTrilha[] = ['iniciante', 'intermediario', 'avancado']

export const NOME_NIVEL: Record<NivelTrilha, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

export const PONTOS_POR_CHAVE = 3

/** Valem enquanto a organização não mudar (ou sem a migração 036). */
export const REGRAS_PADRAO: RegrasTrilha = {
  pontos_por_chave: PONTOS_POR_CHAVE,
}

const CARGOS_TRILHA = ['Professor(a)', 'Diretor(a) de Ensino']

/** Mesma regra de `pode_editar_trilha()` no banco. */
export function podeEditarTrilha(p: {
  papel: Papel
  cargos: string[]
  turmas_ensino: string[]
}): boolean {
  return (
    p.papel === 'organizador' ||
    p.cargos.some((c) => CARGOS_TRILHA.includes(c)) ||
    p.turmas_ensino.length > 0
  )
}

// ---- YouTube ----

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/

/** ID do vídeo a partir de qualquer link comum do YouTube (ou do próprio ID). */
export function idDoYoutube(link: string): string | null {
  const limpo = link.trim()
  if (ID_YOUTUBE.test(limpo)) return limpo
  let url: URL
  try {
    url = new URL(/^https?:\/\//.test(limpo) ? limpo : `https://${limpo}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v')
    if (!id) {
      const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      id = m ? m[2] : null
    }
  }
  return id && ID_YOUTUBE.test(id) ? id : null
}

/** `enablejsapi=1`: deixa a tela mudar a velocidade pelo postMessage. */
export function urlDoEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
}

export function miniaturaDoYoutube(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
}

// ---- Datas ("YYYY-MM-DD", sempre em UTC para o fuso não mudar o dia) ----

function paraUTC(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

export function somaDias(iso: string, n: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Dias de calendário de `de` até `ate` (negativo se já passou). */
export function diasAte(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
}

function diaDaSemana(iso: string): number {
  return paraUTC(iso).getUTCDay()
}

// ---- Calendário de uma turma ----

export interface AulaDaTurma {
  data: string
  tipo: 'aula' | 'reposicao' | 'cancelada'
  motivo: string | null
  /** Só em "cancelada": dia da reposição, se houve. */
  reposicaoEm: string | null
}

export function ordenarPassos(passos: PassoTrilha[]): PassoTrilha[] {
  return [...passos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
}

/**
 * Aulas da turma de `inicio` até `ate` (inclusive), na ordem.
 *
 * Só conta como aula o evento SEMANAL da turma e a reposição; um evento
 * de data única comum (Forró na Rep) não move a trilha. Cancelamento de
 * outra turma, ou num dia sem aula desta, não aparece.
 */
export function aulasDaTurma(
  turma: string,
  inicio: string,
  eventos: AgendaEvent[],
  feriados: Feriado[],
  ate: string,
): AulaDaTurma[] {
  const datas = new Set<string>()
  for (const e of eventos) {
    if (e.turma !== turma || e.dia_semana === null || e.data) continue
    let d = somaDias(inicio, (e.dia_semana - diaDaSemana(inicio) + 7) % 7)
    for (; d <= ate; d = somaDias(d, 7)) datas.add(d)
  }

  // Dia sem Espaço Livre (cancela_aulas falso) teve aula: a trilha anda
  const cancelamento = (data: string) =>
    feriados.find((x) => x.cancela_aulas && x.data === data && (x.turma === null || x.turma === turma))

  // Reposição só vale no lugar de uma aula DESTA turma que foi mesmo
  // cancelada. Repor um dia sem aula, ou uma reposição que sobrou depois
  // de desfazerem o cancelamento, puxaria a trilha inteira para frente.
  const reposicoes = eventos.filter(
    (e) =>
      e.turma === turma &&
      e.data &&
      e.reposicao_de &&
      e.data >= inicio &&
      e.data <= ate &&
      datas.has(e.reposicao_de) &&
      cancelamento(e.reposicao_de),
  )
  const reposicaoDe = new Map(reposicoes.map((e) => [e.reposicao_de as string, e.data as string]))

  const aulas: AulaDaTurma[] = [...datas].map((data) => {
    const f = cancelamento(data)
    return f
      ? { data, tipo: 'cancelada', motivo: f.motivo, reposicaoEm: reposicaoDe.get(data) ?? null }
      : { data, tipo: 'aula', motivo: null, reposicaoEm: null }
  })
  for (const e of reposicoes) {
    aulas.push({ data: e.data as string, tipo: 'reposicao', motivo: null, reposicaoEm: null })
  }
  return aulas.sort(
    (a, b) => a.data.localeCompare(b.data) || Number(b.tipo === 'cancelada') - Number(a.tipo === 'cancelada'),
  )
}

export interface LinhaCronograma {
  aula: AulaDaTurma
  /** null em aula cancelada, ou quando a trilha acabou. */
  passo: PassoTrilha | null
}

export function cronogramaDaTurma(
  passosDoNivel: PassoTrilha[],
  aulas: AulaDaTurma[],
): LinhaCronograma[] {
  const ordem = ordenarPassos(passosDoNivel)
  let i = 0
  return aulas.map((aula) =>
    aula.tipo === 'cancelada' ? { aula, passo: null } : { aula, passo: ordem[i++] ?? null },
  )
}

/** Cronograma completo de uma turma: vai até a última aula com passo. */
export function cronogramaDeTurma(
  turma: Turma,
  passos: PassoTrilha[],
  eventos: AgendaEvent[],
  feriados: Feriado[],
): LinhaCronograma[] {
  if (!turma.nivel || !turma.trilha_inicio) return []
  const doNivel = passos.filter((p) => p.nivel === turma.nivel)
  if (doNivel.length === 0) return []
  // Folga larga: cancelamentos empurram, reposições não encurtam.
  const ate = somaDias(turma.trilha_inicio, 7 * (doNivel.length + 26))
  const linhas = cronogramaDaTurma(
    doNivel,
    aulasDaTurma(turma.nome, turma.trilha_inicio, eventos, feriados, ate),
  )
  const ultima = linhas.map((l) => l.passo !== null).lastIndexOf(true)
  return linhas.slice(0, ultima + 1)
}

// ---- Situação para o aluno ----

export interface ContextoTrilha {
  passos: PassoTrilha[]
  turmas: Turma[]
  /** Nomes das turmas em que a pessoa estuda (`profile.turmas`). */
  minhasTurmas: string[]
  eventos: AgendaEvent[]
  feriados: Feriado[]
  /** Passos liberados com chave. */
  liberadas: ReadonlySet<string>
  /** Dia da noite de hoje ("YYYY-MM-DD"). */
  hoje: string
  /** Professores e organização: veem tudo. */
  equipe: boolean
  /** Regras das chaves; sem elas, `REGRAS_PADRAO`. */
  regras?: RegrasTrilha
}

export type EstadoPasso = 'aberto' | 'chave' | 'bloqueado'

export interface PassoComSituacao {
  passo: PassoTrilha
  /** Aula nº na trilha do nível (1, 2, 3…). */
  numero: number
  estado: EstadoPasso
  motivo: 'data' | 'chave' | 'revisao' | 'equipe' | null
  /** Quando abre (ou abriu) para o aluno; null se não há data. */
  data: string | null
  /** Chaves para comprar este passo agora (1, 2, 4…); null se não está à venda. */
  custo: number | null
}

export function nivelDoAluno(ctx: ContextoTrilha): NivelTrilha | null {
  let maior = -1
  for (const t of ctx.turmas) {
    if (t.nivel && ctx.minhasTurmas.includes(t.nome)) {
      maior = Math.max(maior, NIVEIS.indexOf(t.nivel))
    }
  }
  return maior >= 0 ? NIVEIS[maior] : null
}

/** Data mais cedo, entre as turmas do aluno nesse nível, de cada passo. */
function datasDoNivel(nivel: NivelTrilha, ctx: ContextoTrilha): Map<string, string> {
  const datas = new Map<string, string>()
  for (const t of ctx.turmas) {
    if (t.nivel !== nivel || !ctx.minhasTurmas.includes(t.nome)) continue
    for (const l of cronogramaDeTurma(t, ctx.passos, ctx.eventos, ctx.feriados)) {
      if (!l.passo) continue
      const atual = datas.get(l.passo.id)
      if (!atual || l.aula.data < atual) datas.set(l.passo.id, l.aula.data)
    }
  }
  return datas
}

interface ItemFila {
  passo: PassoTrilha
  custo: number
}

/**
 * Passos à frente da turma, na ordem em que o aluno pode comprar: o resto
 * do nível dele e, depois, os níveis acima. O 1º custa 1 chave, o 2º 2,
 * o 3º 4… — contando a partir da turma, então o preço não muda quando o
 * aluno compra o anterior, e cai quando a turma avança.
 */
function filaDeCompra(ctx: ContextoTrilha): ItemFila[] {
  const meu = nivelDoAluno(ctx)
  if (!meu || ctx.equipe) return []
  const doMeu = ordenarPassos(ctx.passos.filter((p) => p.nivel === meu))
  // Nível sem passos ainda: nada de pular direto para o de cima
  if (doMeu.length === 0) return []
  const datas = datasDoNivel(meu, ctx)
  const fila = doMeu.filter((p) => {
    const d = datas.get(p.id)
    return !(d && d <= ctx.hoje)
  })
  for (const n of NIVEIS.slice(NIVEIS.indexOf(meu) + 1)) {
    fila.push(...ordenarPassos(ctx.passos.filter((p) => p.nivel === n)))
  }
  return fila.map((passo, i) => ({ passo, custo: 2 ** i }))
}

/** O único passo à venda: o primeiro da fila ainda não comprado. Ninguém pula a fila. */
function passoAVenda(ctx: ContextoTrilha, fila: ItemFila[]): ItemFila | null {
  const item = fila.find((f) => !ctx.liberadas.has(f.passo.id))
  if (!item || !item.passo.pode_chave || !item.passo.video_frente) return null
  // No nível do aluno, só com a turma no cronograma (sem data, a trilha não foi configurada)
  if (item.passo.nivel === nivelDoAluno(ctx) && !datasDoNivel(item.passo.nivel, ctx).has(item.passo.id)) {
    return null
  }
  return item
}

/**
 * Abas da trilha: o nível do aluno e os de baixo (revisão), mais um nível
 * de cima quando ele já comprou passo lá ou quando chegou a vez de comprar.
 */
export function niveisVisiveis(ctx: ContextoTrilha): NivelTrilha[] {
  const comPassos = NIVEIS.filter((n) => ctx.passos.some((p) => p.nivel === n))
  if (ctx.equipe) return comPassos
  const meu = nivelDoAluno(ctx)
  if (!meu) return []
  const venda = passoAVenda(ctx, filaDeCompra(ctx))
  return comPassos.filter(
    (n) =>
      NIVEIS.indexOf(n) <= NIVEIS.indexOf(meu) ||
      venda?.passo.nivel === n ||
      ctx.passos.some((p) => p.nivel === n && ctx.liberadas.has(p.id)),
  )
}

/** Aba em que a trilha abre: o nível do aluno, ou o primeiro com passos (revisão). */
export function nivelInicial(ctx: ContextoTrilha): NivelTrilha | null {
  const niveis = niveisVisiveis(ctx)
  const meu = nivelDoAluno(ctx)
  return meu && niveis.includes(meu) ? meu : (niveis[0] ?? null)
}

export function situacaoDoNivel(nivel: NivelTrilha, ctx: ContextoTrilha): PassoComSituacao[] {
  const passos = ordenarPassos(ctx.passos.filter((p) => p.nivel === nivel))
  const datas = datasDoNivel(nivel, ctx)
  const meu = nivelDoAluno(ctx)
  const abaixo = meu !== null && NIVEIS.indexOf(nivel) < NIVEIS.indexOf(meu)
  const fila = filaDeCompra(ctx)
  const custos = new Map(fila.map((f) => [f.passo.id, f.custo]))
  const venda = passoAVenda(ctx, fila)

  return passos.map((passo, i): PassoComSituacao => {
    const data = nivel === meu ? (datas.get(passo.id) ?? null) : null
    const base = { passo, numero: i + 1, data, custo: null }
    if (ctx.equipe) return { ...base, data: datas.get(passo.id) ?? null, estado: 'aberto', motivo: 'equipe' }
    if (abaixo) return { ...base, estado: 'aberto', motivo: 'revisao' }
    if (data && data <= ctx.hoje) return { ...base, estado: 'aberto', motivo: 'data' }
    if (ctx.liberadas.has(passo.id)) return { ...base, estado: 'aberto', motivo: 'chave' }
    return {
      ...base,
      estado: venda?.passo.id === passo.id ? 'chave' : 'bloqueado',
      motivo: null,
      custo: custos.get(passo.id) ?? null,
    }
  })
}

// ---- Chaves ----

/**
 * Os pontos das chaves são os MESMOS do desafio principal (o que tem a
 * Forródex ligada): Presença + Parcerias, como no ranking. Assim o aluno
 * vê um número só, e treinar para o desafio é treinar para a trilha.
 */
export interface EntradaChaves {
  /** Noites que valeram no desafio principal. */
  presenca: number
  /** Soma das cartas da Forródex no desafio (1 a 4 cada). */
  parcerias: number
  /** Chaves gastas desde o início do desafio (soma dos preços). */
  usadas: number
  /** Regra da organização; sem ela, 3. */
  pontosPorChave?: number
}

export interface SaldoChaves {
  pontos: number
  ganhas: number
  usadas: number
  disponiveis: number
  /** Pontos até a próxima chave (1 até `pontosPorChave`). */
  faltam: number
  pontosPorChave: number
}

export function saldoDeChaves(e: EntradaChaves): SaldoChaves {
  const pontos = e.presenca + e.parcerias
  const porChave = e.pontosPorChave ?? PONTOS_POR_CHAVE
  const ganhas = Math.floor(pontos / porChave)
  return {
    pontos,
    ganhas,
    usadas: e.usadas,
    disponiveis: Math.max(0, ganhas - e.usadas),
    faltam: porChave - (pontos % porChave),
    pontosPorChave: porChave,
  }
}
