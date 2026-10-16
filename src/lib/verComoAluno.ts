/**
 * "Ver como aluno": a equipe (organização e professores) vê a trilha toda
 * aberta; ligando isto, vê como um aluno da própria turma — cadeados,
 * chaves e preços. Fica só no aparelho e não muda nenhuma permissão.
 */
const CHAVE = 'fds-trilha-ver-como-aluno'

export function lerVerComoAluno(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

export function salvarVerComoAluno(ligado: boolean): void {
  try {
    if (ligado) localStorage.setItem(CHAVE, '1')
    else localStorage.removeItem(CHAVE)
  } catch {
    // Sem armazenamento (aba anônima): vale só nesta visita
  }
}

/** Equipe só vê tudo aberto quando não está vendo como aluno. */
export function equipeEfetiva(podeEditar: boolean, comoAluno: boolean): boolean {
  return podeEditar && !comoAluno
}
