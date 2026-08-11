import { computeStreak, diasDistintos } from './dates'
import type { CheckinComReacoes, ParceiroDanca } from './types'

/**
 * Retrospectiva do semestre: os números da pessoa para fechar o ciclo
 * e postar no Instagram.
 *
 * Tudo derivado do que já existe — nada é guardado. Recalcular é
 * barato e evita mais uma tabela para manter em dia.
 */
export interface Retrospectiva {
  /** Início do período considerado (ISO). */
  desde: string
  rotuloPeriodo: string
  presencas: number
  streak: number
  parceiros: number
  reacoesRecebidas: number
  /** Foto com mais reações no período. */
  destaque: CheckinComReacoes | null
  /** Com quem dançou mais noites. */
  parceiroTop: ParceiroDanca | null
}

/**
 * Começo do semestre corrente: 1º de janeiro ou 1º de julho.
 *
 * O projeto se organiza por semestre — turmas, matrícula e encerramento
 * seguem esse ciclo, então a retrospectiva segue também.
 */
export function inicioDoSemestre(agora = new Date()): Date {
  const primeiro = agora.getMonth() < 6
  return new Date(agora.getFullYear(), primeiro ? 0 : 6, 1, 0, 0, 0, 0)
}

export function rotuloDoSemestre(agora = new Date()): string {
  const primeiro = agora.getMonth() < 6
  return `${primeiro ? '1º' : '2º'} semestre de ${agora.getFullYear()}`
}

export function montarRetrospectiva(
  checkins: CheckinComReacoes[],
  parceiros: ParceiroDanca[],
  agora = new Date(),
): Retrospectiva {
  const datas = checkins.map((c) => new Date(c.criado_em))
  // Mais reações vence; empate fica com a mais recente, que é a ordem
  // em que a consulta já devolve.
  const destaque = checkins.reduce<CheckinComReacoes | null>(
    (melhor, c) => (!melhor || c.reacoes > melhor.reacoes ? c : melhor),
    null,
  )
  return {
    desde: inicioDoSemestre(agora).toISOString(),
    rotuloPeriodo: rotuloDoSemestre(agora),
    presencas: diasDistintos(datas),
    streak: computeStreak(datas, agora),
    parceiros: parceiros.length,
    reacoesRecebidas: checkins.reduce((s, c) => s + c.reacoes, 0),
    destaque: destaque && destaque.reacoes > 0 ? destaque : null,
    parceiroTop: parceiros[0] ?? null,
  }
}

/** Frase de fechamento, escolhida pelo que a pessoa mais fez. */
export function fraseDaRetrospectiva(r: Retrospectiva): string {
  if (r.presencas === 0) return 'Bora pro forró no próximo semestre 💃'
  if (r.parceiros >= 10) return 'Você rodou a pista inteira — que rodízio! 🪩'
  if (r.streak >= 8) return 'Presença de quem não falha uma segunda 🔥'
  if (r.presencas >= 20) return 'A pista já conhece seu passo 🎶'
  return 'Cada noite dessas virou história 🪗'
}
