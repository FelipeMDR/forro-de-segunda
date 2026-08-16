import type { ForroApi } from './api'
import { computeBadges } from './badges'
import { computeStreak, diasDistintos } from './dates'
import type { Badge, TurmaMembro } from './types'

export interface PerfilStats {
  streak: number
  presencas: number
  desafios: number
  /** Pessoas diferentes com dupla confirmada dos dois lados. */
  parceiros: number
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
  const [checkins, nDesafios, distintivosCustom, parceiros] =
    await Promise.all([
      api.checkinsDe(userId),
      api.contarDesafios(userId),
      api.distintivosDe(userId),
      // Sem a migração 016 a tabela não existe — o perfil vale sem isso
      api.parceirosDe(userId).catch(() => []),
    ])
  const datas = checkins.map((c) => new Date(c.criado_em))

  return {
    stats: {
      streak: computeStreak(datas),
      // Presença = dia com check-in (mesma regra do ranking)
      presencas: diasDistintos(datas),
      desafios: nDesafios,
      parceiros: parceiros.length,
    },
    badges: computeBadges({
      userId,
      turmas,
      cargos,
      distintivosCustom,
      checkinDates: datas,
      parceiros: parceiros.length,
    }),
  }
}
