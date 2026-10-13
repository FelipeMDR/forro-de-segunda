import { DIAS_ABREV, type ChallengeJanela } from './types'

/** Ordem da semana do projeto: começa na segunda. */
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

/** "Seg a Sex", "Seg e Qua", "Sáb" — dias seguidos viram faixa. */
function rotuloDias(dias: number[]): string {
  const pos = dias.map((d) => ORDEM.indexOf(d)).sort((a, b) => a - b)
  const blocos: number[][] = []
  for (const p of pos) {
    const ultimo = blocos[blocos.length - 1]
    if (ultimo && p === ultimo[ultimo.length - 1] + 1) ultimo.push(p)
    else blocos.push([p])
  }
  const nome = (p: number) => DIAS_ABREV[ORDEM[p]]
  const partes = blocos.map((b) =>
    b.length >= 3
      ? `${nome(b[0])} a ${nome(b[b.length - 1])}`
      : b.map(nome).join(', '),
  )
  if (partes.length === 2 && blocos.every((b) => b.length === 1)) {
    return partes.join(' e ')
  }
  return partes.join(', ')
}

/**
 * Janelas de um desafio agrupadas por horário, para mostrar como chips:
 * ["Seg a Sex 19:00–23:59", "Sáb 15:00–19:00"]. Mesmo horário em vários
 * dias vira uma linha só.
 */
export function faixasDeHorario(janelas: ChallengeJanela[]): string[] {
  const porHorario = new Map<string, number[]>()
  for (const j of janelas) {
    const k = `${j.hora_inicio}–${j.hora_fim}`
    porHorario.set(k, [...(porHorario.get(k) ?? []), j.dia_semana])
  }
  return [...porHorario.entries()]
    .sort(
      (a, b) =>
        Math.min(...a[1].map((d) => ORDEM.indexOf(d))) -
        Math.min(...b[1].map((d) => ORDEM.indexOf(d))),
    )
    .map(([horas, dias]) => `${dias.length === 7 ? 'Todo dia' : rotuloDias(dias)} ${horas}`)
}

/** "01 – 31 out" ou "28 set – 04 out". */
export function periodoCurto(inicio: string, fim: string): string {
  const d = (iso: string) => new Date(`${iso}T12:00:00`)
  const mes = (x: Date) =>
    x.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const dia = (x: Date) => String(x.getDate()).padStart(2, '0')
  const a = d(inicio)
  const b = d(fim)
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${dia(a)} – ${dia(b)} ${mes(b)}`
    : `${dia(a)} ${mes(a)} – ${dia(b)} ${mes(b)}`
}
