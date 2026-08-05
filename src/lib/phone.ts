/**
 * Normalização de telefone para casar o cadastro do app com a lista
 * de chamada: mantém só dígitos e compara pelos 10 últimos (cobre
 * formatos com/sem +55, com/sem DDD 0, espaços, traços etc.).
 * Mesma regra da função `normalizar_telefone` no Postgres.
 */
export function normalizeTelefone(t: string): string {
  const digits = t.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function telefonesIguais(a: string, b: string): boolean {
  const na = normalizeTelefone(a)
  const nb = normalizeTelefone(b)
  return na.length >= 8 && na === nb
}

export function telefoneValido(t: string): boolean {
  return normalizeTelefone(t).length >= 8
}

/**
 * Deixa o número legível para conferência a olho, sem inventar o que
 * não se sabe: como a normalização guarda só os 10 últimos dígitos, o
 * DDD pode ter sido cortado — então nada de "(11)" a menos que o
 * original tenha vindo completo. Só separa os 4 últimos dígitos, que é
 * o que ajuda a bater a linha com a lista de ingressos.
 */
export function formatTelefone(t: string): string {
  const originais = t.replace(/\D/g, '')
  if (originais.length === 11) {
    return `(${originais.slice(0, 2)}) ${originais.slice(2, 7)}-${originais.slice(7)}`
  }
  const d = normalizeTelefone(t)
  if (d.length < 8) return t
  return `${d.slice(0, -4)}-${d.slice(-4)}`
}

/**
 * O Supabase Auth exige e-mail, mas o aluno entra só com telefone +
 * senha. Convertemos o telefone num e-mail sintético estável — ele
 * nunca recebe mensagem (por isso a confirmação de e-mail precisa
 * estar DESATIVADA no Supabase; ver README).
 */
export function synthEmail(telefone: string): string {
  return `a${normalizeTelefone(telefone)}@alunos.forrodesegunda.app`
}
