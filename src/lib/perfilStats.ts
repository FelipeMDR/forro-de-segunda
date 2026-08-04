import type { ForroApi } from './api'
import { computeBadges } from './badges'
import { challengePhase, computeStreak, diasDistintos } from './dates'
import type { Badge, RankingEntry, TurmaMembro } from './types'

export interface PerfilStats {
  streak: number
  presencas: number
  desafios: number
}

/**
 * Estatísticas e distintivos de um aluno — usado tanto no próprio
 * perfil quanto no perfil público de outra pessoa.
 */
export async function carregarPerfilStats(
  api: ForroApi,
  userId: string,
  turmas: TurmaMembro[],
  cargos: string[] = [],
): Promise<{ stats: PerfilStats; badges: Badge[] }> {
  const [checkins, desafios, eventos, nDesafios] = await Promise.all([
    api.checkinsDe(userId),
    api.listChallenges(),
    api.listEvents(),
    api.contarDesafios(userId),
  ])
  const datas = checkins.map((c) => new Date(c.criado_em))

  // Rankings dos desafios encerrados, para o distintivo de campeão(ã)
  const encerrados = desafios
    .filter((c) => challengePhase(c) === 'encerrado')
    .slice(0, 8)
  const rankings = new Map<string, RankingEntry[]>()
  await Promise.all(
    encerrados.map(async (c) => {
      rankings.set(c.id, await api.getRanking(c))
    }),
  )

  return {
    stats: {
      streak: computeStreak(datas),
      // Presença = dia com check-in (mesma regra do ranking)
      presencas: diasDistintos(datas),
      desafios: nDesafios,
    },
    badges: computeBadges({
      userId,
      turmas,
      cargos,
      checkinDates: datas,
      challenges: desafios,
      rankings,
      events: eventos,
    }),
  }
}
