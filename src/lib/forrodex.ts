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

/** Ordem das chips e das seções: as minhas primeiro, depois as outras. */
export function ordenarTurmas(todas: string[], minhas: string[]): string[] {
  const outras = todas
    .filter((t) => !minhas.includes(t))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return [...new Set([...minhas, ...outras])]
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
