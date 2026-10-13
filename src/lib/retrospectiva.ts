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
  const primeiro = inicio.getMonth() < 6
  return `${primeiro ? '1º' : '2º'} semestre de ${inicio.getFullYear()}`
}

export function montarRetrospectiva(
  checkins: CheckinComReacoes[],
  parceiros: ParceiroDanca[],
  inicio: Date,
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
    desde: inicio.toISOString(),
    rotuloPeriodo: rotuloDoSemestre(inicio),
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
