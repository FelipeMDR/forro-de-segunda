import { describe, expect, it } from 'vitest'
import { ordenarFila } from '../../src/lib/filaMusica'
import type { StatusPedido } from '../../src/lib/types'

const as = (hhmm: string) => `2026-10-13T${hhmm}:00.000Z`
let n = 0
const p = (user_id: string, uri: string, hora: string, status: StatusPedido = 'esperando') => ({
  id: `id-${String(++n).padStart(3, '0')}`,
  user_id,
  uri,
  pedido_em: as(hora),
  status,
})
const uris = (l: { uri: string }[]) => l.map((x) => x.uri)

describe('ordenarFila (mesma regra de fila_da_noite)', () => {
  it('quem chega com 1 passa na frente da 2ª de quem pediu 20', () => {
    const lista = [p('A', 'a1', '00:00', 'tocou')]
    for (let i = 2; i <= 20; i++) lista.push(p('A', `a${i}`, `00:${String(i).padStart(2, '0')}`))
    lista.push(p('B', 'b1', '00:30'))
    const f = ordenarFila(lista)
    expect(uris(f).slice(0, 3)).toEqual(['b1', 'a2', 'a3'])
    expect(f[0]).toMatchObject({ rodada: 1, posicao: 1 })
    expect(f[1]).toMatchObject({ rodada: 2, posicao: 2 })
  })

  it('quem chega depois de A tocar 15 entra na frente da 16ª', () => {
    const lista = []
    for (let i = 1; i <= 15; i++) lista.push(p('A', `a${i}`, `00:${String(i).padStart(2, '0')}`, 'tocou'))
    lista.push(p('A', 'a16', '00:16'), p('C', 'c1', '02:00'))
    expect(uris(ordenarFila(lista))).toEqual(['c1', 'a16'])
  })

  it('mesma rodada: quem fez o primeiro pedido antes', () => {
    expect(uris(ordenarFila([p('B', 'b1', '00:00'), p('A', 'a1', '00:05'), p('B', 'b2', '00:10')]))).toEqual([
      'b1',
      'a1',
      'b2',
    ])
  })

  it('cancelado sai da conta da rodada e da chegada', () => {
    const f = ordenarFila([
      p('A', 'a1', '00:00', 'cancelado'),
      p('A', 'a2', '00:01'),
      p('B', 'b1', '00:02'),
      p('B', 'b2', '00:03'),
    ])
    expect(f.map((x) => [x.uri, x.rodada, x.posicao])).toEqual([
      ['a2', 1, 1],
      ['b1', 1, 2],
      ['b2', 2, 3],
    ])
  })

  it('quem já tocou 1 e pede outra mais tarde entra na rodada 2', () => {
    const f = ordenarFila([
      p('A', 'a1', '00:00', 'tocou'),
      p('A', 'a2', '00:01', 'enviado'),
      p('A', 'a3', '00:02'),
      p('B', 'b1', '00:03', 'tocou'),
      p('B', 'b2', '02:00'),
    ])
    expect(f.map((x) => [x.uri, x.rodada])).toEqual([
      ['b2', 2],
      ['a3', 3],
    ])
  })

  it('não altera a lista recebida', () => {
    const lista = [p('B', 'b1', '00:05'), p('A', 'a1', '00:00')]
    const copia = JSON.stringify(lista)
    ordenarFila(lista)
    expect(JSON.stringify(lista)).toBe(copia)
  })
})
