import { describe, expect, it } from 'vitest'
import { computeBadges } from '../../src/lib/badges'

const dj = (musicasTocadas?: number) =>
  computeBadges({ userId: 'u', turmas: [], checkinDates: [], musicasTocadas }).filter((b) =>
    b.id.startsWith('dj-'),
  )

describe('distintivo DJ do Espaço Livre', () => {
  it('sem música tocada não aparece', () => {
    expect(dj(0)).toEqual([])
    expect(dj(undefined)).toEqual([])
  })

  it('evolui sem acumular: mostra só o maior nível', () => {
    expect(dj(1).map((b) => b.emoji)).toEqual(['🎵'])
    expect(dj(12).map((b) => b.emoji)).toEqual(['🎶'])
    expect(dj(25).map((b) => b.emoji)).toEqual(['🎧'])
    expect(dj(80).map((b) => b.emoji)).toEqual(['🔊'])
  })

  it('a descrição traz o número exato', () => {
    expect(dj(1)[0].descricao).toBe('1 música tocada no Espaço Livre')
    expect(dj(12)[0].descricao).toBe('12 músicas tocadas no Espaço Livre')
  })
})
