import { describe, expect, it } from 'vitest'
import { DIVULGACOES, divulgacoesNoAr } from '../../src/lib/divulgacao'

const ids = (agora: string) => divulgacoesNoAr(new Date(agora)).map((d) => d.id)

describe('divulgacoesNoAr', () => {
  it('mostra a festa e o workshop antes de dezembro', () => {
    expect(ids('2026-11-16T12:00:00-03:00')).toEqual([
      'forro-na-rep-2026-12',
      'workshop-2026-12',
    ])
  })

  it('a festa sai à meia-noite, quando acaba; o workshop fica até o fim do dia 6', () => {
    expect(ids('2026-12-05T23:59:00-03:00')).toHaveLength(2)
    expect(ids('2026-12-06T00:00:00-03:00')).toEqual(['workshop-2026-12'])
    expect(ids('2026-12-07T00:00:00-03:00')).toEqual([])
  })

  it('toda divulgação leva a um formulário e tem data de saída válida', () => {
    for (const d of DIVULGACOES) {
      expect(d.link).toMatch(/^https:\/\/docs\.google\.com\/forms\//)
      expect(Number.isNaN(new Date(d.ate).getTime())).toBe(false)
    }
  })
})
