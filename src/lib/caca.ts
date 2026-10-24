import { pesoTurma } from './forrodex'
import type {
  PapelDanca,
  PerfilPublico,
  Turma,
  TurmaMembro,
} from './types'

/**
 * Caça aos professores: dançar com a equipe de professores do papel
 * OPOSTO ao seu. A meta é o lado oposto (sem a própria pessoa, se ela
 * for professora); a escada é 🎯 primeiro, 🌗 metade, 🏅 todos do lado
 * oposto e, secreto, 🏆 a equipe inteira (os dois lados).
 *
 * Só dupla confirmada conta — quem monta o conjunto `parceiros` já
 * filtra isso. Parceiro que não está mais na equipe (ex-professor) não
 * entra em nenhuma conta, porque tudo parte da lista `equipe`.
 */

export const EMOJI_CACA = {
  primeiro: '🎯',
  meia: '🌗',
  completa: '🏅',
  equipe: '🏆',
} as const

export interface ProfessorCaca {
  user_id: string
  nome: string
  avatar_url: string | null
  papel: PapelDanca
}

export interface ProgressoCaca {
  /** Lado oposto, sem a própria pessoa. */
  meta: ProfessorCaca[]
  /** Da meta, com dupla confirmada. */
  pegos: ProfessorCaca[]
  /** Da meta, sem dupla. */
  faltam: ProfessorCaca[]
  /** Equipe inteira, sem a própria pessoa. */
  totalEquipe: number
  /** Da equipe inteira, com dupla. */
  pegosEquipe: number
  nivel: 0 | 1 | 2 | 3 | 4
}

export interface MarcoCaca {
  minimo: number
  emoji: string
  titulo: string
}

/** Ordem de nível da turma (menor = mais alto), igual ao `pesoTurma`. */
const ORDEM_NIVEL = { avancado: 0, intermediario: 1, iniciante: 2 } as const

/**
 * Papel que vale na caça: o da turma de nível mais alto que tenha papel;
 * sem turma, o papel principal. Com turma mas nenhum papel: null (fora
 * da caça, mesmo com papel principal preenchido).
 */
export function papelEfetivo(
  turmas: TurmaMembro[],
  papelPrincipal: PapelDanca | null,
  turmasCadastradas: Turma[],
): PapelDanca | null {
  if (turmas.length === 0) return papelPrincipal
  const peso = (nome: string) => {
    const nivel = turmasCadastradas.find((t) => t.nome === nome)?.nivel
    return nivel ? ORDEM_NIVEL[nivel] : pesoTurma(nome)
  }
  let melhor: TurmaMembro | undefined
  for (const m of turmas) {
    if (!m.papel_danca) continue
    if (!melhor || peso(m.turma) < peso(melhor.turma)) melhor = m
  }
  return melhor?.papel_danca ?? null
}

/** Quem pode ser caçado: cargo de professor e papel principal preenchido. */
export function equipeDaCaca(
  perfis: Pick<
    PerfilPublico,
    'id' | 'nome' | 'avatar_url' | 'cargos' | 'papel_principal'
  >[],
): ProfessorCaca[] {
  const equipe: ProfessorCaca[] = []
  for (const p of perfis) {
    if (!p.papel_principal) continue
    if (!p.cargos.some((c) => c.toLowerCase().includes('professor'))) continue
    equipe.push({
      user_id: p.id,
      nome: p.nome,
      avatar_url: p.avatar_url,
      papel: p.papel_principal,
    })
  }
  return equipe
}

/**
 * Os níveis da caça, do menor para o maior. Quando dois mínimos
 * coincidem (meta pequena), fica o de título mais alto; a meia equipe
 * só existe a partir de 2, para não repetir o "primeiro professor".
 */
export function marcosDaCaca(
  meta: number,
  totalEquipe: number,
  incluirSecreto: boolean,
): MarcoCaca[] {
  if (meta <= 0) return []
  const candidatos: MarcoCaca[] = [
    { minimo: 1, emoji: EMOJI_CACA.primeiro, titulo: 'Primeiro professor' },
  ]
  const meia = Math.ceil(meta / 2)
  if (meia > 1) {
    candidatos.push({ minimo: meia, emoji: EMOJI_CACA.meia, titulo: 'Meia equipe' })
  }
  candidatos.push({ minimo: meta, emoji: EMOJI_CACA.completa, titulo: 'Caça completa' })
  if (incluirSecreto) {
    candidatos.push({
      minimo: totalEquipe,
      emoji: EMOJI_CACA.equipe,
      titulo: 'Equipe inteira',
    })
  }
  const marcos: MarcoCaca[] = []
  for (const c of candidatos) {
    if (marcos.length > 0 && marcos[marcos.length - 1].minimo === c.minimo) {
      marcos[marcos.length - 1] = c
    } else {
      marcos.push(c)
    }
  }
  return marcos
}

/** Onde a pessoa está na caça, dado o papel dela e os parceiros confirmados. */
export function progressoCaca(
  meuId: string,
  meuPapel: PapelDanca,
  equipe: ProfessorCaca[],
  parceiros: Set<string>,
): ProgressoCaca {
  const outros = equipe.filter((p) => p.user_id !== meuId)
  const meta = outros.filter((p) => p.papel !== meuPapel)
  const pegos = meta.filter((p) => parceiros.has(p.user_id))
  const faltam = meta.filter((p) => !parceiros.has(p.user_id))
  const totalEquipe = outros.length
  const pegosEquipe = outros.filter((p) => parceiros.has(p.user_id)).length

  let nivel: ProgressoCaca['nivel'] = 0
  if (meta.length > 0) {
    const marcos = marcosDaCaca(meta.length, totalEquipe, false)
    const alcancados = marcos.filter((m) => pegos.length >= m.minimo).length
    nivel = Math.min(alcancados, 3) as ProgressoCaca['nivel']
    if (pegosEquipe === totalEquipe) nivel = 4
  }
  return { meta, pegos, faltam, totalEquipe, pegosEquipe, nivel }
}
