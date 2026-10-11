import type { ParceiroDanca, PerfilPublico } from './types'

/** Uma carta da coleção. `noites` 0 = ainda não dançaram no semestre. */
export interface CartaForrodex {
  user_id: string
  nome: string
  avatar_url: string | null
  noites: number
}

export interface Forrodex {
  /** Quem já dançou comigo no semestre, mais noites primeiro. */
  descobertos: CartaForrodex[]
  /** Quem está no semestre e ainda falta, em ordem alfabética. */
  faltam: CartaForrodex[]
  total: number
}

/** Onde a pessoa estuda e onde dá aula, sem repetir. */
export function turmasDe(
  p: Pick<PerfilPublico, 'turmas' | 'turmas_ensino'> | null,
): string[] {
  if (!p) return []
  return [...new Set([...p.turmas.map((m) => m.turma), ...p.turmas_ensino])]
}

/**
 * Monta a Forródex: a coleção de gente com quem dancei no semestre.
 *
 * O universo é quem está ATIVO no semestre (tem turma, estudando ou
 * dando aula). Quem se formou e saiu das turmas viraria uma carta
 * impossível de completar — mas, se dançou comigo, entra assim mesmo:
 * muita gente continua frequentando depois do curso.
 *
 * `parceiros` já vem cortado no início do semestre (ver `parceirosDe`)
 * e só com duplas confirmadas dos dois lados.
 */
export function montarForrodex(
  perfis: PerfilPublico[],
  parceiros: ParceiroDanca[],
  meuId: string,
  turma?: string | null,
): Forrodex {
  const porId = new Map(perfis.map((p) => [p.id, p]))
  const naTurma = (id: string) => {
    if (!turma) return true
    const p = porId.get(id)
    return !!p && turmasDe(p).includes(turma)
  }

  const descobertos = parceiros
    .filter((p) => p.user_id !== meuId && naTurma(p.user_id))
    .map((p) => ({ ...p }))
    .sort((a, b) => b.noites - a.noites || a.nome.localeCompare(b.nome, 'pt-BR'))

  const jaDancei = new Set(descobertos.map((c) => c.user_id))
  const faltam = perfis
    .filter(
      (p) =>
        p.id !== meuId &&
        !jaDancei.has(p.id) &&
        turmasDe(p).length > 0 &&
        naTurma(p.id),
    )
    .map((p) => ({
      user_id: p.id,
      nome: p.nome,
      avatar_url: p.avatar_url,
      noites: 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return { descobertos, faltam, total: descobertos.length + faltam.length }
}

const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']

/**
 * Posição da turma pelo nível e, nas iniciantes, pelo dia da semana.
 * Reconhece por palavra, não pelo nome exato: "Iniciante (Sábado)" e
 * "iniciante sabado" caem no mesmo lugar, e a ordem sobrevive às turmas
 * serem renomeadas no semestre seguinte.
 */
function pesoTurma(nome: string): number {
  const n = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  if (n.includes('avanc')) return 0
  if (n.includes('inter')) return 1
  if (n.includes('inici')) {
    const dia = DIAS.findIndex((d) => n.includes(d))
    // Sem dia no nome: depois das que têm
    return 2 + (dia === -1 ? DIAS.length : dia)
  }
  return 100
}

/**
 * Ordem das chips e das seções: Avançada, Intermediária e as
 * iniciantes de terça a sábado. O que não se encaixa vai para o fim,
 * em ordem alfabética.
 */
export function ordenarTurmas(todas: string[]): string[] {
  return [...new Set(todas)].sort(
    (a, b) => pesoTurma(a) - pesoTurma(b) || a.localeCompare(b, 'pt-BR'),
  )
}

/** Uma seção da visão "Todos". `turma` null = "Sem turma". */
export interface SecaoForrodex extends Forrodex {
  turma: string | null
}

/**
 * A visão "Todos" organizada por turma, na ordem de `turmas`.
 *
 * Quem está em várias turmas aparece em cada uma — cada seção tem o
 * próprio progresso. Turma sem ninguém não vira seção. E ninguém some:
 * quem não coube em nenhuma seção (sem turma, ou numa turma que saiu da
 * lista) vai para "Sem turma", no fim.
 */
export function agruparPorTurma(
  perfis: PerfilPublico[],
  parceiros: ParceiroDanca[],
  meuId: string,
  turmas: string[],
): SecaoForrodex[] {
  const secoes: SecaoForrodex[] = turmas
    .map((turma) => ({ turma, ...montarForrodex(perfis, parceiros, meuId, turma) }))
    .filter((s) => s.total > 0)

  const jaApareceu = new Set(
    secoes.flatMap((s) => [...s.descobertos, ...s.faltam].map((c) => c.user_id)),
  )
  const todos = montarForrodex(perfis, parceiros, meuId)
  const descobertos = todos.descobertos.filter((c) => !jaApareceu.has(c.user_id))
  const faltam = todos.faltam.filter((c) => !jaApareceu.has(c.user_id))
  if (descobertos.length + faltam.length > 0) {
    secoes.push({
      turma: null,
      descobertos,
      faltam,
      total: descobertos.length + faltam.length,
    })
  }
  return secoes
}
