import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeBadges } from '../../src/lib/badges'
import { faixasDeHorario, periodoCurto } from '../../src/lib/horarios'
import { codigoDoSemestre } from '../../src/lib/storyRetrospectiva'
import { fimDaJanela } from '../../src/context/NoiteContext'
import type { Challenge } from '../../src/lib/types'

describe('faixasDeHorario', () => {
  it('junta dias seguidos com o mesmo horário numa faixa', () => {
    const janelas = [1, 2, 3, 4, 5].map((d) => ({
      dia_semana: d,
      hora_inicio: '19:00',
      hora_fim: '23:59',
    }))
    janelas.push({ dia_semana: 6, hora_inicio: '15:00', hora_fim: '19:00' })
    expect(faixasDeHorario(janelas)).toEqual(['Seg a Sex 19:00–23:59', 'Sáb 15:00–19:00'])
  })

  it('dois dias soltos viram "e"; a semana inteira vira "Todo dia"', () => {
    const doisDias = [1, 3].map((d) => ({ dia_semana: d, hora_inicio: '19:30', hora_fim: '21:00' }))
    expect(faixasDeHorario(doisDias)).toEqual(['Seg e Qua 19:30–21:00'])
    const semana = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      dia_semana: d,
      hora_inicio: '00:00',
      hora_fim: '23:59',
    }))
    expect(faixasDeHorario(semana)).toEqual(['Todo dia 00:00–23:59'])
  })
})

describe('periodoCurto', () => {
  it('mesmo mês mostra o mês uma vez; meses diferentes mostram os dois', () => {
    expect(periodoCurto('2026-10-01', '2026-10-31')).toBe('01 – 31 out')
    expect(periodoCurto('2026-09-28', '2026-10-04')).toBe('28 set – 04 out')
  })
})

describe('codigoDoSemestre', () => {
  it('primeiro semestre até junho, segundo a partir de julho', () => {
    expect(codigoDoSemestre(new Date('2026-03-02T12:00:00'))).toBe('2026.1')
    expect(codigoDoSemestre(new Date('2026-08-03T12:00:00'))).toBe('2026.2')
  })

  it('começo em dezembro é o 1º semestre do ano seguinte', () => {
    expect(codigoDoSemestre(new Date('2026-12-14T12:00:00'))).toBe('2027.1')
  })
})

describe('progresso dos distintivos de marco', () => {
  const presenca = (n: number) =>
    computeBadges({
      userId: 'u',
      turmas: [],
      checkinDates: Array.from({ length: n }, (_, i) => new Date(2026, 0, 1 + i, 21)),
    }).find((b) => b.id.startsWith('presenca-'))

  it('mostra quanto falta para o próximo nível', () => {
    const b = presenca(32)
    expect(b?.emoji).toBe('🥈')
    expect(b?.progresso).toEqual({ atual: 7, meta: 25, rotulo: 'faltam 18 para 🥇 50' })
  })

  it('no último nível não há progresso', () => {
    expect(presenca(120)?.progresso).toBeUndefined()
  })
})

describe('fimDaJanela', () => {
  const desafio = (janelas: Challenge['janelas']) => ({ janelas }) as Challenge

  it('devolve o fim da janela do dia', () => {
    // Segunda, 21:47
    const seg = new Date(2026, 9, 12, 21, 47)
    expect(fimDaJanela(seg, desafio([{ dia_semana: 1, hora_inicio: '19:00', hora_fim: '23:59' }]))).toBe('23:59')
    expect(fimDaJanela(seg, desafio([{ dia_semana: 2, hora_inicio: '19:00', hora_fim: '23:59' }]))).toBeNull()
  })

  it('janela que vira a noite vale na madrugada seguinte', () => {
    const terMadrugada = new Date(2026, 9, 13, 1, 10)
    expect(fimDaJanela(terMadrugada, desafio([{ dia_semana: 1, hora_inicio: '21:00', hora_fim: '02:00' }]))).toBe('02:00')
  })
})

describe('DemoApi — Modo DJ fecha sozinho (migração 034)', () => {
  function instalarLocalStorage() {
    const dados = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, String(v)),
      removeItem: (k: string) => void dados.delete(k),
      clear: () => dados.clear(),
      key: (i: number) => [...dados.keys()][i] ?? null,
      get length() {
        return dados.size
      },
    } as Storage
  }

  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T01:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('a sessão some quando passa do horário programado', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0003', 'forro123')
    await api.conectarSpotify('demo', '')
    await api.ligarModoDJ(false)
    const fecha = new Date(Date.now() + 2 * 3600_000).toISOString()
    await api.programarFechamentoDJ(fecha)
    expect((await api.sessaoDJAberta())?.fecha_em).toBe(fecha)

    vi.setSystemTime(new Date(Date.now() + 2 * 3600_000 + 1000))
    expect(await api.sessaoDJAberta()).toBeNull()
  })

  it('não aceita horário que já passou', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0003', 'forro123')
    await api.conectarSpotify('demo', '')
    await api.ligarModoDJ(false)
    await expect(
      api.programarFechamentoDJ(new Date(Date.now() - 1000).toISOString()),
    ).rejects.toThrow('já passou')
  })
})
