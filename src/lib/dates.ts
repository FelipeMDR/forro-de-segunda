import type { AberturaAntecipada, AgendaEvent, Challenge, Feriado } from './types'

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

/**
 * Hora em que uma noite de forró vira a próxima.
 *
 * Não é meia-noite: em espaço livre a galera fica de madrugada, e quem
 * chega às 23h e quem chega à 1h estão na MESMA noite. Com o corte na
 * meia-noite eles caíam em dias diferentes e não podiam se marcar como
 * dupla. Cinco da manhã dá folga suficiente e ainda está longe do
 * horário em que qualquer aula começa.
 */
export const HORA_VIRADA_NOITE = 5

/**
 * A que noite de forró um instante pertence, como data ISO.
 *
 * É a chave usada pelas duplas: das 05:00 de um dia às 04:59 do
 * seguinte, tudo conta como a mesma noite — a do dia em que ela
 * começou. Mesma ideia que `janelaDoCheckin` já usava para desafios que
 * cruzam a meia-noite.
 */
export function diaDaNoite(d: Date): string {
  const ajustado = new Date(d)
  if (ajustado.getHours() < HORA_VIRADA_NOITE) {
    ajustado.setDate(ajustado.getDate() - 1)
  }
  return toISODate(ajustado)
}

/** Começo e fim (instantes) da noite que leva aquela data ISO. */
export function limitesDaNoite(dia: string): { de: Date; ate: Date } {
  const de = new Date(`${dia}T00:00:00`)
  de.setHours(HORA_VIRADA_NOITE, 0, 0, 0)
  const ate = new Date(de)
  ate.setDate(ate.getDate() + 1)
  ate.setTime(ate.getTime() - 1)
  return { de, ate }
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
 * Dias (ISO) em que os desafios estão suspensos — vem dos cancelamentos
 * marcados como "sem forró nesse dia". Passe o resultado adiante para
 * `janelaDoCheckin` e companhia.
 *
 * Não filtra por turma de propósito: desafio não pertence a turma
 * nenhuma. Quem decide é a organização, no próprio cancelamento.
 */
export function diasSuspensos(feriados: Feriado[]): Set<string> {
  return new Set(
    feriados.filter((f) => f.suspende_desafios).map((f) => f.data),
  )
}

/** Cancelamento que fechou os desafios naquele dia, se houver. */
export function suspensaoDoDia(
  dataISO: string,
  feriados: Feriado[],
): Feriado | null {
  return (
    feriados.find((f) => f.suspende_desafios && f.data === dataISO) ?? null
  )
}

/**
 * Data ISO → horário (minutos desde 00:00) em que o espaço abriu mais
 * cedo naquele dia. Duas aberturas na mesma data (não deveria acontecer,
 * mas o cadastro não impede) ficam com a mais cedo das duas — é sempre
 * a que mais favorece quem chegou primeiro.
 */
export function mapaAberturas(
  aberturas: AberturaAntecipada[],
): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const a of aberturas) {
    const minutos = parseTime(a.hora_abertura)
    const atual = mapa.get(a.data)
    if (atual === undefined || minutos < atual) mapa.set(a.data, minutos)
  }
  return mapa
}

/** Abertura antecipada que afeta aquele dia, se houver (para exibir o motivo). */
export function aberturaDoDia(
  dataISO: string,
  aberturas: AberturaAntecipada[],
): AberturaAntecipada | null {
  return (
    aberturas
      .filter((a) => a.data === dataISO)
      .sort((a, b) => a.hora_abertura.localeCompare(b.hora_abertura))[0] ??
    null
  )
}

/**
 * Dia (ISO) em que começou a janela do desafio que contém o instante
 * `d`, ou null se `d` não cai em nenhuma janela.
 *
 * Dias suspensos (aula cancelada) não têm janela: contam como se o
 * desafio não acontecesse ali. Como a checagem é feita sobre o dia em
 * que a janela ABRIU, uma janela que vira a noite é suspensa inteira —
 * a madrugada seguinte não escapa da regra.
 *
 * Cada dia da semana pode ter sua própria janela (espaços diferentes
 * têm horários diferentes de aula), então percorre `c.janelas` até
 * achar a que corresponde ao dia de `d`.
 *
 * Suporta janelas que cruzam a meia-noite (ex.: 21:00–02:00, quando
 * hora_fim < hora_inicio): a janela "pertence" ao dia em que começou,
 * mesmo que o check-in tenha sido feito de madrugada no dia seguinte.
 * É essa data — não a do relógio no momento do check-in — que deve ser
 * usada para checar o período do desafio e o limite de 1 ponto por janela.
 */
export function janelaDoCheckin(
  d: Date,
  c: Challenge,
  suspensos?: ReadonlySet<string>,
  // Data ISO → minutos da abertura antecipada naquele dia (ver
  // `mapaAberturas`). Só ADIANTA o início de uma janela que já existia
  // naquele dia da semana — nunca cria janela nem mexe no fim.
  aberturas?: ReadonlyMap<string, number>,
): string | null {
  const minutos = d.getHours() * 60 + d.getMinutes()
  const dentroDoPeriodo = (dia: string) =>
    dia >= c.data_inicio && dia <= c.data_fim && !suspensos?.has(dia)
  const inicioEfetivo = (dia: string, inicio: number) => {
    const abertura = aberturas?.get(dia)
    return abertura !== undefined && abertura < inicio ? abertura : inicio
  }

  for (const j of c.janelas) {
    const inicio = parseTime(j.hora_inicio)
    const fim = parseTime(j.hora_fim)
    const overnight = fim < inicio

    if (!overnight) {
      if (d.getDay() !== j.dia_semana) continue
      const dia = toISODate(d)
      if (minutos < inicioEfetivo(dia, inicio) || minutos > fim) continue
      if (dentroDoPeriodo(dia)) return dia
      continue
    }

    // Ponta da noite: check-in no próprio dia em que a janela abre
    if (d.getDay() === j.dia_semana) {
      const dia = toISODate(d)
      if (minutos >= inicioEfetivo(dia, inicio) && dentroDoPeriodo(dia)) {
        return dia
      }
    }
    // Ponta da manhã seguinte: ainda conta para o dia anterior. Não
    // depende do início da janela (só do fim), então a abertura
    // antecipada não entra aqui — ela nunca adianta ou atrasa o fim.
    if (minutos <= fim) {
      const anterior = addDays(d, -1)
      if (anterior.getDay() === j.dia_semana) {
        const dia = toISODate(anterior)
        if (dentroDoPeriodo(dia)) return dia
      }
    }
  }
  return null
}

/** True se o instante `d` cai na janela do desafio (período + dia + horário). */
export function contaParaDesafio(
  d: Date,
  c: Challenge,
  suspensos?: ReadonlySet<string>,
  aberturas?: ReadonlyMap<string, number>,
): boolean {
  return janelaDoCheckin(d, c, suspensos, aberturas) !== null
}

/** Desafios para os quais um check-in feito em `criadoEm` marca ponto. */
export function desafiosQueContam(
  criadoEm: string | Date,
  desafios: Challenge[],
  suspensos?: ReadonlySet<string>,
  aberturas?: ReadonlyMap<string, number>,
): Challenge[] {
  const d = typeof criadoEm === 'string' ? new Date(criadoEm) : criadoEm
  return desafios.filter((c) => contaParaDesafio(d, c, suspensos, aberturas))
}

/**
 * Pontos de um aluno num desafio: **no máximo 1 por janela**. Postar
 * várias fotos na mesma janela (mesmo se ela cruzar a meia-noite) rende
 * só um ponto — o feed aceita todas, o ranking conta a janela.
 */
export function pontosNoDesafio(
  datas: Date[],
  c: Challenge,
  suspensos?: ReadonlySet<string>,
  aberturas?: ReadonlyMap<string, number>,
): number {
  const janelas = new Set<string>()
  for (const d of datas) {
    const j = janelaDoCheckin(d, c, suspensos, aberturas)
    if (j) janelas.add(j)
  }
  return janelas.size
}

/**
 * Cancelamentos que realmente afetam um desafio: dentro do período dele
 * e num dia da semana em que ele teria janela. Um cancelamento de terça
 * não interessa a um desafio que só vale na segunda, e mostrá-lo na tela
 * só faria o aluno duvidar do que vale.
 */
export function suspensoesDoDesafio(
  c: Challenge,
  feriados: Feriado[],
): Feriado[] {
  const dias = new Set(c.janelas.map((j) => j.dia_semana))
  return feriados
    .filter(
      (f) =>
        f.suspende_desafios &&
        f.data >= c.data_inicio &&
        f.data <= c.data_fim &&
        dias.has(new Date(`${f.data}T12:00:00`).getDay()),
    )
    .sort((a, b) => a.data.localeCompare(b.data))
}

/**
 * Aberturas antecipadas que realmente afetam um desafio: dentro do
 * período dele, num dia da semana em que ele tem janela, e mais cedo do
 * que o horário normal daquele dia — senão a abertura não mudou nada
 * para ESTE desafio em particular, mesmo valendo para outro.
 */
export function aberturasDoDesafio(
  c: Challenge,
  aberturas: AberturaAntecipada[],
): AberturaAntecipada[] {
  const inicioPorDia = new Map(
    c.janelas.map((j) => [j.dia_semana, parseTime(j.hora_inicio)]),
  )
  return aberturas
    .filter((a) => {
      if (a.data < c.data_inicio || a.data > c.data_fim) return false
      const diaSemana = new Date(`${a.data}T12:00:00`).getDay()
      const inicioNormal = inicioPorDia.get(diaSemana)
      return inicioNormal !== undefined && parseTime(a.hora_abertura) < inicioNormal
    })
    .sort((a, b) => a.data.localeCompare(b.data))
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
