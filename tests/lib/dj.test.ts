import { describe, expect, it } from 'vitest'
import {
  CARGO_DJ,
  ESCOPOS_SPOTIFY,
  LIMITE_DJS,
  novoStateSpotify,
  podeSerDJ,
  redirectSpotify,
  SPOTIFY_CLIENT_ID,
  urlAutorizacaoSpotify,
} from '../../src/lib/dj'

describe('podeSerDJ', () => {
  it('com vaga, professor, diretor de ensino e organizador podem', () => {
    expect(podeSerDJ(['Professor(a)'], 'aluno', 0)).toBe(true)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de Ensino'], 'aluno', 4)).toBe(true)
    expect(podeSerDJ([], 'organizador', 4)).toBe(true)
  })

  it('aluno, monitor e outros cargos não', () => {
    expect(podeSerDJ([], 'aluno', 0)).toBe(false)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de RH'], 'aluno', 0)).toBe(false)
  })

  it('com 5 DJs, nenhum professor novo entra — nem o organizador', () => {
    expect(podeSerDJ(['Professor(a)'], 'aluno', LIMITE_DJS)).toBe(false)
    expect(podeSerDJ([], 'organizador', LIMITE_DJS)).toBe(false)
  })

  it('quem tem o cargo de DJ pode sempre, mesmo sem ser professor', () => {
    expect(podeSerDJ([CARGO_DJ], 'aluno', LIMITE_DJS)).toBe(true)
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
