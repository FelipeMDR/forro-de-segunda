/**
 * Normalização de telefone para USO COMO CHAVE: e-mail sintético
 * (`synthEmail`), senha do modo demo, valor gravado em `telefone`. Mantém
 * só dígitos e os 10 últimos (cobre formatos com/sem +55, com/sem DDD 0,
 * espaços, traços etc.). Mesma regra da função `normalizar_telefone` no
 * Postgres.
 *
 * NÃO use isto para decidir se dois números são "o mesmo telefone" — use
 * `telefonesIguais`. Mudar esta função quebraria o login de quem já tem
 * conta: o e-mail sintético e a senha guardada foram calculados com a
 * regra de hoje, e um novo cálculo não bateria mais com o que já existe.
 */
export function normalizeTelefone(t: string): string {
  const digits = t.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

/**
 * Só os 8 últimos dígitos: a linha, sem DDD e sem o 9º dígito do
 * celular.
 *
 * Exportada (não só uso interno de `telefonesIguais`) porque também
 * serve como CHAVE de agrupamento em Map/Set — ver `matricula.ts`, que
 * precisa juntar em massa (perfis × lista de chamada × CSV importado) e
 * não pode comparar par a par. Duas chamadas com o mesmo telefone
 * SEMPRE geram esta mesma chave; é o mesmo critério de
 * `telefonesIguais`, só que como valor em vez de comparação.
 */
export function ultimos8(t: string): string {
  return t.replace(/\D/g, '').slice(-8)
}

/**
 * Dois números são o mesmo telefone?
 *
 * Compara pelos 8 últimos dígitos, não pelos 10. A lista de chamada é
 * digitada à mão, ano após ano, e às vezes vem sem o 9º dígito do
 * celular (ex.: "3599998888" em vez de "35999998888") enquanto a pessoa
 * cadastra normalmente, com o 9. Comparando os 10 últimos dígitos essa
 * dupla não bate: cortar pela direita desalinha tudo a partir do 9, e
 * "1234-5678" com 9 vira "91234-567" sem ele — dígito a dígito diferente
 * mesmo sendo o mesmo número. Descartar DDD e o 9 junto resolve, porque
 * os 8 dígitos finais são estáveis nos dois formatos.
 *
 * Comparar só por 8 dígitos aceita colisão entre DDDs diferentes com a
 * mesma terminação — risco real em nível nacional, mas o projeto é de
 * uma cidade só, então dois alunos com o mesmo final de linha e DDDs
 * diferentes é praticamente impossível.
 */
export function telefonesIguais(a: string, b: string): boolean {
  const da = ultimos8(a)
  const db = ultimos8(b)
  return da.length === 8 && da === db
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

/**
 * O que a pessoa digitou no login é um e-mail (e não um telefone)?
 *
 * Grosseiro de propósito: quem decide se o endereço presta é o
 * Supabase. Aqui só interessa saber por qual caminho seguir, e
 * telefone nenhum tem arroba.
 */
export function ehEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** Endereço sintético, que existe só para o login antigo funcionar. */
export function ehEmailSintetico(email: string | null): boolean {
  return !!email && email.endsWith('@alunos.forrodesegunda.app')
}
