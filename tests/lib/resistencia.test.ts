import { describe, expect, it } from 'vitest'
import {
  AVISO_ANTES_MS,
  avisosCruzados,
  marcarMomento,
  minutoSegundo,
  momentosDeTroca,
  PROTEGE_ANTES_MS,
  PROTEGE_DEPOIS_MS,
} from '../../src/lib/resistencia'
import { playerAgora } from '../../supabase/functions/_shared/djPuro'

const MIN = 60_000

describe('momentosDeTroca', () => {
  it('divide a música em partes iguais', () => {
    expect(momentosDeTroca(3 * MIN, 3)).toEqual([MIN, 2 * MIN])
    expect(momentosDeTroca(4 * MIN, 4)).toEqual([MIN, 2 * MIN, 3 * MIN])
  })

  it('sem troca com 1 parceiro ou música curta demais', () => {
    expect(momentosDeTroca(3 * MIN, 1)).toEqual([])
    expect(momentosDeTroca(30_000, 3)).toEqual([])
  })

  it('foge de um momento marcado para a borda mais próxima', () => {
    // A divisa ideal (1:00) cai 3 s antes da pausa marcada em 1:03
    const [t] = momentosDeTroca(3 * MIN, 3, [63_000])
    expect(t).toBe(63_000 - PROTEGE_ANTES_MS)
    // Logo depois do momento, a troca vai para depois dele
    const [u] = momentosDeTroca(3 * MIN, 3, [58_000])
    expect(u).toBe(58_000 + PROTEGE_DEPOIS_MS)
  })

  it('nunca deixa o "voltou pra roda" cair em cima do momento', () => {
    const marca = 61_000
    for (const t of momentosDeTroca(3 * MIN, 3, [marca])) {
      const voltou = t - AVISO_ANTES_MS
      expect(voltou > marca - 6_000 && voltou < marca + 3_000).toBe(false)
    }
  })

  it('pula a troca se não houver lugar, em vez de trocar em cima da pausa', () => {
    // Momentos colados cobrindo o meio inteiro de uma música curta
    const marcas = [25_000, 35_000, 45_000, 55_000]
    expect(momentosDeTroca(75_000, 2, marcas)).toEqual([])
  })

  it('não cola duas trocas', () => {
    const trocas = momentosDeTroca(3 * MIN, 4, [50_000])
    for (let i = 1; i < trocas.length; i++) {
      expect(trocas[i] - trocas[i - 1]).toBeGreaterThanOrEqual(20_000)
    }
  })
})

describe('avisosCruzados', () => {
  const trocas = [MIN]

  it('toca "voltou pra roda" antes e "trocou" na divisa', () => {
    expect(avisosCruzados(trocas, 55_800, 56_100)).toEqual([{ fala: 'voltou', troca: 0 }])
    expect(avisosCruzados(trocas, 59_900, 60_200)).toEqual([{ fala: 'trocou', troca: 0 }])
  })

  it('não toca nada fora das divisas', () => {
    expect(avisosCruzados(trocas, 30_000, 30_250)).toEqual([])
  })

  it('não toca aviso velho depois de um pulo na música', () => {
    expect(avisosCruzados(trocas, 10_000, 90_000)).toEqual([])
  })

  it('não toca nada quando a música volta (outra música, ou voltaram ela)', () => {
    expect(avisosCruzados(trocas, 61_000, 5_000)).toEqual([])
  })
})

describe('marcarMomento', () => {
  it('guarda em ordem e ignora o toque repetido no mesmo momento', () => {
    expect(marcarMomento([90_000], 30_000)).toEqual([30_000, 90_000])
    expect(marcarMomento([30_000], 31_500)).toEqual([30_000])
  })
})

it('minutoSegundo', () => {
  expect(minutoSegundo(83_000)).toBe('1:23')
  expect(minutoSegundo(5_400)).toBe('0:05')
})

describe('playerAgora', () => {
  it('lê música e progresso', () => {
    const p = playerAgora({
      device: { volume_percent: 80, supports_volume: true },
      progress_ms: 12_000,
      is_playing: true,
      item: { uri: 'spotify:track:1', name: 'Xote', duration_ms: 180_000, artists: [{ name: 'A' }] },
    })
    expect(p).toMatchObject({ progresso_ms: 12_000, tocando: true })
    expect(p?.faixa?.duracao_ms).toBe(180_000)
  })

  it('pausado, sem música carregada', () => {
    expect(playerAgora({ device: {}, is_playing: false })).toEqual({
      faixa: null,
      progresso_ms: 0,
      tocando: false,
    })
  })

  it('null sem aparelho', () => {
    expect(playerAgora(null)).toBeNull()
  })
})
