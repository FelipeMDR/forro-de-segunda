import { describe, expect, it } from 'vitest'
import {
  DIVULGACOES,
  cardOculto,
  criarOcultosDaSessao,
  divulgacoesNoAr,
} from '../../src/lib/divulgacao'

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

describe('cardOculto', () => {
  const noAr = divulgacoesNoAr(new Date('2026-11-16T12:00:00-03:00'))

  it('aparece enquanto houver oferta que a pessoa não fechou', () => {
    expect(cardOculto(noAr, [])).toBe(false)
    expect(cardOculto(noAr, ['forro-na-rep-2026-12'])).toBe(false)
  })

  it('some quando todas as ofertas no ar foram fechadas', () => {
    expect(cardOculto(noAr, ['forro-na-rep-2026-12', 'workshop-2026-12'])).toBe(true)
  })
})

describe('ocultos da sessão (o × vale até abrir o app de novo)', () => {
  const MIN = 60 * 1000

  it('fechar esconde e avisa quem está ouvindo', () => {
    const s = criarOcultosDaSessao(10 * MIN)
    let avisos = 0
    s.assinar(() => avisos++)
    s.fechar(['a', 'b'])
    s.fechar(['a'])
    expect(s.ler()).toEqual(['a', 'b'])
    expect(avisos).toBe(2)
  })

  it('olhar outro app e voltar logo não traz o card de volta', () => {
    const s = criarOcultosDaSessao(10 * MIN)
    s.fechar(['a'])
    s.foiParaOFundo(0)
    s.voltou(9 * MIN)
    expect(s.ler()).toEqual(['a'])
  })

  it('voltar depois de muito tempo no fundo conta como abrir o app de novo', () => {
    const s = criarOcultosDaSessao(10 * MIN)
    let avisos = 0
    s.fechar(['a'])
    s.assinar(() => avisos++)
    s.foiParaOFundo(0)
    s.voltou(10 * MIN)
    expect(s.ler()).toEqual([])
    expect(avisos).toBe(1)
  })

  it('cada sessão começa com tudo visível', () => {
    criarOcultosDaSessao().fechar(['a'])
    expect(criarOcultosDaSessao().ler()).toEqual([])
  })
})
