import type { ForroApi } from './api'
import { computeBadges } from './badges'
import { computeStreak, diasDistintos } from './dates'
import type { Badge, TurmaMembro } from './types'

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
  const [checkins, eventos, nDesafios, distintivosCustom] = await Promise.all([
    api.checkinsDe(userId),
    api.listEvents(),
    api.contarDesafios(userId),
    api.distintivosDe(userId),
  ])
  const datas = checkins.map((c) => new Date(c.criado_em))

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
      distintivosCustom,
      checkinDates: datas,
      events: eventos,
    }),
  }
}
