import { normalizeTelefone, telefonesIguais } from './phone'
import type { AlunoCadastrado, Profile } from './types'

/**
 * Uma pessoa da lista de chamada, com todas as turmas dela juntas.
 *
 * No banco a chamada é uma linha por (aluno, turma) — quem faz três
 * turmas ocupa três linhas. Isso é bom para importar CSV e ruim para
 * ler: com 300 alunos a tela vira 450 linhas em que o mesmo nome se
 * repete. Aqui elas voltam a ser uma pessoa só.
 */
export interface PessoaNaChamada {
  /** Telefone normalizado: é ele que identifica a pessoa, não o nome. */
  chave: string
  nome: string | null
  /** Como foi digitado na primeira linha — o que se confere a olho. */
  telefone: string
  /** As linhas originais, uma por turma. Removê-las é o que apaga. */
  linhas: AlunoCadastrado[]
  /** Turmas do semestre; vazio = veterano sem turma. */
  turmas: string[]
  /** Já criou conta no app. */
  temConta: boolean
}

/** Rótulo do filtro para quem está na chamada sem turma nenhuma. */
export const SEM_TURMA = '__sem_turma__'

/**
 * Agrupa a chamada por pessoa e marca quem já criou conta.
 *
 * O par é feito pelo telefone normalizado (mesma regra do Postgres), e
 * não pelo nome: nome repete, vem em branco no CSV e muda de grafia.
 */
export function agruparChamada(
  alunos: AlunoCadastrado[],
  perfis: Profile[],
): PessoaNaChamada[] {
  const comConta = new Set(
    perfis
      .map((p) => (p.telefone ? normalizeTelefone(p.telefone) : ''))
      .filter((t) => t.length >= 8),
  )

  const porTelefone = new Map<string, PessoaNaChamada>()
  for (const a of alunos) {
    const chave = normalizeTelefone(a.telefone)
    let pessoa = porTelefone.get(chave)
    if (!pessoa) {
      pessoa = {
        chave,
        nome: a.nome,
        telefone: a.telefone,
        linhas: [],
        turmas: [],
        temConta: comConta.has(chave),
      }
      porTelefone.set(chave, pessoa)
    }
    // A primeira linha com nome preenchido manda: o CSV às vezes traz
    // o nome só na primeira turma da pessoa.
    pessoa.nome ??= a.nome
    pessoa.linhas.push(a)
    if (a.turma) pessoa.turmas.push(a.turma)
  }

  return [...porTelefone.values()].sort((a, b) =>
    // Sem nome vai para o fim: é o que a organização precisa completar
    a.nome && b.nome
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : a.nome
        ? -1
        : b.nome
          ? 1
          : a.telefone.localeCompare(b.telefone),
  )
}

/** Filtra por turma; `SEM_TURMA` traz os veteranos sem turma. */
export function filtrarPorTurma<T extends { turmas: string[] }>(
  pessoas: T[],
  turma: string,
): T[] {
  if (!turma) return pessoas
  if (turma === SEM_TURMA) return pessoas.filter((p) => p.turmas.length === 0)
  return pessoas.filter((p) => p.turmas.includes(turma))
}

/** Quem está na chamada e ainda não criou conta no app. */
export function semConta(pessoas: PessoaNaChamada[]): number {
  return pessoas.filter((p) => !p.temConta).length
}

/**
 * Perfis do app que não estão mais na chamada. Não perdem o acesso —
 * a chamada só libera a criação da conta —, mas somem da tela de
 * gestão, então vale saber que existem.
 */
export function foraDaChamada(
  perfis: Profile[],
  alunos: AlunoCadastrado[],
): Profile[] {
  return perfis.filter(
    (p) =>
      !p.telefone ||
      !alunos.some((a) => telefonesIguais(a.telefone, p.telefone!)),
  )
}
