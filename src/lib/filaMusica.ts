import { PRAZO_PENDENTE_MS } from '../../supabase/functions/_shared/djPuro'
import type { PedidoMusica, PedidoNaFila, StatusPedido } from './types'

/**
 * A ordem do rodízio, em TS, para o modo demonstração.
 *
 * Em produção quem ordena é o banco (`fila_da_noite`, migração 029).
 * Esta é uma cópia da MESMA regra, testada com os mesmos exemplos
 * (tests/lib/filaMusica.test.ts × tests/sql/pedidosMusica.test.ts):
 *
 *   rodada  = enviados/tocados da pessoa na noite
 *             + posição do pedido entre os que ela tem esperando
 *   chegada = o primeiro pedido da pessoa na noite (sem os cancelados)
 *   ordem   = rodada, chegada, pedido_em, id
 *
 * Recebe os pedidos de UMA noite, em qualquer situação, e devolve só os
 * que estão esperando, já na ordem.
 */
export function ordenarFila<
  T extends { id: string; user_id: string; pedido_em: string; status: StatusPedido },
>(pedidos: T[]): Array<T & { rodada: number; posicao: number }> {
  const porPessoa = new Map<string, { enviados: number; chegada: string; esperando: T[] }>()
  for (const p of pedidos) {
    if (p.status === 'cancelado') continue
    const g = porPessoa.get(p.user_id) ?? { enviados: 0, chegada: p.pedido_em, esperando: [] }
    if (p.pedido_em < g.chegada) g.chegada = p.pedido_em
    if (p.status === 'enviado' || p.status === 'tocou') g.enviados++
    if (p.status === 'esperando') g.esperando.push(p)
    porPessoa.set(p.user_id, g)
  }

  const comRodada: Array<{ pedido: T; rodada: number; chegada: string }> = []
  for (const g of porPessoa.values()) {
    const meus = [...g.esperando].sort(
      (a, b) => a.pedido_em.localeCompare(b.pedido_em) || a.id.localeCompare(b.id),
    )
    meus.forEach((pedido, i) =>
      comRodada.push({ pedido, rodada: g.enviados + i + 1, chegada: g.chegada }),
    )
  }

  comRodada.sort(
    (a, b) =>
      a.rodada - b.rodada ||
      a.chegada.localeCompare(b.chegada) ||
      a.pedido.pedido_em.localeCompare(b.pedido.pedido_em) ||
      a.pedido.id.localeCompare(b.pedido.id),
  )
  return comRodada.map(({ pedido, rodada }, i) => ({ ...pedido, rodada, posicao: i + 1 }))
}

/** Uma linha da lista "Próximas" como a pessoa vê. */
export interface ItemProximas {
  pedido: PedidoMusica
  /** 1 = a próxima a tocar. */
  posicao: number
  /** Já foi mandada para a fila do Spotify (não dá mais para cancelar). */
  naFilaDoSpotify: boolean
}

/**
 * O que vai tocar, na ordem, do jeito que a pessoa espera ver.
 *
 * O rodízio (`fila_da_noite`) só conta quem ainda ESPERA a vez. Mas o
 * pedido que o loop já mandou para a fila do Spotify também não tocou:
 * para quem olha o app, ele é o próximo — e sumir da lista antes de
 * tocar parecia que tinha sido pulado. Ele entra na frente, como no
 * Spotify.
 *
 * Só o envio mais recente conta, e só por PRAZO_PENDENTE_MS: um pedido
 * pulado no Spotify fica `enviado` para sempre, e não pode passar a
 * noite anunciado como "o próximo". O que está tocando agora também sai.
 */
export function proximasNaTela(
  pedidos: PedidoMusica[],
  fila: PedidoNaFila[],
  tocandoPedidoId: string | null,
  agora: Date,
): ItemProximas[] {
  const noSpotify =
    pedidos
      .filter((p) => p.status === 'enviado' && p.id !== tocandoPedidoId && p.enviado_em)
      .sort((a, b) => (b.enviado_em ?? '').localeCompare(a.enviado_em ?? ''))[0] ?? null
  const valeAinda =
    noSpotify !== null &&
    agora.getTime() - new Date(noSpotify.enviado_em!).getTime() <= PRAZO_PENDENTE_MS

  const itens: ItemProximas[] = []
  if (valeAinda) itens.push({ pedido: noSpotify, posicao: 1, naFilaDoSpotify: true })
  for (const p of fila) {
    itens.push({ pedido: p, posicao: itens.length + 1, naFilaDoSpotify: false })
  }
  return itens
}
