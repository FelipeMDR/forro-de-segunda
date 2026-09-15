/**
 * Nome que o banco põe em quem chegou sem nome nenhum.
 *
 * Existe porque `profiles.nome` é obrigatório e o gatilho de criação
 * precisa preencher ALGUMA coisa quando a lista de chamada não trouxe
 * o nome. Mas é um buraco, não um nome: no feed, no ranking e no painel
 * da organização ele não identifica ninguém. O app trata quem está com
 * ele como quem ainda não se apresentou — e pede o nome.
 */
export const NOME_PADRAO = 'Dançarino(a)'

/** Verdadeiro quando o perfil ainda está com o nome de preenchimento. */
export function semNome(nome: string | null | undefined): boolean {
  return !nome || nome.trim() === '' || nome.trim() === NOME_PADRAO
}
