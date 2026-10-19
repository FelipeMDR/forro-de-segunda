// Edge Function: o player do DJ para o Modo Resistência.
//
// A tela da aula de resistência pergunta, a cada poucos segundos, qual
// música está tocando e em que ponto ela está, para soltar o "Voltou
// pra roda / Agradeceu, beijou e trocou" na hora certa, e dá play de
// novo se o celular pausou a música por causa do som do aviso.
//
// O volume fica de fora de propósito: a música e o aviso saem do mesmo
// celular, e baixar o volume do Spotify baixaria a voz junto.
//
// Usa a chave do Spotify de quem chama (dj_conexoes), não a da sessão
// de DJ aberta: a aula de resistência não precisa dos pedidos ligados.
//
// Publicar: npx supabase functions deploy spotify-player

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { mesclarToken, playerAgora, precisaRenovar } from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, ErroSpotify, pedirToken } from '../_shared/spotify.ts'

interface Conexao {
  user_id: string
  access_token: string
  refresh_token: string
  expira_em: string
}

/** Renova a chave e grava. null = a pessoa revogou o acesso. */
async function renovar(admin: SupabaseClient, c: Conexao): Promise<string | null> {
  try {
    const novo = mesclarToken(
      c,
      await pedirToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
      new Date(),
    )
    const { error } = await admin.from('dj_conexoes').update(novo).eq('user_id', c.user_id)
    if (error) throw new Error(`[gravar chave renovada] ${error.message}`)
    Object.assign(c, novo)
    return novo.access_token
  } catch (e) {
    if (e instanceof ErroSpotify && e.status === 400) return null
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data } = await admin.auth.getUser(jwt)
  if (!data.user) return json({ erro: 'Entre no app para usar o Modo Resistência' }, 401)

  const { data: conexao, error } = await admin
    .from('dj_conexoes')
    .select('user_id, access_token, refresh_token, expira_em')
    .eq('user_id', data.user.id)
    .maybeSingle<Conexao>()
  if (error) return json({ erro: error.message }, 500)
  if (!conexao) return json({ erro: 'Conecte o seu Spotify no Modo DJ primeiro' }, 409)

  const corpo = (await req.json().catch(() => ({}))) as { acao?: string }
  const acao = corpo.acao ?? 'estado'

  const chamar = async (token: string): Promise<unknown> => {
    if (acao === 'play') {
      await chamarSpotify(token, '/me/player/play', { method: 'PUT' })
      return { feito: true }
    }
    return { player: playerAgora(await chamarSpotify(token, '/me/player?market=BR')) }
  }

  try {
    let token = precisaRenovar(conexao.expira_em, new Date())
      ? await renovar(admin, conexao)
      : conexao.access_token
    if (!token) return json({ erro: 'O acesso ao Spotify foi revogado. Conecte de novo.' }, 409)
    try {
      return json(await chamar(token))
    } catch (e) {
      // 401: a chave venceu antes da hora. Renova e tenta UMA vez.
      if (!(e instanceof ErroSpotify) || e.status !== 401) throw e
      token = await renovar(admin, conexao)
      if (!token) return json({ erro: 'O acesso ao Spotify foi revogado. Conecte de novo.' }, 409)
      return json(await chamar(token))
    }
  } catch (e) {
    if (e instanceof ErroSpotify && e.status === 404) {
      // Nenhum aparelho ativo: para a leitura, é só "nada tocando"
      if (acao === 'estado') return json({ player: null })
      return json({ erro: 'Nenhum aparelho com o Spotify aberto' }, 409)
    }
    if (e instanceof ErroSpotify && (e.status === 403 || e.status === 429)) {
      // 403 no play: a música já está tocando ou a conta não é Premium
      return json({ erro: e.message }, 409)
    }
    console.error('[spotify-player]', e)
    return json({ erro: String(e) }, 502)
  }
})
