import { diasDistintos, toISODate } from './dates'
import { emojiCargo } from './types'
import type { AgendaEvent, Badge, TurmaMembro } from './types'

/**
 * Distintivos do perfil vêm de duas fontes: os DERIVADOS automaticamente
 * dos dados (turma, cargo, presença, eventos) e os PERSONALIZADOS, que a
 * organização cria e concede manualmente (ver DistintivoDef) — inclusive
 * pra reconhecer o topo do ranking de um desafio, já que não existe mais
 * um distintivo automático de "campeão".
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
  cargos?: string[]
  /** Distintivos personalizados já concedidos a essa pessoa. */
  distintivosCustom?: Badge[]
  checkinDates: Date[]
  events: AgendaEvent[]
}): Badge[] {
  const badges: Badge[] = []

  // 0. Cargos no projeto — vêm primeiro, é o reconhecimento mais forte
  for (const cargo of input.cargos ?? []) {
    badges.push({
      id: `cargo-${cargo}`,
      emoji: emojiCargo(cargo),
      titulo: cargo,
      descricao: 'Cargo no Forró de Segunda',
    })
  }

  // 0.5 Distintivos personalizados — concedidos manualmente pela
  // organização, por qualquer motivo (não só vencer um desafio)
  for (const b of input.distintivosCustom ?? []) {
    badges.push(b)
  }

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
        // Texto neutro: o mesmo distintivo aparece no perfil dos outros
        descricao: `Presença em ${total} ${total === 1 ? 'dia' : 'dias'}`,
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

  return badges
}
