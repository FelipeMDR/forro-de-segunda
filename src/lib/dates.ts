import type { AgendaEvent, Challenge, Feriado } from './types'

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

/**
 * Dia (ISO) em que começou a janela do desafio que contém o instante
 * `d`, ou null se `d` não cai em nenhuma janela.
 *
 * Suporta janelas que cruzam a meia-noite (ex.: 21:00–02:00, quando
 * hora_fim < hora_inicio): a janela "pertence" ao dia em que começou,
 * mesmo que o check-in tenha sido feito de madrugada no dia seguinte.
 * É essa data — não a do relógio no momento do check-in — que deve ser
 * usada para checar o período do desafio, o dia da semana e o limite de
 * 1 ponto por janela.
 */
export function janelaDoCheckin(d: Date, c: Challenge): string | null {
  const minutos = d.getHours() * 60 + d.getMinutes()
  const inicio = parseTime(c.hora_inicio)
  const fim = parseTime(c.hora_fim)
  const overnight = fim < inicio
  const dentroDoPeriodo = (dia: string) =>
    dia >= c.data_inicio && dia <= c.data_fim

  if (!overnight) {
    if (minutos < inicio || minutos > fim) return null
    const dia = toISODate(d)
    if (!dentroDoPeriodo(dia)) return null
    if (!c.dias_semana.includes(d.getDay())) return null
    return dia
  }

  // Ponta da noite: check-in no próprio dia em que a janela abre
  if (minutos >= inicio) {
    const dia = toISODate(d)
    if (!dentroDoPeriodo(dia)) return null
    if (!c.dias_semana.includes(d.getDay())) return null
    return dia
  }
  // Ponta da manhã seguinte: ainda conta para o dia anterior
  if (minutos <= fim) {
    const anterior = addDays(d, -1)
    const dia = toISODate(anterior)
    if (!dentroDoPeriodo(dia)) return null
    if (!c.dias_semana.includes(anterior.getDay())) return null
    return dia
  }
  return null
}

/** True se o instante `d` cai na janela do desafio (período + dia + horário). */
export function contaParaDesafio(d: Date, c: Challenge): boolean {
  return janelaDoCheckin(d, c) !== null
}

/** Desafios para os quais um check-in feito em `criadoEm` marca ponto. */
export function desafiosQueContam(
  criadoEm: string | Date,
  desafios: Challenge[],
): Challenge[] {
  const d = typeof criadoEm === 'string' ? new Date(criadoEm) : criadoEm
  return desafios.filter((c) => contaParaDesafio(d, c))
}

/**
 * Pontos de um aluno num desafio: **no máximo 1 por janela**. Postar
 * várias fotos na mesma janela (mesmo se ela cruzar a meia-noite) rende
 * só um ponto — o feed aceita todas, o ranking conta a janela.
 */
export function pontosNoDesafio(datas: Date[], c: Challenge): number {
  const janelas = new Set<string>()
  for (const d of datas) {
    const j = janelaDoCheckin(d, c)
    if (j) janelas.add(j)
  }
  return janelas.size
}

/** Dias distintos com pelo menos um check-in (usado nos distintivos). */
export function diasDistintos(datas: Date[]): number {
  return new Set(datas.map((d) => toISODate(d))).size
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

function feriadoQueAfeta(
  eventoTurma: string | null,
  dataISO: string,
  feriados: Feriado[],
): Feriado | null {
  return (
    feriados.find(
      (f) =>
        f.data === dataISO && (f.turma === null || f.turma === eventoTurma),
    ) ?? null
  )
}

export interface OcorrenciaAgenda {
  evento: AgendaEvent
  quando: Date
  cancelada: boolean
  motivoCancelamento: string | null
}

/**
 * Próximas ocorrências de um evento (até `quantidade`), marcando quais
 * caem num feriado/cancelamento. Eventos recorrentes avançam semana a
 * semana; eventos de data única têm no máximo uma ocorrência.
 */
export function ocorrenciasEvento(
  evento: AgendaEvent,
  feriados: Feriado[],
  now: Date,
  quantidade = 3,
): OcorrenciaAgenda[] {
  if (evento.data) {
    const quando = proximaOcorrencia(evento, now)
    if (!quando) return []
    const feriado = feriadoQueAfeta(evento.turma, evento.data, feriados)
    return [
      {
        evento,
        quando,
        cancelada: feriado !== null,
        motivoCancelamento: feriado?.motivo ?? null,
      },
    ]
  }
  if (evento.dia_semana === null) return []

  const hora = evento.hora ?? '00:00'
  const [h, m] = hora.split(':').map(Number)
  let cursor = new Date(now)
  cursor.setHours(h || 0, m || 0, 0, 0)
  let diff = (evento.dia_semana - now.getDay() + 7) % 7
  if (diff === 0 && cursor.getTime() < now.getTime()) diff = 7
  cursor = addDays(cursor, diff)

  const resultado: OcorrenciaAgenda[] = []
  for (let i = 0; i < quantidade; i++) {
    const dataISO = toISODate(cursor)
    const feriado = feriadoQueAfeta(evento.turma, dataISO, feriados)
    resultado.push({
      evento,
      quando: new Date(cursor),
      cancelada: feriado !== null,
      motivoCancelamento: feriado?.motivo ?? null,
    })
    cursor = addDays(cursor, 7)
  }
  return resultado
}

/**
 * Agenda pronta para exibir: para cada evento relevante, mostra a
 * próxima ocorrência — e, se ela estiver cancelada (feriado), mostra
 * junto a próxima ocorrência válida, para o aluno saber quando a aula
 * volta em vez de só sumir da agenda sem explicação.
 */
export function proximasOcorrenciasAgenda(
  eventos: AgendaEvent[],
  feriados: Feriado[],
  now = new Date(),
): OcorrenciaAgenda[] {
  const resultado: OcorrenciaAgenda[] = []
  for (const evento of eventos) {
    const ocorrencias = ocorrenciasEvento(evento, feriados, now, 4)
    if (ocorrencias.length === 0) continue
    if (ocorrencias[0].cancelada) {
      resultado.push(ocorrencias[0])
      const proximaValida = ocorrencias.find((o) => !o.cancelada)
      if (proximaValida) resultado.push(proximaValida)
    } else {
      resultado.push(ocorrencias[0])
    }
  }
  return resultado.sort((a, b) => a.quando.getTime() - b.quando.getTime())
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
