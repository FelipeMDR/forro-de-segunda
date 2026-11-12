import type { Badge } from './types'

/** Quantos distintivos cabem nos destaques do perfil (igual ao check da 042). */
export const MAX_DESTAQUES = 3

/**
 * Cargo, turma e função já aparecem nos chips do topo do perfil: repetir
 * como cartão era o que mais enchia a tela. Ficam fora da coleção.
 */
const DO_CABECALHO = /^(cargo-|turma-|funcao$)/

/** Marcos sobem de nível e trocam de id ("presenca-25" → "presenca-50"). */
const MARCO = /^(presenca|rodizio|dj)-\d+$/

/**
 * Chave guardada nos destaques. A de marco não tem o nível: quem pôs
 * "25 presenças" em destaque continua com o distintivo lá quando ele
 * vira "50 presenças".
 */
export function chaveDestaque(b: Badge): string {
  return MARCO.test(b.id) ? b.id.replace(/-\d+$/, '') : b.id
}

/** Distintivos do perfil sem os que o cabeçalho já mostra. */
export function colecao(badges: Badge[]): Badge[] {
  return badges.filter((b) => !DO_CABECALHO.test(b.id))
}

/** Nível 0 da caça e convite à função: aparecem, mas não são conquista. */
export function conquistado(b: Badge): boolean {
  return !b.caca?.pendente
}

/**
 * Raridade, para os destaques automáticos: o especial (dado à mão pela
 * organização) vale mais que o ingresso da festa, que vale mais que a
 * caça, que vale mais que um marco; entre
 * marcos, o de nível mais alto na trilha.
 */
function raridade(b: Badge): number {
  if (b.id.startsWith('custom-')) return 3
  if (b.id.startsWith('ingresso-')) return 2.5
  if (b.id.startsWith('caca-')) return 2
  const t = b.trilha
  if (!t) return 1
  const nivel = t.marcos.filter((m) => t.valor >= m.minimo).length
  return 1 + nivel / t.marcos.length
}

/**
 * Os destaques que o perfil mostra. Com escolha salva, os escolhidos que
 * ainda existem, na ordem dela; sem escolha (ou se nenhum escolhido
 * existe mais, como a caça de um semestre que virou outro), os mais
 * raros. A ordenação é estável: empate fica na ordem do perfil.
 */
export function escolherDestaques(badges: Badge[], salvos: string[] | null | undefined): Badge[] {
  const candidatos = colecao(badges).filter(conquistado)
  if (salvos && salvos.length > 0) {
    const porChave = new Map(candidatos.map((b) => [chaveDestaque(b), b]))
    const escolhidos = salvos.flatMap((k) => porChave.get(k) ?? [])
    if (escolhidos.length > 0) return escolhidos.slice(0, MAX_DESTAQUES)
  }
  return [...candidatos].sort((a, b) => raridade(b) - raridade(a)).slice(0, MAX_DESTAQUES)
}
