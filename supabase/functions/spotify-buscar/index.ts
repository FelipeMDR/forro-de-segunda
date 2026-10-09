// Edge Function: busca músicas no Spotify para o aluno pedir.
//
// Usa a chave do PRÓPRIO APP (client credentials), não a de um
// professor: não ocupa vaga nos 5 usuários do modo de desenvolvimento,
// e o aluno não precisa logar no Spotify.
//
// Publicar: npx supabase functions deploy spotify-buscar

import { createClient } from 'npm:@supabase/supabase-js@2'
import { faixaDaApi, type FaixaApi } from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, pedirToken } from '../_shared/spotify.ts'

// A chave do app dura 1 hora; guardada enquanto a instância viver
let chaveDoApp: { token: string; ate: number } | null = null

async function tokenDoApp(): Promise<string> {
  if (chaveDoApp && chaveDoApp.ate > Date.now() + 60_000) return chaveDoApp.token
  const r = await pedirToken({ grant_type: 'client_credentials' })
  chaveDoApp = { token: r.access_token, ate: Date.now() + r.expires_in * 1000 }
  return r.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Só quem está logado no app: sem isso a função vira um proxy aberto
  // de busca do Spotify, pago pela cota do projeto
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data } = await admin.auth.getUser(jwt)
  if (!data.user) return json({ erro: 'Entre no app para buscar músicas' }, 401)

  const { q } = await req.json().catch(() => ({ q: '' }))
  const termo = String(q ?? '').trim().slice(0, 100)
  if (termo.length < 2) return json({ faixas: [] })

  try {
    const r = (await chamarSpotify(
      await tokenDoApp(),
      '/search?' + new URLSearchParams({ q: termo, type: 'track', market: 'BR', limit: '10' }),
    )) as { tracks?: { items?: unknown[] } } | null
    const faixas = (r?.tracks?.items ?? [])
      .map(faixaDaApi)
      .filter((f): f is FaixaApi => f !== null)
    return json({ faixas })
  } catch (e) {
    console.error('[spotify-buscar]', e)
    return json({ erro: 'A busca do Spotify falhou. Tente de novo.' }, 502)
  }
})
