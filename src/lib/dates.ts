import type { AgendaEvent, Challenge } from './types'

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Segunda-feira (00:00) da semana da data — âncora do streak semanal. */
export function mondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() + 6) % 7 // 0 se segunda
  return addDays(d, -diff)
}

/**
 * Streak: semanas consecutivas (seg–dom) com pelo menos um check-in.
 * A semana atual ainda em andamento não quebra a sequência.
 */
export function computeStreak(checkinDates: Date[], now = new Date()): number {
  const weeks = new Set(checkinDates.map((d) => toISODate(mondayOf(d))))
  let cursor = mondayOf(now)
  if (!weeks.has(toISODate(cursor))) cursor = addDays(cursor, -7)
  let streak = 0
  while (weeks.has(toISODate(cursor))) {
    streak++
    cursor = addDays(cursor, -7)
  }
  return streak
}

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** True se o instante `d` cai na janela do desafio (período + dia + horário). */
export function contaParaDesafio(d: Date, c: Challenge): boolean {
  const dia = toISODate(d)
  if (dia < c.data_inicio || dia > c.data_fim) return false
  if (!c.dias_semana.includes(d.getDay())) return false
  const minutos = d.getHours() * 60 + d.getMinutes()
  return minutos >= parseTime(c.hora_inicio) && minutos <= parseTime(c.hora_fim)
}

/** Desafios para os quais um check-in feito em `criadoEm` marca ponto. */
export function desafiosQueContam(
  criadoEm: string | Date,
  desafios: Challenge[],
): Challenge[] {
  const d = typeof criadoEm === 'string' ? new Date(criadoEm) : criadoEm
  return desafios.filter((c) => contaParaDesafio(d, c))
}

/** Próxima ocorrência de um evento da agenda; null se já passou. */
export function proximaOcorrencia(
  e: AgendaEvent,
  now = new Date(),
): Date | null {
  const hora = e.hora ?? '00:00'
  const [h, m] = hora.split(':').map(Number)
  if (e.data) {
    const d = new Date(`${e.data}T12:00:00`)
    d.setHours(h || 0, m || 0, 0, 0)
    // Eventos de data única aparecem até o fim do dia
    const fimDoDia = new Date(`${e.data}T23:59:59`)
    return fimDoDia.getTime() >= now.getTime() ? d : null
  }
  if (e.dia_semana === null) return null
  const d = new Date(now)
  d.setHours(h || 0, m || 0, 0, 0)
  let diff = (e.dia_semana - now.getDay() + 7) % 7
  if (diff === 0 && d.getTime() < now.getTime()) diff = 7
  return addDays(d, diff)
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatRelative(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const diffMs = then.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffH = Math.round(diffMin / 60)
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour')
  const diffD = Math.round(diffH / 24)
  if (Math.abs(diffD) < 7) return rtf.format(diffD, 'day')
  return then.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

export function formatDate(iso: string): string {
  // Datas "YYYY-MM-DD" são interpretadas como UTC pelo Date; força meio-dia local
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}

/** Dias restantes até data_fim (inclusive); negativo se já encerrou. */
export function daysLeft(dataFim: string, now = new Date()): number {
  const end = new Date(`${dataFim}T23:59:59`)
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
}

export function challengePhase(
  c: { data_inicio: string; data_fim: string },
  now = new Date(),
): 'futuro' | 'ativo' | 'encerrado' {
  const today = toISODate(now)
  if (today < c.data_inicio) return 'futuro'
  if (today > c.data_fim) return 'encerrado'
  return 'ativo'
}
