import { challengePhase, diasDistintos, toISODate } from './dates'
import type {
  AgendaEvent,
  Badge,
  Challenge,
  RankingEntry,
  TurmaMembro,
} from './types'

/**
 * Sistema de distintivos: tudo é DERIVADO dos dados existentes
 * (turmas, check-ins, desafios encerrados e eventos) — nada precisa
 * ser armazenado nem concedido manualmente.
 */

const MARCOS_PRESENCA: Array<[number, string, string]> = [
  [1, '👣', 'Primeiro check-in'],
  [10, '🥉', '10 presenças'],
  [25, '🥈', '25 presenças'],
  [50, '🥇', '50 presenças'],
  [100, '💎', '100 presenças'],
]

export function computeBadges(input: {
  userId: string
  turmas: TurmaMembro[]
  checkinDates: Date[]
  /** Desafios já carregados (qualquer fase). */
  challenges: Challenge[]
  /** Rankings dos desafios ENCERRADOS (id do desafio → ranking). */
  rankings: Map<string, RankingEntry[]>
  events: AgendaEvent[]
}): Badge[] {
  const badges: Badge[] = []

  // 1. Turma e função na dança (ex.: "Condutor(a) · Avançado")
  for (const m of input.turmas) {
    const emoji =
      m.papel_danca === 'Condutor(a)'
        ? '🕺'
        : m.papel_danca === 'Conduzido(a)'
          ? '💃'
          : '🎓'
    badges.push({
      id: `turma-${m.turma}-${m.papel_danca ?? ''}`,
      emoji,
      titulo: m.papel_danca ? `${m.papel_danca} ${m.turma}` : `Turma ${m.turma}`,
      descricao: 'Função e turma no semestre',
    })
  }

  // 2. Marcos de presença — contam DIAS, não fotos (várias fotos no
  // mesmo dia valem uma presença, igual ao ranking)
  const total = diasDistintos(input.checkinDates)
  for (const [minimo, emoji, titulo] of MARCOS_PRESENCA) {
    if (total >= minimo) {
      badges.push({
        id: `presenca-${minimo}`,
        emoji,
        titulo,
        descricao: `Você já esteve presente em ${total} ${
          total === 1 ? 'dia' : 'dias'
        }`,
      })
    }
  }

  // 3. Presença em eventos (check-in no dia de um evento de data única)
  const diasComCheckin = new Set(input.checkinDates.map((d) => toISODate(d)))
  for (const e of input.events) {
    if (e.data && diasComCheckin.has(e.data)) {
      badges.push({
        id: `evento-${e.id}`,
        emoji: '🎉',
        titulo: e.titulo,
        descricao: 'Presença confirmada no evento',
      })
    }
  }

  // 4. Campeão(ã) de desafios encerrados (empates no topo também contam)
  for (const c of input.challenges) {
    if (challengePhase(c) !== 'encerrado') continue
    const ranking = input.rankings.get(c.id)
    if (!ranking || ranking.length === 0) continue
    const topo = ranking[0].pontos
    if (topo <= 0) continue
    const venci = ranking.some(
      (r) => r.user_id === input.userId && r.pontos === topo,
    )
    if (venci) {
      badges.push({
        id: `campeao-${c.id}`,
        emoji: '🏆',
        titulo: `Campeão(ã) — ${c.titulo}`,
        descricao: `Venceu com ${topo} ${topo === 1 ? 'presença' : 'presenças'}`,
      })
    }
  }

  return badges
}
