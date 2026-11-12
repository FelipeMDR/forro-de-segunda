import { describe, expect, it } from 'vitest'
import { chaveVisto, proximaComemoracao } from '../../src/lib/ingressoVisto'
import type { IngressoPerfil } from '../../src/lib/types'

const ing = (
  estado: IngressoPerfil['estado'],
  id = 'd1',
  evento_data = '2026-12-05',
): IngressoPerfil => ({
  desafio_id: id,
  titulo: 'Forró na Rep',
  estado,
  emoji: '🎟️',
  titulo_distintivo: 'Ingresso garantido',
  desde: null,
  evento_data,
})

const nenhumVisto = () => false
// Uma semana antes da festa de 05/12/2026
const AGORA = new Date(2026, 10, 28, 12, 0)

describe('chaveVisto', () => {
  it('une desafio e estado', () => {
    expect(chaveVisto(ing('garantido', 'x'))).toBe('ingresso-visto:x:garantido')
  })
})

describe('proximaComemoracao', () => {
  it('devolve null quando não há ingressos', () => {
    expect(proximaComemoracao([], nenhumVisto, AGORA)).toBeNull()
  })

  it('devolve o garantido ainda não visto', () => {
    const g = ing('garantido')
    expect(proximaComemoracao([g], nenhumVisto, AGORA)).toBe(g)
  })

  it('prefere presença a garantido quando nenhum foi visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    expect(proximaComemoracao([g, p], nenhumVisto, AGORA)).toBe(p)
  })

  it('devolve null quando tudo já foi visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    expect(proximaComemoracao([g, p], () => true, AGORA)).toBeNull()
  })

  it('mostra a presença mesmo com o garantido já visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    const vistos = new Set([chaveVisto(g)])
    expect(proximaComemoracao([g, p], (c) => vistos.has(c), AGORA)).toBe(p)
  })

  it('comemora até 30 dias depois da festa', () => {
    const p = ing('presenca')
    expect(proximaComemoracao([p], nenhumVisto, new Date(2027, 0, 4, 23, 0))).toBe(p)
  })

  it('edição de mais de 30 dias atrás não volta num aparelho novo', () => {
    const p = ing('presenca')
    expect(proximaComemoracao([p], nenhumVisto, new Date(2027, 0, 5, 12, 0))).toBeNull()
  })

  it('pula a edição antiga e comemora a recente', () => {
    const antiga = ing('presenca', 'velha', '2025-12-06')
    const nova = ing('garantido', 'nova')
    expect(proximaComemoracao([antiga, nova], nenhumVisto, AGORA)).toBe(nova)
  })
})
