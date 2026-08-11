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
 * Rótulo "1º/2º semestre de AAAA" a partir de quando o período
 * REALMENTE começou — e não do calendário civil. `inicio` normalmente
 * vem do último "Encerrar semestre" (ver `RetrospectivaPage`), então o
 * rótulo já reflete o semestre de verdade do projeto, seja lá quando
 * ele começar.
 */
export function rotuloDoSemestre(inicio: Date): string {
  const primeiro = inicio.getMonth() < 6
  return `${primeiro ? '1º' : '2º'} semestre de ${inicio.getFullYear()}`
}

export function montarRetrospectiva(
  checkins: CheckinComReacoes[],
  parceiros: ParceiroDanca[],
  inicio: Date,
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
    desde: inicio.toISOString(),
    rotuloPeriodo: rotuloDoSemestre(inicio),
    presencas: diasDistintos(datas),
    streak: computeStreak(datas, agora),
    parceiros: parceiros.length,
    reacoesRecebidas: checkins.reduce((s, c) => s + c.reacoes, 0),
    destaque: destaque && destaque.reacoes > 0 ? destaque : null,
    parceiroTop: parceiros[0] ?? null,
  }
}

/**
 * Frase de fechamento — prioriza o que mais se destacou NESSA pessoa
 * (a foto que bombou, a dupla que se formou) em vez de só bater faixas
 * genéricas de presença. Sempre que possível usa um número ou um nome
 * de verdade, para não soar copiada e colada de um card para o outro.
 */
export function fraseDaRetrospectiva(r: Retrospectiva): string {
  if (r.presencas === 0) return 'Bora pro forró no próximo semestre 💃'

  if (r.destaque && r.destaque.reacoes >= 5) {
    return `Sua foto bombou: ${r.destaque.reacoes} reações 🔥`
  }

  if (r.parceiroTop && r.parceiroTop.noites >= 5) {
    const primeiroNome = r.parceiroTop.nome.split(/\s+/)[0]
    return `Você e ${primeiroNome} formaram a dupla do semestre 💞`
  }

  if (r.parceiros >= 10) return 'Você rodou a pista inteira — que rodízio! 🪩'

  if (r.streak >= 8) return `${r.streak} semanas seguidas sem faltar 🔥`

  if (r.presencas >= 20) return `${r.presencas} noites de forró — respeito! 🎶`

  return `${r.presencas} ${
    r.presencas === 1 ? 'noite dançada' : 'noites dançadas'
  } nesse semestre 🪗`
}
