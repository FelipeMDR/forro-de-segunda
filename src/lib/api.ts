import type { Coordenada } from './geo'
import type { PessoaMatricula } from './matricula'
import type {
  AgendaEvent,
  AgendaEventInput,
  AlunoCadastrado,
  AttendanceRow,
  Badge,
  Cargo,
  Challenge,
  ChallengeInput,
  CheckinComReacoes,
  CheckinFavorito,
  Comment,
  ConfirmacaoPresenca,
  ConvidadoDesafio,
  DistintivoDef,
  DistintivoDefInput,
  DistintivoRecebedor,
  FeedItem,
  Feriado,
  Notificacao,
  ParceiroDanca,
  ParceiroPossivel,
  FeriadoInput,
  Papel,
  PapelDanca,
  PerfilPublico,
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
  /**
   * Entra com e-mail + senha.
   *
   * Aceita telefone só pelas contas anteriores ao e-mail, que seguem no
   * endereço sintético — e esse é calculado a partir do número, sem
   * consulta nenhuma. Traduzir telefone em e-mail de verdade exigiria
   * uma consulta pública (quem vai entrar não tem sessão), que viraria
   * um jeito de descobrir o e-mail de qualquer aluno pelo número. Essa
   * porta some sozinha conforme as contas antigas cadastram e-mail.
   */
  signInTelefone(identificador: string, senha: string): Promise<void>
  /**
   * Primeiro acesso: cria a conta se o telefone estiver na lista de
   * chamada. Nome e turma vêm da lista automaticamente.
   *
   * O e-mail vira o e-mail da conta: é com ele que a pessoa passa a
   * entrar e é para ele que vai o link de recuperação de senha. O
   * telefone continua sendo o que libera o cadastro (é a chave da lista
   * de chamada), mas deixa de ser o identificador do login.
   */
  signUpTelefone(
    telefone: string,
    email: string,
    senha: string,
  ): Promise<void>
  /**
   * Dispara o e-mail de recuperação de senha. Não diz se a conta
   * existe: responder isso transformaria a tela num verificador de
   * quem é do projeto.
   */
  solicitarResetSenha(email: string): Promise<void>
  /** Define a senha nova (na sessão aberta pelo link do e-mail). */
  definirNovaSenha(senha: string): Promise<void>
  /** Troca a senha de quem está logado. */
  trocarSenha(senha: string): Promise<void>
  /** Cadastra ou troca o e-mail de recuperação de quem está logado. */
  trocarEmail(email: string): Promise<void>
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
  /**
   * Todos os perfis para a busca do aluno — SEM telefone. Não use
   * listProfiles() aqui: aquela é do painel e traz o número de todo
   * mundo, que não tem por que ir parar no aparelho de cada aluno.
   */
  listPerfisPublicos(): Promise<PerfilPublico[]>
  getMyRole(): Promise<Papel>
  updateProfile(patch: { nome?: string; avatarBlob?: Blob }): Promise<void>

  // ---- Feed / check-ins ----
  /**
   * Página do feed, da mais nova para a mais antiga.
   *
   * `antesDe` é a data do último item já carregado — paginação por
   * cursor, e não por deslocamento: como o feed recebe publicações
   * novas o tempo todo, um `offset` faria repetir ou pular itens quando
   * alguém postasse entre uma página e outra.
   */
  getFeed(opcoes?: { limite?: number; antesDe?: string }): Promise<FeedItem[]>
  /**
   * Uma publicação específica, fora da paginação do feed — é o que uma
   * notificação abre. `null` se o check-in não existe mais (denúncia
   * removida etc.). A foto em si pode já ter sido arquivada pela
   * retenção; quem chama trata isso, `getCheckin` só busca o registro.
   */
  getCheckin(id: string): Promise<FeedItem | null>
  /** Notifica quando o feed muda (realtime). Retorna unsubscribe. */
  subscribeFeed(cb: () => void): () => void
  /**
   * `coords` só é usada para validar desafios com trava de local, e não
   * é guardada em lugar nenhum — o que fica salvo é apenas em quais
   * desafios a foto valeu. Null = aluno negou o GPS: a foto entra no
   * feed, mas não valida desafio com local.
   */
  createCheckin(
    foto: Blob,
    legenda: string,
    coords?: Coordenada | null,
  ): Promise<void>
  deleteCheckin(id: string): Promise<void>
  toggleReaction(checkinId: string, tipo: string): Promise<void>
  getComments(checkinId: string): Promise<Comment[]>
  addComment(checkinId: string, texto: string): Promise<void>
  deleteComment(id: string): Promise<void>
  reportCheckin(checkinId: string, motivo: string): Promise<void>
  /** Check-ins de qualquer aluno (usado no próprio perfil e no público). */
  checkinsDe(userId: string): Promise<{ criado_em: string }[]>
  /**
   * Check-ins de um período com a contagem de reações — é o que a
   * retrospectiva usa para achar a foto mais curtida. Consulta à parte
   * porque `checkinsDe` é chamada em toda abertura de perfil e não
   * precisa carregar isso.
   */
  checkinsComReacoes(
    userId: string,
    desdeISO: string,
  ): Promise<CheckinComReacoes[]>
  /**
   * Marca/desmarca um check-in próprio como favorito. Favoritos ficam
   * numa galeria no perfil e escapam da política de retenção de fotos.
   * Erro se passar de LIMITE_FAVORITOS.
   */
  setFavorito(checkinId: string, favorito: boolean): Promise<void>
  /** Galeria de favoritos de alguém (própria ou de outro aluno). */
  favoritosDe(userId: string): Promise<CheckinFavorito[]>

  // ---- Desafios (competição de presença) ----
  listChallenges(): Promise<Challenge[]>
  getChallenge(id: string): Promise<Challenge | null>
  saveChallenge(data: ChallengeInput): Promise<void>
  deleteChallenge(id: string): Promise<void>
  joinChallenge(id: string): Promise<void>
  leaveChallenge(id: string): Promise<void>
  getRanking(challenge: Challenge): Promise<RankingEntry[]>
  /** Adiciona alguém a um desafio (organizador) — usado nos restritos. */
  addMembroDesafio(challengeId: string, userId: string): Promise<void>
  removeMembroDesafio(challengeId: string, userId: string): Promise<void>
  /** Convidados por telefone que ainda não criaram conta. */
  listConvidados(challengeId: string): Promise<ConvidadoDesafio[]>
  removeConvidado(challengeId: string, telefone: string): Promise<void>
  /**
   * Importa a lista de ingressos: quem já tem conta entra no desafio na
   * hora; quem não tem fica como convidado e entra sozinho ao se
   * cadastrar (a festa é aberta, nem todo comprador é do projeto).
   */
  importarConvidados(
    challengeId: string,
    linhas: { nome: string; telefone: string }[],
  ): Promise<{ adicionados: number; pendentes: number; jaEstavam: number }>
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
  /**
   * Quem confirmou presença nas datas pedidas. Traz nome e avatar
   * porque a graça é ver as caras de quem vai, não só a contagem.
   */
  confirmacoesDe(datas: string[]): Promise<ConfirmacaoPresenca[]>
  /** Confirma ou desmarca a própria presença numa ocorrência. */
  confirmarPresenca(
    eventoId: string,
    data: string,
    vai: boolean,
  ): Promise<void>

  // ---- Duplas de dança ----
  /**
   * Quem mais fez check-in naquele dia, já dizendo quem eu marquei.
   * É a grade de rostos que aparece depois do check-in.
   */
  parceirosPossiveis(data: string): Promise<ParceiroPossivel[]>
  /**
   * Marca que dancei com alguém. O banco exige que os dois tenham
   * check-in no dia e confirma sozinho se o outro já tinha marcado.
   */
  marcarDupla(parceiroId: string, data: string): Promise<void>
  /** Desfaz a marcação — vale para quem marcou e para quem foi marcado. */
  desmarcarDupla(parceiroId: string, data: string): Promise<void>
  /**
   * Pares confirmados de alguém.
   *
   * Sem `desde`: histórico completo — é o que alimenta o card do
   * perfil e o distintivo de rodízio, que são conquistas que não
   * fazem sentido zerar a cada semestre. Com `desde` (ISO): só as
   * noites dentro do período — é o que a retrospectiva usa, para não
   * herdar duplas de semestres já encerrados.
   */
  parceirosDe(userId: string, desde?: string): Promise<ParceiroDanca[]>

  // ---- Notificações ----
  /** Curtidas, comentários e marcações que apontam para mim. */
  listNotificacoes(): Promise<Notificacao[]>
  /** Quantas são mais novas que a última vez que abri o painel. */
  contarNaoLidas(): Promise<number>
  /** Carimba o painel como visto agora. */
  marcarNotificacoesVistas(): Promise<void>

  // ---- Organizador ----
  getAttendance(inicioISO: string, fimISO: string): Promise<AttendanceRow[]>
  listReports(): Promise<Report[]>
  resolveReport(id: string, removerPost: boolean): Promise<void>
  listAlunosCadastrados(): Promise<AlunoCadastrado[]>
  saveAlunoCadastrado(a: {
    nome: string
    telefone: string
    /** null/'' = veterano sem turma no semestre. */
    turma: string | null
    papel_danca: PapelDanca | null
  }): Promise<void>
  deleteAlunoCadastrado(id: string): Promise<void>
  /**
   * Matrícula do semestre a partir do CSV.
   *
   * Substitui o antigo `importAlunos`, que só escrevia na lista de
   * chamada — e por isso não fazia nada por quem já tinha conta, já que
   * a chamada só é lida na criação do cadastro. Aqui cada pessoa vai
   * para o lugar certo: quem tem conta tem as turmas do PERFIL
   * trocadas; quem não tem, a linha da CHAMADA.
   *
   * Recebe o plano já montado (`planejarMatricula`) porque é exatamente
   * o que o organizador conferiu na tela antes de confirmar.
   */
  matricularAlunos(
    plano: PessoaMatricula[],
  ): Promise<{ perfis: number; chamada: number }>
  /**
   * Tira da lista de chamada quem já criou conta. Não mexe no acesso
   * nem nas turmas: a chamada só vale na hora do cadastro, então essas
   * linhas já cumpriram o papel delas.
   */
  limparChamadaComConta(): Promise<number>
  /**
   * Fim de semestre: tira TODOS os alunos do app das turmas, sem tocar
   * em contas, pontos ou check-ins. Serve para rodar antes de importar
   * a matrícula nova — quem não voltar em nenhuma planilha simplesmente
   * fica sem turma, que é a situação de quem terminou o curso e
   * continua frequentando.
   *
   * Devolve quantas pessoas tinham turma.
   */
  encerrarSemestre(): Promise<number>
  /**
   * O semestre está encerrado? É o estado em que NINGUÉM tem turma —
   * exatamente o que `encerrarSemestre` produz e a matrícula desfaz.
   *
   * Deriva do banco em vez de guardar uma bandeira: uma bandeira
   * poderia divergir do que aconteceu de fato (alguém apagar turmas na
   * mão, uma matrícula parcial), e aqui não tem como.
   */
  semestreEncerrado(): Promise<boolean>
  /**
   * Início do semestre atual: a data do último "Encerrar semestre".
   * `null` se isso nunca aconteceu — aí quem chama cai para a data de
   * criação da própria conta. É o que a retrospectiva usa em vez de
   * chutar pelo calendário (1º de janeiro / 1º de julho), que não tem
   * relação com quando as turmas do projeto de fato começam.
   */
  inicioSemestreAtual(): Promise<string | null>
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

  // ---- Distintivos personalizados ----
  /** Catálogo de distintivos que a organização pode conceder. */
  listDistintivos(): Promise<DistintivoDef[]>
  saveDistintivo(d: DistintivoDefInput): Promise<void>
  /** Apaga o distintivo do catálogo — remove também de quem já tinha. */
  deleteDistintivo(id: string): Promise<void>
  /** Quem já recebeu esse distintivo (pro painel gerenciar/revogar). */
  listRecebedores(distintivoId: string): Promise<DistintivoRecebedor[]>
  /** Concede um distintivo a um ou mais alunos de uma vez (ex.: top 3 de um desafio). */
  concederDistintivo(distintivoId: string, userIds: string[]): Promise<void>
  revogarDistintivo(distintivoId: string, userId: string): Promise<void>
  /** Distintivos personalizados que um aluno específico já recebeu. */
  distintivosDe(userId: string): Promise<Badge[]>

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
