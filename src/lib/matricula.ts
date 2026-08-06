import type { LinhaAluno } from './csvImport'
import { normalizeTelefone } from './phone'
import type { AlunoCadastrado, PapelDanca, Profile } from './types'

export interface TurmaMatricula {
  /** null = sem turma no semestre (veterano que só frequenta). */
  turma: string | null
  papel_danca: PapelDanca | null
}

/**
 * Uma pessoa do arquivo importado e para onde as turmas dela vão.
 *
 * Quem já tem conta (`userId`) tem as turmas trocadas no PERFIL — a
 * lista de chamada só é lida na criação do cadastro, então escrever
 * nela não faria nada por essa pessoa. Quem ainda não tem conta tem a
 * linha da CHAMADA trocada, para cair na turma certa quando se
 * cadastrar.
 */
export interface PessoaMatricula {
  /** Telefone normalizado — a identidade da pessoa. */
  chave: string
  nome: string | null
  telefone: string
  /** Preenchido só para quem já tem conta no app. */
  userId: string | null
  /** Turmas que o arquivo está atribuindo. */
  turmasNovas: TurmaMatricula[]
  /** Linhas da chamada a substituir (só para quem não tem conta). */
  linhasChamada: AlunoCadastrado[]
}

const nomeTurma = (t: string | null | undefined) => (t ? t.trim() : null)

/**
 * Monta o plano da matrícula do semestre a partir do CSV.
 *
 * A comparação é por telefone normalizado (mesma regra do Postgres), e
 * não por nome — nome repete, vem em branco e muda de grafia.
 *
 * O arquivo **substitui** as turmas da pessoa em vez de somar: é assim
 * que uma planilha por semestre funciona, senão quem passa de Iniciante
 * para Intermediário acumularia as duas para sempre. Quem não está no
 * arquivo não é tocado, então dá para importar uma turma de cada vez —
 * para zerar todo mundo antes, use `encerrarSemestre`.
 */
export function planejarMatricula(
  linhas: LinhaAluno[],
  alunos: AlunoCadastrado[],
  perfis: Profile[],
): PessoaMatricula[] {
  const perfilPorTelefone = new Map<string, Profile>()
  for (const p of perfis) {
    if (!p.telefone) continue
    const chave = normalizeTelefone(p.telefone)
    if (chave.length >= 8) perfilPorTelefone.set(chave, p)
  }

  const chamadaPorTelefone = new Map<string, AlunoCadastrado[]>()
  for (const a of alunos) {
    const chave = normalizeTelefone(a.telefone)
    const lista = chamadaPorTelefone.get(chave) ?? []
    lista.push(a)
    chamadaPorTelefone.set(chave, lista)
  }

  const plano = new Map<string, PessoaMatricula>()
  const papeisAntigos = new Map<string, TurmaMatricula[]>()

  for (const linha of linhas) {
    const chave = normalizeTelefone(linha.telefone)
    let pessoa = plano.get(chave)
    if (!pessoa) {
      const perfil = perfilPorTelefone.get(chave)
      const linhasChamada = chamadaPorTelefone.get(chave) ?? []
      pessoa = {
        chave,
        nome:
          linha.nome.trim() || perfil?.nome || linhasChamada[0]?.nome || null,
        telefone: linha.telefone,
        userId: perfil?.id ?? null,
        turmasNovas: [],
        linhasChamada,
      }
      plano.set(chave, pessoa)
      papeisAntigos.set(
        chave,
        perfil
          ? perfil.turmas.map((t) => ({
              turma: t.turma,
              papel_danca: t.papel_danca,
            }))
          : linhasChamada.map((a) => ({
              turma: a.turma,
              papel_danca: a.papel_danca,
            })),
      )
    }

    const turma = nomeTurma(linha.turma)
    if (!pessoa.turmasNovas.some((t) => t.turma === turma)) {
      pessoa.turmasNovas.push({ turma, papel_danca: linha.papel_danca })
    }
  }

  // Papel em branco no arquivo não apaga o que já estava: planilha de
  // turma costuma vir só com nome e telefone.
  for (const pessoa of plano.values()) {
    const antigas = papeisAntigos.get(pessoa.chave) ?? []
    for (const nova of pessoa.turmasNovas) {
      if (nova.papel_danca) continue
      const antiga = antigas.find((t) => t.turma === nova.turma)
      if (antiga?.papel_danca) nova.papel_danca = antiga.papel_danca
    }
  }

  return [...plano.values()].sort((a, b) =>
    a.nome && b.nome
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : a.nome
        ? -1
        : b.nome
          ? 1
          : a.telefone.localeCompare(b.telefone),
  )
}

/** Turmas do arquivo, prontas para exibir ("Avançado · Intermediário"). */
export function turmasDaLinha(p: PessoaMatricula): string {
  const nomes = p.turmasNovas.map((t) => t.turma).filter(Boolean)
  return nomes.length > 0 ? nomes.join(' · ') : 'sem turma'
}
