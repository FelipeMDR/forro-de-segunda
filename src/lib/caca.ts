import type { ForroApi } from './api'
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
 * for professora); a escada é 🎯 primeiro, 🌗 metade (só com meta ≥ 3), 🏅 todos do lado
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

/** Degrau de cada título na escada (1 a 3; o 4 é decidido em progressoCaca). */
const DEGRAU: Record<string, number> = {
  'Primeiro professor': 1,
  'Meia equipe': 2,
  'Caça completa': 3,
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
  // Duas escalas na mesma comparação: o nível cadastrado vira 0/1/2 e,
  // sem ele, vale o pesoTurma (avançado 0, inter 1, iniciante 2+). Bate
  // porque o pesoTurma foi desenhado nessa mesma ordem.
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
    // O nível é o degrau do TÍTULO do maior marco alcançado, não a
    // contagem de marcos: com meta 1, o único professor já é a caça completa.
    const alcancado = marcos.filter((m) => pegos.length >= m.minimo).pop()
    if (alcancado) nivel = DEGRAU[alcancado.titulo] as ProgressoCaca['nivel']
    if (pegosEquipe === totalEquipe) nivel = 4
  }
  return { meta, pegos, faltam, totalEquipe, pegosEquipe, nivel }
}

export interface ResultadosDaCaca {
  equipe: { user_id: string; papel: PapelDanca }[]
  resultados: {
    user_id: string
    nivel: number
    pegos: number
    meta: number
    total_equipe: number
  }[]
}

/**
 * A foto da caça no fim do semestre: a equipe e o nível de cada um que
 * chegou a algum degrau. Professores caçam também. `pegos` é sempre a
 * contagem da meta — no nível 4 o distintivo mostra a equipe inteira.
 */
export function resultadosDaCaca(
  perfis: PerfilPublico[],
  turmas: Turma[],
  duplas: { de_user: string; para_user: string }[],
): ResultadosDaCaca {
  const equipe = equipeDaCaca(perfis)
  const parceirosDe = new Map<string, Set<string>>()
  for (const d of duplas) {
    let s = parceirosDe.get(d.de_user)
    if (!s) parceirosDe.set(d.de_user, (s = new Set()))
    s.add(d.para_user)
  }
  const resultados: ResultadosDaCaca['resultados'] = []
  for (const p of perfis) {
    const papel = papelEfetivo(p.turmas, p.papel_principal, turmas)
    if (!papel) continue
    const r = progressoCaca(p.id, papel, equipe, parceirosDe.get(p.id) ?? new Set())
    if (r.nivel < 1) continue
    resultados.push({
      user_id: p.id,
      nivel: r.nivel,
      pegos: r.pegos.length,
      meta: r.meta.length,
      total_equipe: r.totalEquipe,
    })
  }
  return {
    equipe: equipe.map((e) => ({ user_id: e.user_id, papel: e.papel })),
    resultados,
  }
}

/**
 * O que congelar da caça do semestre que acaba. Roda no
 * `encerrarSemestre` ANTES de apagar as matrículas: o papel de quem tem
 * turma vem dela.
 */
export async function cacaParaCongelar(
  api: Pick<
    ForroApi,
    'inicioSemestreAtual' | 'listPerfisPublicos' | 'listTurmas' | 'duplasConfirmadasEntre'
  >,
): Promise<ResultadosDaCaca & { inicio: string | null }> {
  const inicio = await api.inicioSemestreAtual()
  const [perfis, turmas, duplas] = await Promise.all([
    api.listPerfisPublicos(),
    api.listTurmas(),
    api.duplasConfirmadasEntre(inicio, new Date().toISOString()),
  ])
  return { inicio, ...resultadosDaCaca(perfis, turmas, duplas) }
}
