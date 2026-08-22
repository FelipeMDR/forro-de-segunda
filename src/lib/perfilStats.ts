import type { ForroApi } from './api'
import { computeBadges } from './badges'
import {
  computeStreak,
  diasDistintos,
  diasSuspensos,
  mapaAberturas,
} from './dates'
import { datasDePresenca } from './presenca'
import type {
  AberturaAntecipada,
  Badge,
  Challenge,
  Feriado,
  TurmaMembro,
} from './types'

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
  const [
    checkins,
    nDesafios,
    distintivosCustom,
    parceiros,
    desafios,
    feriados,
    aberturas,
  ] = await Promise.all([
    api.checkinsDe(userId),
    api.contarDesafios(userId),
    api.distintivosDe(userId),
    // Sem a migração 016 a tabela não existe — o perfil vale sem isso
    api.parceirosDe(userId).catch(() => []),
    // Presença agora depende dos desafios (ver `lib/presenca.ts`): é o
    // que separa quem esteve no forró de quem postou uma foto em casa.
    api.listChallenges().catch(() => [] as Challenge[]),
    api.listFeriados().catch(() => [] as Feriado[]),
    api.listAberturas().catch(() => [] as AberturaAntecipada[]),
  ])

  // Uma noite só entra na conta se a foto marcou ponto em algum desafio
  // rodando na hora. Vale para os três números derivados de presença:
  // o contador, a sequência de semanas e os distintivos de presença —
  // se um deles usasse os check-ins crus, o perfil se contradiria.
  const datas = datasDePresenca(checkins, {
    desafios,
    suspensos: diasSuspensos(feriados),
    aberturas: mapaAberturas(aberturas),
  })

  return {
    stats: {
      streak: computeStreak(datas),
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
