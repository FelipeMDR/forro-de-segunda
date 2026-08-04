export type Papel = 'aluno' | 'organizador'

/** Papel na dança dentro de uma turma. */
export type PapelDanca = 'Condutor(a)' | 'Conduzido(a)'

export const PAPEIS_DANCA: PapelDanca[] = ['Condutor(a)', 'Conduzido(a)']

/**
 * Vínculo aluno ↔ turma. Um aluno pode estar em várias turmas com
 * papéis diferentes (ex.: Condutor no Avançado e Conduzido no Inter).
 */
export interface TurmaMembro {
  turma: string
  papel_danca: PapelDanca | null
}

export interface Profile {
  id: string
  nome: string
  avatar_url: string | null
  /** Turmas definidas pela organização — aluno não edita. */
  turmas: TurmaMembro[]
  /** Cargos no projeto (Presidência, Professor(a)…) — só a organização define. */
  cargos: string[]
  telefone: string | null
  criado_em: string
}

/** Rótulo compacto das turmas de alguém (feed, ranking, chamada). */
export function turmaLabel(turmas: TurmaMembro[]): string | null {
  if (turmas.length === 0) return null
  return turmas
    .map((m) =>
      m.papel_danca
        ? `${m.turma} (${m.papel_danca === 'Condutor(a)' ? 'condutor' : 'conduzido'})`
        : m.turma,
    )
    .join(' · ')
}

export interface FeedItem {
  id: string
  user_id: string
  foto_url: string
  legenda: string | null
  criado_em: string
  autor: { nome: string; avatar_url: string | null; turma: string | null }
  reacoes: { tipo: string; user_id: string }[]
  comentarios: number
}

export interface Comment {
  id: string
  checkin_id: string
  user_id: string
  texto: string
  criado_em: string
  autor: { nome: string; avatar_url: string | null }
}

/**
 * Desafio = competição de presença: quem somar mais check-ins válidos
 * dentro do período e da janela (dias da semana + horário) vence.
 */
export interface Challenge {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string // "YYYY-MM-DD"
  data_fim: string // "YYYY-MM-DD"
  /** Dias em que o check-in vale ponto: 0 = domingo … 6 = sábado. */
  dias_semana: number[]
  /** "HH:MM" */
  hora_inicio: string
  /** "HH:MM" */
  hora_fim: string
  criado_por: string | null
  participantes: number
  sou_membro: boolean
}

export interface ChallengeInput {
  id?: string
  titulo: string
  descricao: string
  data_inicio: string
  data_fim: string
  dias_semana: number[]
  hora_inicio: string
  hora_fim: string
}

export interface RankingEntry {
  user_id: string
  nome: string
  avatar_url: string | null
  turma: string | null
  pontos: number
}

/** Evento da agenda: data única (ex.: Forró na Rep) ou semanal (aula da turma). */
export interface AgendaEvent {
  id: string
  titulo: string
  descricao: string | null
  /** null = para todo mundo; senão só aparece para essa turma. */
  turma: string | null
  /** Recorrente semanal: 0–6. Excludente com `data`. */
  dia_semana: number | null
  /** Data única "YYYY-MM-DD". Excludente com `dia_semana`. */
  data: string | null
  /** "HH:MM" */
  hora: string | null
}

export interface AgendaEventInput {
  titulo: string
  descricao: string
  turma: string | null
  dia_semana: number | null
  data: string | null
  hora: string | null
}

/**
 * Linha da lista de chamada: telefone → turma (+ papel na dança).
 * O mesmo telefone pode aparecer em várias linhas (uma por turma).
 */
export interface AlunoCadastrado {
  id: string
  nome: string | null
  telefone: string
  turma: string
  papel_danca: PapelDanca | null
}

/** Distintivo exibido no perfil (derivado dos dados, nada é armazenado). */
export interface Badge {
  id: string
  emoji: string
  titulo: string
  descricao: string
}

export interface AttendanceRow {
  data: string
  nome: string
  turma: string
}

export interface Report {
  id: string
  checkin_id: string
  motivo: string | null
  criado_em: string
  foto_url: string | null
  autor_nome: string | null
  denunciante_nome: string | null
}

/** Turma do semestre, definida pela organização (ex.: "Iniciante 01"). */
export interface Turma {
  id: string
  nome: string
}

/** Cargo no projeto (Presidência, Diretor(a) de Ensino, Monitor(a)…). */
export interface Cargo {
  id: string
  nome: string
}

/** Cargos padrão do Forró de Segunda (editáveis no painel). */
export const CARGOS_PADRAO = [
  'Presidência',
  'Vice-Presidência',
  'Diretor(a) de Ensino',
  'Diretor(a) de RH',
  'Diretor(a) de Comunicação',
  'Diretor(a) de Recursos',
  'Professor(a)',
  'Monitor(a)',
  'Membro de RH',
  'Membro de Comunicação',
  'Membro de Recursos',
] as const

/** Emoji do cargo — por palavra-chave, para cargos novos também terem um. */
export function emojiCargo(nome: string): string {
  const n = nome.toLowerCase()
  if (n.includes('presid')) return n.includes('vice') ? '⭐' : '👑'
  if (n.includes('ensino')) return '📚'
  if (n.includes('professor')) return '🪗'
  if (n.includes('monitor')) return '🙋'
  if (n.includes('comunica')) return '📣'
  if (n.includes('recurso')) return '💰'
  if (n.includes('rh') || n.includes('humanos')) return '🤝'
  return '🎖️'
}

export const REACTION_TYPES = ['❤️', '🔥', '👏', '💃'] as const

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

export const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
