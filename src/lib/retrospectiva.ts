import { computeStreak, diasDistintos } from './dates'
import { datasDePresenca, type RegrasPresenca } from './presenca'
import type { CheckinComReacoes, ParceiroDanca } from './types'

/**
 * Retrospectiva do semestre: os números da pessoa para fechar o ciclo
 * e postar no Instagram.
 *
 * Tudo derivado do que já existe — nada é guardado. Recalcular é
 * barato e evita mais uma tabela para manter em dia.
 */
export interface Retrospectiva {
  /** Início do período considerado (ISO). */
  desde: string
  rotuloPeriodo: string
  presencas: number
  streak: number
  parceiros: number
  reacoesRecebidas: number
  /** Foto com mais reações no período. */
  destaque: CheckinComReacoes | null
  /** Com quem dançou mais noites. */
  parceiroTop: ParceiroDanca | null
}

/**
 * Rótulo "1º/2º semestre de AAAA" a partir de quando o período
 * REALMENTE começou — e não do calendário civil. `inicio` normalmente
 * vem do último "Encerrar semestre" (ver `RetrospectivaPage`), então o
 * rótulo já reflete o semestre de verdade do projeto, seja lá quando
 * ele começar.
 */
export function rotuloDoSemestre(inicio: Date): string {
  const { ano, numero } = semestreDe(inicio)
  return `${numero}º semestre de ${ano}`
}

/**
 * Qual semestre começa em `inicio`. Novembro e dezembro contam como o
 * 1º do ano seguinte: o 2º semestre costuma ser encerrado em dezembro,
 * e o que começa ali é o do ano que vem.
 */
export function semestreDe(inicio: Date): { ano: number; numero: 1 | 2 } {
  const mes = inicio.getMonth()
  if (mes >= 10) return { ano: inicio.getFullYear() + 1, numero: 1 }
  return { ano: inicio.getFullYear(), numero: mes < 6 ? 1 : 2 }
}

/**
 * Data que nomeia um semestre encerrado: o início, ou, sem início
 * (primeiro encerramento da história), 4 meses antes do fim — o `fim`
 * direto jogaria um fechamento de dezembro no 1º semestre do ano
 * seguinte. Serve ao rótulo e ao código do story.
 */
export function referenciaDoPeriodo(inicio: string | null, fim: string): Date {
  if (inicio) return new Date(inicio)
  const ref = new Date(fim)
  ref.setMonth(ref.getMonth() - 4)
  return ref
}

/** "2º semestre de 2026" de um semestre encerrado (ver `referenciaDoPeriodo`). */
export function rotuloDoPeriodo(inicio: string | null, fim: string): string {
  return rotuloDoSemestre(referenciaDoPeriodo(inicio, fim))
}

/**
 * Início do semestre que ACABOU de ser encerrado — o que a retrospectiva
 * conta. A retrospectiva só aparece depois do "Encerrar semestre", então
 * o último encerramento é o FIM do período; o início é o penúltimo.
 * Sem penúltimo (primeiro encerramento da história), cai para a criação
 * da conta. `encerramentos` vem em ordem cronológica.
 */
export function inicioDoSemestreEncerrado(
  encerramentos: string[],
  criadoEm: string | null | undefined,
): string {
  return encerramentos.at(-2) ?? criadoEm ?? new Date(0).toISOString()
}

export function montarRetrospectiva(
  checkins: CheckinComReacoes[],
  parceiros: ParceiroDanca[],
  // `desde` recorta os dados; `rotulo` nomeia o semestre, que nem sempre
  // sai de `desde` (sem penúltimo encerramento, `desde` é a criação da
  // conta, e o nome vem do fim — ver `rotuloDoPeriodo`)
  periodo: { desde: Date; rotulo: string },
  // Presença = check-in que marcou ponto em algum desafio. A foto que
  // não marcou continua entrando em "reações recebidas" e pode até ser
  // o destaque do semestre — ela existiu, só não foi uma noite de forró.
  regras: RegrasPresenca,
  agora = new Date(),
): Retrospectiva {
  const datas = datasDePresenca(checkins, regras)
  // Mais reações vence; empate fica com a mais recente, que é a ordem
  // em que a consulta já devolve.
  const destaque = checkins.reduce<CheckinComReacoes | null>(
    (melhor, c) => (!melhor || c.reacoes > melhor.reacoes ? c : melhor),
    null,
  )
  return {
    desde: periodo.desde.toISOString(),
    rotuloPeriodo: periodo.rotulo,
    presencas: diasDistintos(datas),
    streak: computeStreak(datas, agora),
    parceiros: parceiros.length,
    reacoesRecebidas: checkins.reduce((s, c) => s + c.reacoes, 0),
    destaque: destaque && destaque.reacoes > 0 ? destaque : null,
    parceiroTop: parceiros[0] ?? null,
  }
}

/** Um pedido que tocou no Espaço Livre, como a retrospectiva precisa. */
export interface MusicaTocada {
  uri: string
  titulo: string
  artista: string
  capa_url: string | null
  tocou_em: string
}

/** O cartão "Sua música no Espaço Livre". */
export interface MusicaDoSemestre {
  titulo: string
  artista: string
  capa_url: string | null
  /** Quantas noites essa música (pedida pela pessoa) tocou. */
  vezes: number
  /** Quantos pedidos da pessoa tocaram no semestre, ao todo. */
  total: number
}

/**
 * A música da pessoa no semestre: a que mais vezes tocou a pedido dela.
 *
 * A mesma música não pode ser pedida duas vezes na mesma noite, então
 * "vezes" são noites diferentes. Empate (o caso comum: tudo tocou uma
 * vez) fica com a que tocou por último — é a mais fresca na memória.
 */
export function musicaMaisTocada(tocadas: MusicaTocada[]): MusicaDoSemestre | null {
  if (tocadas.length === 0) return null
  const porMusica = new Map<string, { ultima: MusicaTocada; vezes: number }>()
  for (const t of tocadas) {
    const g = porMusica.get(t.uri)
    if (!g) porMusica.set(t.uri, { ultima: t, vezes: 1 })
    else {
      g.vezes++
      if (t.tocou_em > g.ultima.tocou_em) g.ultima = t
    }
  }
  const [vencedora] = [...porMusica.values()].sort(
    (a, b) => b.vezes - a.vezes || b.ultima.tocou_em.localeCompare(a.ultima.tocou_em),
  )
  return {
    titulo: vencedora.ultima.titulo,
    artista: vencedora.ultima.artista,
    capa_url: vencedora.ultima.capa_url,
    vezes: vencedora.vezes,
    total: tocadas.length,
  }
}
