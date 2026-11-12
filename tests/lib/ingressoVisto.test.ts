import { describe, expect, it } from 'vitest'
import { chaveVisto, proximaComemoracao } from '../../src/lib/ingressoVisto'
import type { IngressoPerfil } from '../../src/lib/types'

const ing = (estado: IngressoPerfil['estado'], id = 'd1'): IngressoPerfil => ({
  desafio_id: id,
  titulo: 'Forró na Rep',
  estado,
  emoji: '🎟️',
  titulo_distintivo: 'Ingresso garantido',
  desde: null,
})

const nenhumVisto = () => false

describe('chaveVisto', () => {
  it('une desafio e estado', () => {
    expect(chaveVisto(ing('garantido', 'x'))).toBe('ingresso-visto:x:garantido')
  })
})

describe('proximaComemoracao', () => {
  it('devolve null quando não há ingressos', () => {
    expect(proximaComemoracao([], nenhumVisto)).toBeNull()
  })

  it('devolve o garantido ainda não visto', () => {
    const g = ing('garantido')
    expect(proximaComemoracao([g], nenhumVisto)).toBe(g)
  })

  it('prefere presença a garantido quando nenhum foi visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    expect(proximaComemoracao([g, p], nenhumVisto)).toBe(p)
  })

  it('devolve null quando tudo já foi visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    expect(proximaComemoracao([g, p], () => true)).toBeNull()
  })

  it('mostra a presença mesmo com o garantido já visto', () => {
    const g = ing('garantido')
    const p = ing('presenca')
    const vistos = new Set([chaveVisto(g)])
    expect(proximaComemoracao([g, p], (c) => vistos.has(c))).toBe(p)
  })
})
