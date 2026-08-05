/**
 * Trava de publicação: evita enxurrada de fotos no feed e o custo de
 * storage que vem junto.
 *
 * A contagem usa uma JANELA MÓVEL, não o dia do calendário. Dia de
 * calendário zeraria à meia-noite, bem no meio de um Espaço Livre que
 * vai das 21h às 2h — a mesma razão pela qual os desafios contam por
 * janela e não por data. E 24 horas móveis seria pior ainda: quem
 * postasse às 22h de segunda ficaria travado na aula das 20h de terça.
 * Seis horas cobrem uma noite inteira e já liberaram no dia seguinte.
 */

/** Quantos check-ins cabem na janela móvel. */
export const LIMITE_POR_JANELA = 5
/** Tamanho da janela móvel, em horas. */
export const JANELA_LIMITE_H = 6
/** Respiro entre uma foto e a próxima, em minutos. */
export const INTERVALO_MINIMO_MIN = 5

export interface EstadoLimite {
  pode: boolean
  /** Quantos ainda cabem na janela (0 quando estourou). */
  restantes: number
  /** Quando volta a liberar — null quando já pode postar. */
  liberaEm: Date | null
  motivo: 'ok' | 'intervalo' | 'janela'
}

export function limiteCheckin(
  datas: Date[],
  agora: Date = new Date(),
): EstadoLimite {
  const janelaMs = JANELA_LIMITE_H * 3_600_000
  const intervaloMs = INTERVALO_MINIMO_MIN * 60_000

  const recentes = datas
    .filter((d) => agora.getTime() - d.getTime() < janelaMs)
    .sort((a, b) => a.getTime() - b.getTime())

  const ultima = recentes[recentes.length - 1]
  if (ultima && agora.getTime() - ultima.getTime() < intervaloMs) {
    return {
      pode: false,
      restantes: Math.max(0, LIMITE_POR_JANELA - recentes.length),
      liberaEm: new Date(ultima.getTime() + intervaloMs),
      motivo: 'intervalo',
    }
  }

  if (recentes.length >= LIMITE_POR_JANELA) {
    // Libera quando o mais antigo da janela sair dela
    return {
      pode: false,
      restantes: 0,
      liberaEm: new Date(recentes[0].getTime() + janelaMs),
      motivo: 'janela',
    }
  }

  return {
    pode: true,
    restantes: LIMITE_POR_JANELA - recentes.length,
    liberaEm: null,
    motivo: 'ok',
  }
}

/** "2 minutos", "1 hora e 10 minutos" — para dizer quanto falta esperar. */
export function esperaLegivel(liberaEm: Date, agora: Date = new Date()): string {
  const min = Math.max(1, Math.ceil((liberaEm.getTime() - agora.getTime()) / 60_000))
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const h = Math.floor(min / 60)
  const resto = min % 60
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`
  if (resto === 0) return horas
  return `${horas} e ${resto} ${resto === 1 ? 'minuto' : 'minutos'}`
}
