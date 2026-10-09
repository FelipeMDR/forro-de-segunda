// Edge Function: o loop do Modo DJ.
//
// O pg_cron chama a cada minuto, mas SÓ quando há sessão aberta (ver o
// agendamento no topo da migração 029); o app chama uma vez quando o
// professor liga o Modo DJ, para o primeiro pedido não esperar o
// minuto virar. Cada passada faz uma leitura do player do professor e,
// no máximo, um envio. O que decidir mora em `_shared/djPuro.ts`.
//
// Publicar: npx supabase functions deploy dj-loop

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  decidirPassada,
  destinoDoPedidoRecusado,
  estadoDoPlayer,
  fimDaNoite,
  mesclarToken,
  precisaRenovar,
  type EstadoPlayer,
} from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, ErroSpotify, pedirToken } from '../_shared/spotify.ts'

interface Conexao {
  user_id: string
  access_token: string
  refresh_token: string
  expira_em: string
}

/**
 * Erro do banco vira exceção, com o lugar onde aconteceu. Antes as
 * chamadas ignoravam o `error`: uma reserva recusada passava em
 * silêncio como "nada a enviar", e o pedido ficava esperando para
 * sempre sem nenhuma pista. Agora a mensagem chega na resposta (500),
 * que dá para ler em net._http_response.
 */
function doBanco<T>(r: { data: T; error: { message: string } | null }, onde: string): T {
  if (r.error) throw new Error(`[${onde}] ${r.error.message}`)
  return r.data
}

/** Renova a chave e grava. null = o professor revogou o acesso. */
async function renovar(admin: SupabaseClient, c: Conexao): Promise<string | null> {
  try {
    const novo = mesclarToken(
      c,
      await pedirToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
      new Date(),
    )
    doBanco(
      await admin.from('dj_conexoes').update(novo).eq('user_id', c.user_id),
      'gravar chave renovada',
    )
    Object.assign(c, novo)
    return novo.access_token
  } catch (e) {
    // 400 invalid_grant: o professor tirou o acesso do app no Spotify
    if (e instanceof ErroSpotify && e.status === 400) return null
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, service)

  const { data: sessao } = await admin
    .from('dj_sessoes')
    .select('id, dj_user_id, noite')
    .is('fechada_em', null)
    .maybeSingle()
  if (!sessao) return json({ feito: 'sem_sessao' })

  // Cron (service role) ou o próprio DJ da noite, pelo app.
  //
  // NÃO comparar o token com SUPABASE_SERVICE_ROLE_KEY como texto: as
  // duas strings não batem (a chave entregue às funções não é a mesma
  // copiada do painel), e o agendamento inteiro caía no 403 abaixo.
  // Quem decide é o banco, como na limpeza de fotos: só a service_role
  // executa dj_loop_autorizado (migração 030).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const comoQuemChamou = createClient(Deno.env.get('SUPABASE_URL')!, token)
  const { data: ehAgendamento } = await comoQuemChamou.rpc('dj_loop_autorizado')
  if (ehAgendamento !== true) {
    const { data } = await admin.auth.getUser(token)
    if (data.user?.id !== sessao.dj_user_id) {
      return json({ erro: 'Só o DJ da noite pode fazer isso' }, 403)
    }
  }

  const agoraIso = () => new Date().toISOString()
  const atualizarSessao = (campos: Record<string, unknown>) =>
    admin.from('dj_sessoes').update(campos).eq('id', sessao.id)

  // A virada das 5h vem ANTES de qualquer chamada ao Spotify: se o
  // Spotify falhasse depois das 5h, a sessão nunca fecharia, o cron
  // seguiria chamando a noite toda e a sessão velha travaria a seguinte.
  if (Date.now() >= fimDaNoite(sessao.noite).getTime()) {
    await atualizarSessao({ fechada_em: agoraIso(), motivo_fechamento: 'virada' })
    return json({ feito: 'virada' })
  }

  try {
    const conexao = doBanco(
      await admin
        .from('dj_conexoes')
        .select('user_id, access_token, refresh_token, expira_em')
        .eq('user_id', sessao.dj_user_id)
        .maybeSingle<Conexao>(),
      'ler conexao',
    )

    let token: string | null = null
    if (conexao) {
      token = precisaRenovar(conexao.expira_em, new Date())
        ? await renovar(admin, conexao)
        : conexao.access_token
    }

    let player: EstadoPlayer | null = null
    if (token && conexao) {
      try {
        player = estadoDoPlayer(await chamarSpotify(token, '/me/player/queue'))
      } catch (e) {
        // 401: a chave venceu antes da hora. Renova e tenta UMA vez.
        if (!(e instanceof ErroSpotify) || e.status !== 401) throw e
        token = await renovar(admin, conexao)
        if (token) player = estadoDoPlayer(await chamarSpotify(token, '/me/player/queue'))
      }
    }

    // O último envio da noite (enviado ou já tocado). Se ainda está
    // `enviado`, é o pedido nosso pendente na fila do Spotify; e o id
    // dele vai para a reserva, que desiste se outra passada mandou algo
    // nesse meio-tempo (ver reservar_proximo_pedido na migração 029).
    const ultimoEnvio = doBanco(
      await admin
        .from('pedidos_musica')
        .select('id, track_uri, status, enviado_em')
        .eq('noite', sessao.noite)
        .in('status', ['enviado', 'tocou'])
        .order('enviado_em', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      'ler ultimo envio',
    )
    const pendente = ultimoEnvio?.status === 'enviado' ? ultimoEnvio : null
    const proximos = doBanco(
      await admin.rpc('fila_da_noite', { p_noite: sessao.noite }).limit(1),
      'ler fila',
    )

    const acao = decidirPassada({
      agora: new Date(),
      noite: sessao.noite,
      temConexao: token !== null,
      player,
      enviadoPendente: pendente
        ? { id: pendente.id, trackUri: pendente.track_uri, enviadoEm: pendente.enviado_em }
        : null,
      temProximo: (proximos ?? []).length > 0,
    })

    if (acao.tipo === 'fechar') {
      await atualizarSessao({ fechada_em: agoraIso(), motivo_fechamento: acao.motivo })
      return json({ feito: acao.motivo })
    }
    if (acao.tipo === 'sem_aparelho' || !player || !token) {
      await atualizarSessao({ aviso: 'sem_aparelho', atualizado_em: agoraIso() })
      return json({ feito: 'sem_aparelho' })
    }

    if (acao.marcarTocou) {
      await admin
        .from('pedidos_musica')
        .update({ status: 'tocou', tocou_em: agoraIso() })
        .eq('id', acao.marcarTocou)
        .eq('status', 'enviado')
    }

    // "Tocando agora" que o aluno vê vem daqui, nunca do Spotify direto
    const { data: pedidoTocando } = await admin
      .from('pedidos_musica')
      .select('id')
      .eq('noite', sessao.noite)
      .eq('track_uri', player.tocando.uri)
      .in('status', ['enviado', 'tocou'])
      .maybeSingle()
    await atualizarSessao({
      aviso: null,
      tocando_uri: player.tocando.uri,
      tocando_titulo: player.tocando.titulo,
      tocando_artista: player.tocando.artista,
      tocando_capa: player.tocando.capa_url,
      tocando_pedido_id: pedidoTocando?.id ?? null,
      atualizado_em: agoraIso(),
    })

    // Vai na resposta: "enviar: true" sem música enviada é a pista de que
    // a reserva desistiu (outra passada mandou antes) ou a fila esvaziou
    let enviou: string | null = null
    if (acao.enviar) {
      const reservados = doBanco(
        await admin.rpc('reservar_proximo_pedido', {
          p_noite: sessao.noite,
          p_ultimo_envio_visto: ultimoEnvio?.id ?? null,
        }),
        'reservar pedido',
      )
      const pedido = (reservados ?? [])[0] as { id: string; track_uri: string } | undefined
      if (pedido) {
        try {
          await chamarSpotify(
            token,
            '/me/player/queue?' + new URLSearchParams({ uri: pedido.track_uri }),
            { method: 'POST' },
          )
          enviou = pedido.track_uri
        } catch (e) {
          // Recusa do player (chave, Premium, limite): o pedido volta
          // para o lugar dele. Recusa da música em si: ele sai, senão
          // falharia todo minuto na cabeça da fila e travaria a noite.
          if (e instanceof ErroSpotify && destinoDoPedidoRecusado(e.status) === 'descartar') {
            doBanco(await admin.rpc('descartar_pedido', { p_id: pedido.id }), 'descartar pedido')
            console.warn('[dj-loop] o Spotify recusou a música', pedido.track_uri, e.message)
            return json({ feito: 'descartado', acao })
          }
          doBanco(await admin.rpc('devolver_pedido', { p_id: pedido.id }), 'devolver pedido')
          throw e
        }
      }
    }
    return json({ feito: 'passada', acao, enviou })
  } catch (e) {
    if (e instanceof ErroSpotify && e.status === 403) {
      await atualizarSessao({ aviso: 'sem_premium', atualizado_em: agoraIso() })
      return json({ feito: 'sem_premium' })
    }
    if (e instanceof ErroSpotify && e.status === 404) {
      await atualizarSessao({ aviso: 'sem_aparelho', atualizado_em: agoraIso() })
      return json({ feito: 'sem_aparelho' })
    }
    if (e instanceof ErroSpotify && e.status === 429) {
      // O Spotify pediu calma: o próximo minuto tenta de novo
      return json({ feito: 'esperar' })
    }
    console.error('[dj-loop]', e)
    return json({ erro: String(e) }, 500)
  }
})
