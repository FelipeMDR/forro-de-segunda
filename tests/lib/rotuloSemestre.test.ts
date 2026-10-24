import { describe, expect, it } from 'vitest'
import { inicioDoSemestreEncerrado, rotuloDoSemestre } from '../../src/lib/retrospectiva'

const dia = (iso: string) => new Date(`${iso}T12:00:00`)

describe('rotuloDoSemestre', () => {
  it('começo no 1º semestre do ano', () => {
    expect(rotuloDoSemestre(dia('2026-03-02'))).toBe('1º semestre de 2026')
  })

  it('começo no meio do ano é o 2º semestre, mesmo que o 1º feche em julho', () => {
    expect(rotuloDoSemestre(dia('2026-07-20'))).toBe('2º semestre de 2026')
  })

  it('encerrado em dezembro: o semestre que começa ali é o 1º do ano seguinte', () => {
    expect(rotuloDoSemestre(dia('2026-12-14'))).toBe('1º semestre de 2027')
    expect(rotuloDoSemestre(dia('2026-11-30'))).toBe('1º semestre de 2027')
  })
})

describe('inicioDoSemestreEncerrado', () => {
  it('vai do penúltimo encerramento até o último', () => {
    expect(
      inicioDoSemestreEncerrado(
        ['2026-07-20T22:00:00Z', '2026-12-14T22:00:00Z'],
        '2026-03-01T00:00:00Z',
      ),
    ).toBe('2026-07-20T22:00:00Z')
  })

  it('primeiro encerramento da história: conta desde a criação da conta', () => {
    expect(
      inicioDoSemestreEncerrado(['2026-12-14T22:00:00Z'], '2026-08-03T00:00:00Z'),
    ).toBe('2026-08-03T00:00:00Z')
  })

  it('sem conta nem histórico, conta tudo', () => {
    expect(inicioDoSemestreEncerrado([], null)).toBe(new Date(0).toISOString())
  })
})
