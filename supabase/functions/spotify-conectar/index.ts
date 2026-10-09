// Edge Function: conecta o Spotify de um professor (OAuth).
//
// O app manda o `code` que o Spotify devolveu em /spotify/conectado; a
// troca pelo par de chaves usa o Client Secret e por isso acontece
// aqui, nunca no celular. As chaves vão para `dj_conexoes`, que nenhum
// usuário consegue ler (migração 029).
//
// Publicar: npx supabase functions deploy spotify-conectar

import { createClient } from 'npm:@supabase/supabase-js@2'
import { mesclarToken } from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, ErroSpotify, pedirToken } from '../_shared/spotify.ts'

// Os mesmos cadastrados no painel do Spotify. Qualquer outro é recusado
// antes de chegar ao Spotify (ele recusaria também, mas com erro feio).
const REDIRECTS = [
  'https://forro-de-segunda.vercel.app/spotify/conectado',
  'http://127.0.0.1:5173/spotify/conectado',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: u } = await admin.auth.getUser(jwt)
  const user = u.user
  if (!user) return json({ erro: 'Entre no app antes de conectar o Spotify' }, 401)

  const { code, redirect_uri } = await req.json().catch(() => ({}))
  if (typeof code !== 'string' || !REDIRECTS.includes(redirect_uri)) {
    return json({ erro: 'Pedido de conexão inválido' }, 400)
  }

  const { data: pode } = await admin.rpc('pode_ser_dj', { p_uid: user.id })
  if (!pode) return json({ erro: 'Só professores podem ser DJ' }, 403)

  try {
    const tokens = mesclarToken(
      null,
      await pedirToken({ grant_type: 'authorization_code', code, redirect_uri }),
      new Date(),
    )

    let eu: { id: string; display_name?: string | null; product?: string }
    try {
      eu = (await chamarSpotify(tokens.access_token, '/me')) as typeof eu
    } catch (e) {
      // No modo de desenvolvimento, conta fora da lista do painel
      // (User Management) recebe 403 aqui
      if (e instanceof ErroSpotify && e.status === 403) {
        return json({ resultado: 'nao_liberado' })
      }
      throw e
    }

    const { error } = await admin.from('dj_conexoes').upsert({
      user_id: user.id,
      spotify_id: eu.id,
      spotify_nome: eu.display_name ?? null,
      plano: eu.product ?? null,
      ...tokens,
      conectado_em: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)

    return json({ resultado: eu.product === 'premium' ? 'ok' : 'sem_premium' })
  } catch (e) {
    console.error('[spotify-conectar]', e)
    return json({ erro: 'Não deu para conectar ao Spotify. Tente de novo.' }, 502)
  }
})
