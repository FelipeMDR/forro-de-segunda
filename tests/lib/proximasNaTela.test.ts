import { describe, expect, it } from 'vitest'
import { proximasNaTela } from '../../src/lib/filaMusica'
import type { PedidoMusica, PedidoNaFila, StatusPedido } from '../../src/lib/types'

const AGORA = new Date('2026-10-13T01:00:00.000Z')
const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString()

const pedido = (
  id: string,
  status: StatusPedido,
  enviado_em: string | null = null,
): PedidoMusica => ({
  id,
  noite: '2026-10-12',
  user_id: `u-${id}`,
  nome: `Pessoa ${id}`,
  avatar_url: null,
  uri: `spotify:track:${id}`,
  titulo: `Música ${id}`,
  artista: 'Artista',
  capa_url: null,
  duracao_ms: 180_000,
  pedido_em: minutosAtras(30),
  status,
  enviado_em,
})
const naFila = (id: string, posicao: number): PedidoNaFila => ({
  ...pedido(id, 'esperando'),
  rodada: posicao,
  posicao,
})
const resumo = (l: ReturnType<typeof proximasNaTela>) =>
  l.map((i) => [i.pedido.id, i.posicao, i.naFilaDoSpotify])

describe('proximasNaTela', () => {
  it('sem pedido no Spotify, é a fila do rodízio como está', () => {
    const fila = [naFila('a', 1), naFila('b', 2)]
    expect(resumo(proximasNaTela([...fila], fila, null, AGORA))).toEqual([
      ['a', 1, false],
      ['b', 2, false],
    ])
  })

  it('o pedido que já foi para a fila do Spotify continua sendo o próximo', () => {
    const fila = [naFila('a', 1), naFila('b', 2)]
    const enviado = pedido('x', 'enviado', minutosAtras(1))
    expect(resumo(proximasNaTela([enviado, ...fila], fila, null, AGORA))).toEqual([
      ['x', 1, true],
      ['a', 2, false],
      ['b', 3, false],
    ])
  })

  it('o que está tocando agora sai da lista de próximas', () => {
    const fila = [naFila('a', 1)]
    const tocando = pedido('x', 'enviado', minutosAtras(2))
    expect(resumo(proximasNaTela([tocando, ...fila], fila, 'x', AGORA))).toEqual([['a', 1, false]])
  })

  it('pedido pulado no Spotify (enviado há mais de 15 min) não aparece como próximo', () => {
    const fila = [naFila('a', 1)]
    const pulado = pedido('x', 'enviado', minutosAtras(20))
    expect(resumo(proximasNaTela([pulado, ...fila], fila, null, AGORA))).toEqual([['a', 1, false]])
  })

  it('com dois enviados, só o mais recente está na fila do Spotify', () => {
    const fila = [naFila('a', 1)]
    const velho = pedido('v', 'enviado', minutosAtras(10))
    const novo = pedido('n', 'enviado', minutosAtras(1))
    expect(resumo(proximasNaTela([velho, novo, ...fila], fila, null, AGORA))).toEqual([
      ['n', 1, true],
      ['a', 2, false],
    ])
  })

  it('tocados e cancelados nunca aparecem', () => {
    const fila = [naFila('a', 1)]
    const lista = [pedido('t', 'tocou', minutosAtras(5)), pedido('c', 'cancelado'), ...fila]
    expect(resumo(proximasNaTela(lista, fila, null, AGORA))).toEqual([['a', 1, false]])
  })
})
