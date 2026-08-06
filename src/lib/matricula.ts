import type { LinhaAluno } from './csvImport'
import { normalizeTelefone } from './phone'
import type { AlunoCadastrado, PapelDanca, Profile } from './types'

/**
 * O que vai acontecer com cada pessoa do arquivo importado.
 *
 * `novo` e `aguardando` ainda não têm conta: para eles o arquivo mexe na
 * lista de chamada, que é o que libera o cadastro. `veterano` e
 * `repetindo` já têm conta: para eles o arquivo mexe direto nas turmas
 * do perfil — a lista de chamada não serve mais para nada, porque o
 * acesso já está garantido.
 */
export type StatusMatricula =
  /** Sem conta e fora da chamada: entra na lista. */
  | 'novo'
  /** Sem conta, mas já estava na lista de semestres anteriores. */
  | 'aguardando'
  /** Tem conta e vai para turma(s) diferente(s) da(s) de agora. */
  | 'veterano'
  /** Tem conta e continua em pelo menos uma turma que já fazia. */
  | 'repetindo'

export interface TurmaMatricula {
  /** null = sem turma no semestre (veterano que só frequenta). */
  turma: string | null
  papel_danca: PapelDanca | null
}

export interface PessoaMatricula {
  /** Telefone normalizado — a identidade da pessoa. */
  chave: string
  nome: string | null
  telefone: string
  /** Preenchido só para quem já tem conta no app. */
  userId: string | null
  /** Turmas de hoje: do perfil se tem conta, da chamada se não tem. */
  turmasAtuais: TurmaMatricula[]
  /** Turmas que o arquivo está atribuindo. */
  turmasNovas: TurmaMatricula[]
  /** Turmas que a pessoa já fazia e vai fazer de novo. */
  repetidas: string[]
  /** Linhas da chamada a substituir (só para quem não tem conta). */
  linhasChamada: AlunoCadastrado[]
  status: StatusMatricula
}

export const ROTULO_STATUS: Record<StatusMatricula, string> = {
  novo: 'Novo',
  aguardando: 'Ainda sem conta',
  veterano: 'Veterano',
  repetindo: 'Repetindo a turma',
}

const nomeTurma = (t: string | null | undefined) => (t ? t.trim() : null)

/**
 * Monta o plano da matrícula do semestre: para cada pessoa do arquivo,
 * de onde ela vem e para onde vai.
 *
 * A comparação é por telefone normalizado (mesma regra do Postgres), e
 * não por nome — nome repete, vem em branco e muda de grafia.
 *
 * O arquivo **substitui** as turmas da pessoa em vez de somar: é assim
 * que uma planilha por semestre funciona, senão quem passa de Iniciante
 * para Intermediário acumularia as duas para sempre. Quem não está no
 * arquivo não é tocado, então dá para importar uma turma de cada vez.
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
  for (const linha of linhas) {
    const chave = normalizeTelefone(linha.telefone)
    let pessoa = plano.get(chave)
    if (!pessoa) {
      const perfil = perfilPorTelefone.get(chave)
      const linhasChamada = chamadaPorTelefone.get(chave) ?? []
      pessoa = {
        chave,
        nome: linha.nome.trim() || perfil?.nome || linhasChamada[0]?.nome || null,
        telefone: linha.telefone,
        userId: perfil?.id ?? null,
        turmasAtuais: perfil
          ? perfil.turmas.map((t) => ({
              turma: t.turma,
              papel_danca: t.papel_danca,
            }))
          : linhasChamada.map((a) => ({
              turma: a.turma,
              papel_danca: a.papel_danca,
            })),
        turmasNovas: [],
        repetidas: [],
        linhasChamada,
        // Ajustado no fim, quando as turmas do arquivo estão todas lidas
        status: perfil ? 'veterano' : linhasChamada.length > 0 ? 'aguardando' : 'novo',
      }
      plano.set(chave, pessoa)
    }

    const turma = nomeTurma(linha.turma)
    if (!pessoa.turmasNovas.some((t) => t.turma === turma)) {
      pessoa.turmasNovas.push({ turma, papel_danca: linha.papel_danca })
    }
  }

  for (const pessoa of plano.values()) {
    const atuais = new Set(
      pessoa.turmasAtuais.map((t) => t.turma).filter((t): t is string => !!t),
    )
    pessoa.repetidas = pessoa.turmasNovas
      .map((t) => t.turma)
      .filter((t): t is string => !!t && atuais.has(t))
    if (pessoa.userId && pessoa.repetidas.length > 0) {
      pessoa.status = 'repetindo'
    }
    // O papel em branco no arquivo não apaga o que já estava: planilha
    // de turma costuma vir só com nome e telefone.
    for (const nova of pessoa.turmasNovas) {
      if (nova.papel_danca) continue
      const antiga = pessoa.turmasAtuais.find((t) => t.turma === nova.turma)
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

/** Quantas pessoas em cada situação — o resumo antes de confirmar. */
export function resumoMatricula(
  plano: PessoaMatricula[],
): Record<StatusMatricula, number> {
  const r: Record<StatusMatricula, number> = {
    novo: 0,
    aguardando: 0,
    veterano: 0,
    repetindo: 0,
  }
  for (const p of plano) r[p.status]++
  return r
}

/** Descrição curta de para onde a pessoa vai ("Iniciante 01 → Inter"). */
export function descreverMudanca(p: PessoaMatricula): string {
  const nomes = (ts: TurmaMatricula[]) =>
    ts.length === 0 || ts.every((t) => !t.turma)
      ? 'sem turma'
      : ts
          .map((t) => t.turma)
          .filter(Boolean)
          .join(' · ')
  const de = nomes(p.turmasAtuais)
  const para = nomes(p.turmasNovas)
  return de === para ? para : `${de} → ${para}`
}
