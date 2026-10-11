import { describe, expect, it } from 'vitest'
import { musicaMaisTocada } from '../../src/lib/retrospectiva'

const tocou = (uri: string, quando: string, titulo = `Música ${uri}`) => ({
  uri,
  titulo,
  artista: 'Artista',
  capa_url: `https://capa/${uri}.jpg`,
  tocou_em: quando,
})

describe('musicaMaisTocada', () => {
  it('sem nenhuma música tocada não há cartão', () => {
    expect(musicaMaisTocada([])).toBeNull()
  })

  it('vence a que mais vezes tocou, e conta o total do semestre', () => {
    const r = musicaMaisTocada([
      tocou('a', '2026-09-01T23:00:00Z'),
      tocou('b', '2026-09-08T23:00:00Z'),
      tocou('b', '2026-09-15T23:00:00Z'),
      tocou('c', '2026-09-22T23:00:00Z'),
    ])
    expect(r).toMatchObject({ titulo: 'Música b', vezes: 2, total: 4 })
  })

  it('empate: vale a que tocou por último', () => {
    const r = musicaMaisTocada([
      tocou('a', '2026-09-01T23:00:00Z'),
      tocou('b', '2026-09-20T23:00:00Z'),
      tocou('c', '2026-09-10T23:00:00Z'),
    ])
    expect(r).toMatchObject({ titulo: 'Música b', vezes: 1, total: 3 })
  })

  it('empate entre repetidas: vale a que tocou por último', () => {
    const r = musicaMaisTocada([
      tocou('a', '2026-09-01T23:00:00Z'),
      tocou('a', '2026-09-02T23:00:00Z'),
      tocou('b', '2026-09-03T23:00:00Z'),
      tocou('b', '2026-09-30T23:00:00Z'),
    ])
    expect(r).toMatchObject({ titulo: 'Música b', vezes: 2 })
  })

  it('traz título, artista e capa da vez mais recente', () => {
    const r = musicaMaisTocada([
      tocou('a', '2026-09-01T23:00:00Z', 'Nome antigo'),
      tocou('a', '2026-09-08T23:00:00Z', 'Nome novo'),
    ])
    expect(r).toEqual({
      titulo: 'Nome novo',
      artista: 'Artista',
      capa_url: 'https://capa/a.jpg',
      vezes: 2,
      total: 2,
    })
  })
})
