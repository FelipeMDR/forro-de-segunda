import type { Papel } from './types'

/**
 * Peças do Modo DJ que o app usa fora da API: quem pode ser DJ e o
 * endereço de autorização do Spotify.
 *
 * O Client ID não é segredo (ele vai na URL que o navegador abre). O
 * Client Secret, sim, e por isso só existe nas Edge Functions.
 */
export const SPOTIFY_CLIENT_ID = 'b50dd222d8e9498faf4744ed49a799dd'

/** Os mesmos cargos de `pode_ser_dj` no banco (migração 029). */
export const CARGOS_DJ: readonly string[] = ['Professor(a)', 'Diretor(a) de Ensino']

/** Cargo ganho ao conectar o Spotify (migração 033). */
export const CARGO_DJ = 'DJ'

/** O app do Spotify em modo de desenvolvimento aceita só 5 contas. */
export const LIMITE_DJS = 5

/**
 * A mesma regra de `pode_ser_dj` (migração 033): quem já é DJ, sempre;
 * professor, diretor de ensino e organizador, só enquanto houver vaga.
 */
export function podeSerDJ(
  cargos: readonly string[],
  papel: Papel,
  totalDJs: number,
): boolean {
  if (cargos.includes(CARGO_DJ)) return true
  if (totalDJs >= LIMITE_DJS) return false
  return papel === 'organizador' || cargos.some((c) => CARGOS_DJ.includes(c))
}

export const ESCOPOS_SPOTIFY = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  // Para saber se a conta é Premium e avisar antes da primeira noite
  'user-read-private',
].join(' ')

/** Onde o `state` espera a volta do Spotify (sessionStorage). */
export const CHAVE_STATE_SPOTIFY = 'fds-spotify-state'

/**
 * Endereço de volta. Precisa estar cadastrado no painel do Spotify, e
 * o Spotify não aceita `localhost`: em desenvolvimento, abrir o app em
 * http://127.0.0.1:5173 (npm run dev -- --host 127.0.0.1).
 */
export function redirectSpotify(origem: string): string {
  return `${origem}/spotify/conectado`
}

export function urlAutorizacaoSpotify(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ESCOPOS_SPOTIFY,
    state,
  })
  return `https://accounts.spotify.com/authorize?${p}`
}

/** `state` contra CSRF: a volta do Spotify só vale se trouxer este valor. */
export function novoStateSpotify(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
