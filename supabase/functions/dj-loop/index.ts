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
  estadoDoPlayer,
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

/** Renova a chave e grava. null = o professor revogou o acesso. */
async function renovar(admin: SupabaseClient, c: Conexao): Promise<string | null> {
  try {
    const novo = mesclarToken(
      c,
      await pedirToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
      new Date(),
    )
    await admin.from('dj_conexoes').update(novo).eq('user_id', c.user_id)
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

  // Cron (service role) ou o próprio DJ da noite, pelo app
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${service}`) {
    const { data } = await admin.auth.getUser(auth.replace(/^Bearer /, ''))
    if (data.user?.id !== sessao.dj_user_id) {
      return json({ erro: 'Só o DJ da noite pode fazer isso' }, 403)
    }
  }

  const agoraIso = () => new Date().toISOString()
  const atualizarSessao = (campos: Record<string, unknown>) =>
    admin.from('dj_sessoes').update(campos).eq('id', sessao.id)

  try {
    const { data: conexao } = await admin
      .from('dj_conexoes')
      .select('user_id, access_token, refresh_token, expira_em')
      .eq('user_id', sessao.dj_user_id)
      .maybeSingle<Conexao>()

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

    const { data: pendente } = await admin
      .from('pedidos_musica')
      .select('id, track_uri')
      .eq('noite', sessao.noite)
      .eq('status', 'enviado')
      .order('enviado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data: proximos } = await admin
      .rpc('fila_da_noite', { p_noite: sessao.noite })
      .limit(1)

    const acao = decidirPassada({
      agora: new Date(),
      noite: sessao.noite,
      temConexao: token !== null,
      player,
      enviadoPendente: pendente ? { id: pendente.id, trackUri: pendente.track_uri } : null,
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

    if (acao.enviar) {
      const { data: reservados } = await admin.rpc('reservar_proximo_pedido', {
        p_noite: sessao.noite,
      })
      const pedido = (reservados ?? [])[0] as { id: string; track_uri: string } | undefined
      if (pedido) {
        try {
          await chamarSpotify(
            token,
            '/me/player/queue?' + new URLSearchParams({ uri: pedido.track_uri }),
            { method: 'POST' },
          )
        } catch (e) {
          // O Spotify recusou: o pedido volta para o lugar dele na fila
          await admin.rpc('devolver_pedido', { p_id: pedido.id })
          throw e
        }
      }
    }
    return json({ feito: 'passada', acao })
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
