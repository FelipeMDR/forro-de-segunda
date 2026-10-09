import type { StatusPedido } from './types'

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
