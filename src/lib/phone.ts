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

/** DDD (2 dígitos) e LINHA (8 dígitos, sem o 9º dígito do celular). */
export interface NucleoTelefone {
  /** null = o número foi digitado sem DDD — hoje isso não é mais aceito
   * no cadastro (ver `telefoneValido`), mas números antigos, gravados
   * antes dessa exigência, ainda existem no banco. */
  ddd: string | null
  /** '' quando não dá para identificar 8 dígitos de linha. */
  linha: string
}

/**
 * Separa DDD e linha, absorvendo o 9º dígito opcional do celular —
 * esteja ele presente ou não, dos dois lados da comparação.
 *
 * Olha só a QUANTIDADE de dígitos depois de tirar tudo que não é
 * número (espaço, parênteses, traço — "(11) 981234-5678", "1198765432",
 * "11 98765-4321" viram todos o mesmo tipo de sequência antes de
 * chegar aqui):
 *
 *   11 dígitos → DDD + 9 + linha  → descarta o 9
 *   10 dígitos → DDD + linha      → já está pronto
 *    9 dígitos →      9 + linha   → descarta o 9, sem DDD
 *    8 dígitos →          linha   → já está pronto, sem DDD
 *
 * Números com código de país (+55) na frente não são tratados à parte:
 * ninguém digita "+55" numa ficha de chamada, e tentar adivinhar
 * quando um "55" é código de país e quando é DDD (35 é vizinho, mas 55
 * também é um DDD de verdade, do Rio Grande do Sul) traria mais erro
 * do que resolveria.
 */
export function nucleoTelefone(t: string): NucleoTelefone {
  const d = t.replace(/\D/g, '')
  if (d.length === 11) return { ddd: d.slice(0, 2), linha: d.slice(3) }
  if (d.length === 10) return { ddd: d.slice(0, 2), linha: d.slice(2) }
  if (d.length === 9) return { ddd: null, linha: d.slice(1) }
  if (d.length === 8) return { ddd: null, linha: d }
  return { ddd: null, linha: '' }
}

/**
 * Dois números são o mesmo telefone?
 *
 * O projeto recebe gente de fora de Itajubá, então o DDD importa de
 * verdade — dois alunos podem ter a mesma linha final em cidades
 * diferentes, e não são a mesma pessoa. Por isso, quando os DOIS
 * números têm DDD, ele PRECISA bater.
 *
 * A exceção é número antigo, gravado antes de o DDD virar obrigatório
 * no cadastro (`telefoneValido`): aceita pela linha sozinha, porque não
 * tem DDD nenhum para comparar — é o melhor que dá para fazer sem
 * inventar um DDD que ninguém informou.
 */
export function telefonesIguais(a: string, b: string): boolean {
  const na = nucleoTelefone(a)
  const nb = nucleoTelefone(b)
  if (na.linha.length !== 8 || na.linha !== nb.linha) return false
  if (na.ddd && nb.ddd) return na.ddd === nb.ddd
  return true
}

/**
 * Telefone válido para CADASTRAR (lista de chamada, conta nova): exige
 * DDD. Um número sem DDD hoje pode ser de qualquer cidade, e o projeto
 * não é mais de gente só de Itajubá — sem o DDD não dá para saber se
 * duas pessoas com a mesma linha são a mesma pessoa ou só coincidência.
 */
export function telefoneValido(t: string): boolean {
  const { ddd, linha } = nucleoTelefone(t)
  return ddd !== null && linha.length === 8
}

/**
 * Agrupa itens por telefone para juntar listas grandes (perfis × lista
 * de chamada × CSV importado) sem comparar par a par — mesmo critério
 * de `telefonesIguais`, como estrutura em vez de função.
 *
 * Agrupa pela LINHA (sempre bem definida, 8 dígitos) e guarda o DDD de
 * cada item ao lado; a compatibilidade de DDD é resolvida depois, só
 * dentro do balde de cada linha — que na prática quase sempre tem um
 * item só. É isso que permite números antigos sem DDD continuarem
 * casando com o cadastro novo, que já vem com DDD.
 */
export function agrupaPorTelefone<T>(
  itens: T[],
  telefoneDe: (item: T) => string,
): Map<string, Array<{ ddd: string | null; item: T }>> {
  const porLinha = new Map<string, Array<{ ddd: string | null; item: T }>>()
  for (const item of itens) {
    const { ddd, linha } = nucleoTelefone(telefoneDe(item))
    if (linha.length !== 8) continue
    const lista = porLinha.get(linha) ?? []
    lista.push({ ddd, item })
    porLinha.set(linha, lista)
  }
  return porLinha
}

/** Primeiro item do grupo compatível com este telefone (ver `agrupaPorTelefone`). */
export function achaPorTelefone<T>(
  porLinha: Map<string, Array<{ ddd: string | null; item: T }>>,
  telefone: string,
): T | undefined {
  const alvo = nucleoTelefone(telefone)
  if (alvo.linha.length !== 8) return undefined
  const candidatos = porLinha.get(alvo.linha) ?? []
  return candidatos.find((c) => !alvo.ddd || !c.ddd || c.ddd === alvo.ddd)
    ?.item
}

/** Todos os itens do grupo compatíveis com este telefone. */
export function achaTodosPorTelefone<T>(
  porLinha: Map<string, Array<{ ddd: string | null; item: T }>>,
  telefone: string,
): T[] {
  const alvo = nucleoTelefone(telefone)
  if (alvo.linha.length !== 8) return []
  const candidatos = porLinha.get(alvo.linha) ?? []
  return candidatos
    .filter((c) => !alvo.ddd || !c.ddd || c.ddd === alvo.ddd)
    .map((c) => c.item)
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
