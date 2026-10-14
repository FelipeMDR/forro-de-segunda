import { diasDistintos, toISODate } from './dates'
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

/** Quanto falta do marco alcançado até o próximo (sem próximo: nada). */
function progressoAte(
  marcos: Marco[],
  valor: number,
): Badge['progresso'] | undefined {
  const proximo = marcos.find((m) => m[0] > valor)
  if (!proximo) return undefined
  const anterior = [...marcos].reverse().find((m) => m[0] <= valor)
  const base = anterior?.[0] ?? 0
  return {
    atual: valor - base,
    meta: proximo[0] - base,
    rotulo: `faltam ${proximo[0] - valor} para ${proximo[1]} ${proximo[0]}`,
  }
}

/** Todos os níveis de um marco, para a trilha do detalhe. */
function trilhaDe(marcos: Marco[], valor: number, unidade: string): Badge['trilha'] {
  return {
    marcos: marcos.map(([minimo, emoji, titulo]) => ({ minimo, emoji, titulo })),
    valor,
    unidade,
  }
}

/**
 * Em que dia o marco caiu: o `minimo`-ésimo das datas em ordem. Sem
 * datas suficientes (dados antigos, sem `primeira`), fica sem data.
 */
function diaDoMarco(datas: string[], minimo: number): string | undefined {
  return [...datas].sort()[minimo - 1]
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

/**
 * DJ do Espaço Livre: pedidos que DE FATO tocaram (o loop viu tocando),
 * não os que ficaram esperando quando a fila fechou. 🪩 já é do
 * rodízio, por isso o último nível é 🔊.
 */
const MARCOS_DJ: Marco[] = [
  [1, '🎵', 'Primeira música tocada'],
  [10, '🎶', '10 músicas tocadas'],
  [25, '🎧', '25 músicas tocadas'],
  [50, '🔊', '50 músicas tocadas'],
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
  /**
   * Primeira noite com cada um desses parceiros ("AAAA-MM-DD") — é
   * dela que sai a data em que cada marco de rodízio foi alcançado.
   */
  primeirasNoites?: string[]
  /** Pedidos de música que tocaram no Espaço Livre (migração 029). */
  musicasTocadas?: number
}): Badge[] {
  const badges: Badge[] = []

  // 0. Cargos no projeto — vêm primeiro, é o reconhecimento mais forte
  for (const cargo of input.cargos ?? []) {
    badges.push({
      id: `cargo-${cargo}`,
      emoji: emojiCargo(cargo),
      titulo: cargo,
      descricao: 'Cargo no Forró de Segunda',
      tipo: 'Cargo',
      regra: 'Dado pela organização a quem tem um papel no projeto. Aparece primeiro no perfil.',
    })
  }

  // 0.5 Distintivos personalizados — concedidos manualmente pela
  // organização, por qualquer motivo (não só vencer um desafio)
  for (const b of input.distintivosCustom ?? []) {
    badges.push({
      tipo: 'Distintivo especial',
      regra: 'Concedido à mão pela organização — não sai de nenhuma conta automática.',
      ...b,
    })
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
      tipo: 'Turma',
      regra: 'Vem da turma e da função do semestre. Muda junto quando a turma ou a função mudar.',
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
      progresso: progressoAte(MARCOS_PRESENCA, total),
      tipo: 'Presença',
      regra:
        'Conta dias, não fotos: vários check-ins na mesma noite valem uma presença só, igual ao ranking. Só entra a noite em que o check-in valeu num desafio.',
      alcancadoEm: diaDoMarco(
        [...new Set(input.checkinDates.map((d) => toISODate(d)))],
        minimo,
      ),
      trilha: trilhaDe(MARCOS_PRESENCA, total, total === 1 ? 'dia' : 'dias'),
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
      progresso: progressoAte(MARCOS_RODIZIO, parceiros),
      tipo: 'Rodízio',
      regra:
        'Conta pessoas diferentes, não danças. Só entra a dupla confirmada pelos dois lados.',
      alcancadoEm: diaDoMarco(input.primeirasNoites ?? [], minimo),
      trilha: trilhaDe(MARCOS_RODIZIO, parceiros, parceiros === 1 ? 'pessoa' : 'pessoas'),
    })
  }

  // 2.6 DJ do Espaço Livre — músicas pedidas que tocaram
  const tocadas = input.musicasTocadas ?? 0
  const dj = marcoAlcancado(MARCOS_DJ, tocadas)
  if (dj) {
    const [minimo, emoji, titulo] = dj
    badges.push({
      id: `dj-${minimo}`,
      emoji,
      titulo,
      descricao: `${tocadas} ${
        tocadas === 1 ? 'música tocada' : 'músicas tocadas'
      } no Espaço Livre`,
      progresso: progressoAte(MARCOS_DJ, tocadas),
      tipo: 'Espaço Livre',
      regra:
        'Conta os pedidos que de fato tocaram no Espaço Livre, não os que ficaram na fila quando ela fechou.',
      trilha: trilhaDe(MARCOS_DJ, tocadas, tocadas === 1 ? 'música' : 'músicas'),
    })
  }

  return badges
}
