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

/** Nível de uma dupla no semestre, pelas noites que dançaram juntos. */
export interface NivelDupla {
  nivel: number
  nome: string
  emoji: string
  /** Noites juntos a partir das quais a dupla chega neste nível. */
  minimo: number
}

/**
 * A carta evolui com as noites juntos, como medalha de jogo: bronze,
 * prata e ouro. Os números cabem num semestre de uma aula por semana
 * (~16 noites): Dupla de ouro é difícil, mas dá.
 */
export const NIVEIS_DUPLA: NivelDupla[] = [
  { nivel: 1, nome: 'Primeira dança', emoji: '👋', minimo: 1 },
  { nivel: 2, nome: 'Parceria', emoji: '🥉', minimo: 3 },
  { nivel: 3, nome: 'Dupla afinada', emoji: '🥈', minimo: 6 },
  { nivel: 4, nome: 'Dupla de ouro', emoji: '🥇', minimo: 10 },
]

export interface ProgressoDupla {
  atual: NivelDupla
  /** null = já está no topo. */
  proximo: NivelDupla | null
  /** Noites que faltam para o próximo nível (0 no topo). */
  faltam: number
  /** Quanto já andou dentro do nível atual, de 0 a 1 (1 no topo). */
  fracao: number
}

/** Nível e progresso de quem dançou `noites` comigo. null = nunca dançou. */
export function nivelDupla(noites: number): ProgressoDupla | null {
  let i = NIVEIS_DUPLA.length - 1
  while (i >= 0 && noites < NIVEIS_DUPLA[i].minimo) i--
  if (i === -1) return null
  const atual = NIVEIS_DUPLA[i]
  const proximo = NIVEIS_DUPLA[i + 1] ?? null
  if (!proximo) return { atual, proximo, faltam: 0, fracao: 1 }
  return {
    atual,
    proximo,
    faltam: proximo.minimo - noites,
    fracao: (noites - atual.minimo) / (proximo.minimo - atual.minimo),
  }
}

/** Quantas duplas em cada nível, na ordem de `NIVEIS_DUPLA`. */
export function contarPorNivel(descobertos: { noites: number }[]): number[] {
  const contagem = NIVEIS_DUPLA.map(() => 0)
  for (const c of descobertos) {
    const p = nivelDupla(c.noites)
    if (p) contagem[p.atual.nivel - 1]++
  }
  return contagem
}
