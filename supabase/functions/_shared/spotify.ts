// Chamadas HTTP ao Spotify. O Client Secret só existe aqui, lido dos
// segredos das funções (supabase secrets) — nunca no app.

export class ErroSpotify extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

function credenciais(): string {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID')
  const segredo = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !segredo) throw new Error('Faltam SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET nos segredos')
  return 'Basic ' + btoa(`${id}:${segredo}`)
}

/** POST /api/token (código, renovação ou chave do próprio app). */
export async function pedirToken(
  params: Record<string, string>,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: credenciais(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new ErroSpotify(r.status, corpo.error_description ?? corpo.error ?? 'token recusado')
  }
  return corpo
}

/**
 * Chama a Web API. Devolve o JSON, ou null quando a resposta é vazia
 * (204) ou não é JSON — o "adicionar à fila" responde com um código em
 * texto, e foi isso que quebrou a primeira versão do teste de
 * viabilidade.
 */
export async function chamarSpotify(
  token: string,
  caminho: string,
  init: RequestInit = {},
): Promise<unknown> {
  const r = await fetch(`https://api.spotify.com/v1${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })
  const texto = await r.text()
  if (!r.ok) {
    let mensagem = texto
    try {
      mensagem = JSON.parse(texto)?.error?.message ?? texto
    } catch {
      // corpo em texto puro: fica como veio
    }
    throw new ErroSpotify(r.status, mensagem)
  }
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
