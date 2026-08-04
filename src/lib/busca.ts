/** Minúsculas e sem acentos: "João" casa com "joao". */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Busca tolerante para as listas do painel: casa por nome (sem acento)
 * ou por telefone, independente da formatação — digitar "99999" acha
 * "(35) 99999-0000".
 */
export function combinaBusca(
  busca: string,
  campos: Array<string | null | undefined>,
): boolean {
  const termo = busca.trim()
  if (!termo) return true

  const alvo = normalizar(termo)
  const digitos = termo.replace(/\D/g, '')

  return campos.some((campo) => {
    if (!campo) return false
    if (normalizar(campo).includes(alvo)) return true
    if (digitos.length >= 3) {
      return campo.replace(/\D/g, '').includes(digitos)
    }
    return false
  })
}
