import type { RankingEntry } from './types'

/**
 * Colocação no padrão de competição: quem empata divide a mesma
 * posição, e as posições consumidas pelo empate são puladas.
 *
 *   Felipe 15 → 1º
 *   Nathna 15 → 1º
 *   Valentina 12 → 3º   (não 2º: duas pessoas ficaram à frente dela)
 */
export interface Colocacao {
  entrada: RankingEntry
  posicao: number
  /** Tem mais gente com essa mesma posição. */
  empatado: boolean
}

export function colocacoes(ranking: RankingEntry[]): Colocacao[] {
  const ordenado = [...ranking].sort(
    (a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome),
  )

  let posicao = 0
  let pontosAnteriores: number | null = null
  const comPosicao = ordenado.map((entrada, i) => {
    if (pontosAnteriores === null || entrada.pontos !== pontosAnteriores) {
      // Pula as posições consumidas por quem empatou acima
      posicao = i + 1
      pontosAnteriores = entrada.pontos
    }
    return { entrada, posicao }
  })

  const quantosNaPosicao = new Map<number, number>()
  for (const c of comPosicao) {
    quantosNaPosicao.set(c.posicao, (quantosNaPosicao.get(c.posicao) ?? 0) + 1)
  }
  return comPosicao.map((c) => ({
    ...c,
    empatado: (quantosNaPosicao.get(c.posicao) ?? 0) > 1,
  }))
}

/**
 * Quem está no "top N" respeitando empate — pode devolver mais de N
 * pessoas. Se três empatam em 1º, o top 3 são essas três; se duas
 * empatam em 3º, o top 3 tem quatro pessoas. Cortar no índice puro
 * escolheria uma delas por ordem alfabética, o que seria arbitrário
 * na hora de entregar um distintivo.
 */
export function ateAPosicao(ranking: RankingEntry[], n: number): RankingEntry[] {
  return colocacoes(ranking)
    .filter((c) => c.posicao <= n)
    .map((c) => c.entrada)
}
