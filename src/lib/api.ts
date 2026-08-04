import type {
  AgendaEvent,
  AgendaEventInput,
  AlunoCadastrado,
  AttendanceRow,
  Cargo,
  Challenge,
  ChallengeInput,
  Comment,
  FeedItem,
  Feriado,
  FeriadoInput,
  Papel,
  PapelDanca,
  Profile,
  RankingEntry,
  Report,
  Turma,
} from './types'

/**
 * Camada de dados única do app. Duas implementações:
 *  - SupabaseApi: produção (auth, Postgres, storage, realtime)
 *  - DemoApi: modo demonstração sem backend (localStorage) — usado
 *    automaticamente quando VITE_SUPABASE_URL não está configurada.
 */
export interface ForroApi {
  readonly mode: 'demo' | 'supabase'

  // ---- Autenticação (telefone + senha) ----
  getSessionUserId(): Promise<string | null>
  onAuthChange(cb: (userId: string | null) => void): () => void
  /** Entra com telefone + senha. */
  signInTelefone(telefone: string, senha: string): Promise<void>
  /**
   * Primeiro acesso: cria a conta se o telefone estiver na lista de
   * chamada. Nome e turma vêm da lista automaticamente.
   */
  signUpTelefone(telefone: string, senha: string): Promise<void>
  /** Consulta pré-cadastro: o telefone está na lista? Já tem conta? */
  telefoneNaLista(
    telefone: string,
  ): Promise<{ existe: boolean; nome: string | null; jaTemConta: boolean }>
  signOut(): Promise<void>
  /** Só no modo demo: cria organizador(a) sem passar pela lista. */
  demoSignUpOrganizador(
    nome: string,
    telefone: string,
    senha: string,
  ): Promise<void>

  // ---- Perfil ----
  getProfile(id: string): Promise<Profile | null>
  getMyRole(): Promise<Papel>
  updateProfile(patch: { nome?: string; avatarBlob?: Blob }): Promise<void>

  // ---- Feed / check-ins ----
  getFeed(): Promise<FeedItem[]>
  /** Notifica quando o feed muda (realtime). Retorna unsubscribe. */
  subscribeFeed(cb: () => void): () => void
  createCheckin(foto: Blob, legenda: string): Promise<void>
  deleteCheckin(id: string): Promise<void>
  toggleReaction(checkinId: string, tipo: string): Promise<void>
  getComments(checkinId: string): Promise<Comment[]>
  addComment(checkinId: string, texto: string): Promise<void>
  deleteComment(id: string): Promise<void>
  reportCheckin(checkinId: string, motivo: string): Promise<void>
  /** Check-ins de qualquer aluno (usado no próprio perfil e no público). */
  checkinsDe(userId: string): Promise<{ criado_em: string }[]>

  // ---- Desafios (competição de presença) ----
  listChallenges(): Promise<Challenge[]>
  getChallenge(id: string): Promise<Challenge | null>
  saveChallenge(data: ChallengeInput): Promise<void>
  deleteChallenge(id: string): Promise<void>
  joinChallenge(id: string): Promise<void>
  leaveChallenge(id: string): Promise<void>
  getRanking(challenge: Challenge): Promise<RankingEntry[]>
  /** Em quantos desafios um aluno entrou (estatística do perfil). */
  contarDesafios(userId: string): Promise<number>

  // ---- Agenda ----
  listEvents(): Promise<AgendaEvent[]>
  saveEvent(e: AgendaEventInput): Promise<void>
  deleteEvent(id: string): Promise<void>
  /**
   * Feriados/cancelamentos: suspendem a(s) aula(s) recorrente(s) numa
   * data específica (ex.: feriado nacional, professor ausente).
   */
  listFeriados(): Promise<Feriado[]>
  saveFeriado(f: FeriadoInput): Promise<void>
  deleteFeriado(id: string): Promise<void>

  // ---- Organizador ----
  getAttendance(inicioISO: string, fimISO: string): Promise<AttendanceRow[]>
  listReports(): Promise<Report[]>
  resolveReport(id: string, removerPost: boolean): Promise<void>
  listAlunosCadastrados(): Promise<AlunoCadastrado[]>
  saveAlunoCadastrado(a: {
    nome: string
    telefone: string
    turma: string
    papel_danca: PapelDanca | null
  }): Promise<void>
  deleteAlunoCadastrado(id: string): Promise<void>
  /**
   * Importação em lote da lista de chamada (CSV). Ignora combinações
   * telefone+turma repetidas (o mesmo aluno pode ter várias turmas).
   */
  importAlunos(
    rows: {
      nome: string
      telefone: string
      turma: string
      papel_danca: PapelDanca | null
    }[],
  ): Promise<{ importados: number; ignorados: number }>
  listProfiles(): Promise<Profile[]>
  /** Adiciona um vínculo turma+papel a um aluno (organizador). */
  addTurmaAluno(
    userId: string,
    turma: string,
    papel: PapelDanca | null,
  ): Promise<void>
  /** Remove um vínculo de turma de um aluno (organizador). */
  removeTurmaAluno(userId: string, turma: string): Promise<void>

  // ---- Turmas do semestre ----
  listTurmas(): Promise<Turma[]>
  saveTurma(nome: string): Promise<void>
  deleteTurma(id: string): Promise<void>

  // ---- Cargos do projeto ----
  listCargos(): Promise<Cargo[]>
  saveCargo(nome: string): Promise<void>
  deleteCargo(id: string): Promise<void>
  /** Dá um cargo a um aluno (organizador). */
  addCargoAluno(userId: string, cargo: string): Promise<void>
  removeCargoAluno(userId: string, cargo: string): Promise<void>

  // ---- Push (Fase 4) ----
  savePushSubscription(sub: PushSubscriptionJSON): Promise<void>
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
}

let instance: ForroApi | null = null

export async function getApi(): Promise<ForroApi> {
  if (instance) return instance
  if (hasSupabaseEnv()) {
    const { SupabaseApi } = await import('./supabaseApi')
    instance = new SupabaseApi()
  } else {
    const { DemoApi } = await import('./demoApi')
    instance = new DemoApi()
  }
  return instance
}
