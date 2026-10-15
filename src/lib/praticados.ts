/**
 * Passos que o aluno marcou como praticados. Fica só no aparelho
 * (decisão da spec): é um lembrete pessoal, não vale ponto nem chave.
 */
const CHAVE = 'fds-trilha-praticados'

export function lerPraticados(): Set<string> {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as unknown
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Marca ou desmarca e devolve o conjunto novo. */
export function alternarPraticado(passoId: string): Set<string> {
  const atual = lerPraticados()
  if (atual.has(passoId)) atual.delete(passoId)
  else atual.add(passoId)
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...atual]))
  } catch {
    // Sem armazenamento (aba anônima): vale só nesta visita
  }
  return atual
}
