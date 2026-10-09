import { describe, expect, it } from 'vitest'
import {
  ESCOPOS_SPOTIFY,
  novoStateSpotify,
  podeSerDJ,
  redirectSpotify,
  SPOTIFY_CLIENT_ID,
  urlAutorizacaoSpotify,
} from '../../src/lib/dj'

describe('podeSerDJ', () => {
  it('professor, diretor de ensino e organizador podem', () => {
    expect(podeSerDJ(['Professor(a)'], 'aluno')).toBe(true)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de Ensino'], 'aluno')).toBe(true)
    expect(podeSerDJ([], 'organizador')).toBe(true)
  })

  it('aluno, monitor e outros cargos não', () => {
    expect(podeSerDJ([], 'aluno')).toBe(false)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de RH'], 'aluno')).toBe(false)
  })
})

describe('autorização do Spotify', () => {
  it('monta o endereço de volta a partir da origem', () => {
    expect(redirectSpotify('https://forro-de-segunda.vercel.app')).toBe(
      'https://forro-de-segunda.vercel.app/spotify/conectado',
    )
  })

  it('a URL leva client_id, code, redirect, escopos e state', () => {
    const url = new URL(urlAutorizacaoSpotify('http://127.0.0.1:5173/spotify/conectado', 'abc'))
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('client_id')).toBe(SPOTIFY_CLIENT_ID)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/spotify/conectado')
    expect(url.searchParams.get('scope')).toBe(ESCOPOS_SPOTIFY)
    expect(url.searchParams.get('state')).toBe('abc')
  })

  it('state é aleatório, com 32 caracteres hexadecimais', () => {
    const a = novoStateSpotify()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(novoStateSpotify()).not.toBe(a)
  })
})
