import { diasDistintos } from './dates'
import { emojiCargo } from './types'
import type { Badge, TurmaMembro } from './types'

/**
 * Distintivos do perfil vêm de duas fontes: os DERIVADOS automaticamente
 * dos dados (turma, cargo, presença, rodízio) e os PERSONALIZADOS, que a
 * organização cria e concede manualmente (ver DistintivoDef) — inclusive
 * pra reconhecer o topo do ranking de um desafio, já que não existe mais
 * um distintivo automático de "campeão".
 */

/**
 * Marcos de progresso: `[mínimo, emoji, título]`, do menor para o maior.
 *
 * Só o MAIOR alcançado vira distintivo — ver `marcoAlcancado`.
 */
type Marco = [number, string, string]

/**
 * O maior marco já alcançado, ou `undefined` se nenhum foi.
 *
 * Os marcos EVOLUEM em vez de acumular: quem tem 50 presenças mostra só
 * 🥇, e não 👣 + 🥉 + 🥈 + 🥇 de uma vez. Somados, quatro versões da
 * mesma conquista enchiam a grade do perfil e empurravam para baixo o
 * que é de fato distinto — cargo, turma e os distintivos que a
 * organização concede na mão. O número exato continua na descrição.
 */
function marcoAlcancado(marcos: Marco[], valor: number): Marco | undefined {
  let alcancado: Marco | undefined
  for (const marco of marcos) {
    if (valor >= marco[0]) alcancado = marco
  }
  return alcancado
}

const MARCOS_PRESENCA: Marco[] = [
  [1, '👣', 'Primeiro check-in'],
  [10, '🥉', '10 presenças'],
  [25, '🥈', '25 presenças'],
  [50, '🥇', '50 presenças'],
  [100, '💎', '100 presenças'],
]

/**
 * Rodízio: quantas PESSOAS DIFERENTES, não quantas danças. Premiar
 * volume incentivaria dançar sempre com o mesmo par; premiar variedade
 * empurra o rodízio, que é cultura do forró — dançar com quem chegou
 * hoje, e não só com quem já se conhece.
 */
const MARCOS_RODIZIO: Marco[] = [
  [3, '🤝', 'Dançou com 3 pessoas'],
  [10, '💫', 'Dançou com 10 pessoas'],
  [25, '🌟', 'Dançou com 25 pessoas'],
  [50, '🪩', 'Dançou com 50 pessoas'],
]

export function computeBadges(input: {
  userId: string
  turmas: TurmaMembro[]
  cargos?: string[]
  /** Distintivos personalizados já concedidos a essa pessoa. */
  distintivosCustom?: Badge[]
  /**
   * As noites que CONTAM como presença — não os check-ins crus. Quem
   * chama filtra antes com `datasDePresenca` (ver `lib/presenca.ts`);
   * aqui só se conta quantas são.
   */
  checkinDates: Date[]
  /**
   * Pares confirmados pelos dois lados. Só os confirmados entram: se
   * marcação de mão única contasse, dava para inflar o próprio número
   * marcando gente que nem dançou com você.
   */
  parceiros?: number
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

  // 2. Marco de presença — conta DIAS, não fotos (várias fotos no
  // mesmo dia valem uma presença, igual ao ranking). Só o maior
  // alcançado: 🥇 substitui 🥉, não se soma a ele.
  const total = diasDistintos(input.checkinDates)
  const presenca = marcoAlcancado(MARCOS_PRESENCA, total)
  if (presenca) {
    const [minimo, emoji, titulo] = presenca
    badges.push({
      id: `presenca-${minimo}`,
      emoji,
      titulo,
      // Texto neutro: o mesmo distintivo aparece no perfil dos outros
      descricao: `Presença em ${total} ${total === 1 ? 'dia' : 'dias'}`,
    })
  }

  // 2.5 Rodízio — pessoas diferentes com quem a dupla foi confirmada
  const parceiros = input.parceiros ?? 0
  const rodizio = marcoAlcancado(MARCOS_RODIZIO, parceiros)
  if (rodizio) {
    const [minimo, emoji, titulo] = rodizio
    badges.push({
      id: `rodizio-${minimo}`,
      emoji,
      titulo,
      descricao: `${parceiros} ${
        parceiros === 1 ? 'dupla confirmada' : 'duplas confirmadas'
      }`,
    })
  }

  return badges
}
