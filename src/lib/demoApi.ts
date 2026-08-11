import type { ForroApi } from './api'
import {
  addDays,
  diasSuspensos,
  pontosNoDesafio,
  proximaOcorrencia,
  toISODate,
} from './dates'
import { distanciaMetros, type Coordenada } from './geo'
import { blobToDataURL } from './image'
import { limiteCheckin, LIMITE_POR_JANELA } from './limites'
import type { PessoaMatricula } from './matricula'
import { ehEmail, normalizeTelefone, telefonesIguais } from './phone'
import { CARGOS_PADRAO, LIMITE_FAVORITOS, turmaLabel } from './types'
import type {
  AgendaEvent,
  AgendaEventInput,
  AlunoCadastrado,
  AttendanceRow,
  Badge,
  Cargo,
  Challenge,
  ChallengeInput,
  ChallengeJanela,
  ChallengeLocal,
  CheckinFavorito,
  Comment,
  ConfirmacaoPresenca,
  DistintivoDef,
  Notificacao,
  ParceiroDanca,
  ParceiroPossivel,
  DistintivoDefInput,
  DistintivoRecebedor,
  FeedItem,
  Feriado,
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
 * Implementação de demonstração: roda 100% no navegador, com dados de
 * exemplo em localStorage. Ativada automaticamente quando o Supabase
 * não está configurado (.env).
 */

interface CheckinRow {
  id: string
  user_id: string
  foto_url: string
  legenda: string | null
  criado_em: string
  /** Ausente nos dados antigos do localStorage — vale como false. */
  favorito?: boolean
  /** Desafios em que a foto valeu no local (espelha checkin_locais). */
  locais?: string[]
}

interface ChallengeRow {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string
  data_fim: string
  janelas: ChallengeJanela[]
  local: ChallengeLocal | null
  entrada_restrita?: boolean
  criado_por: string | null
}

interface DB {
  profiles: Profile[]
  roles: Record<string, Papel>
  /** telefone normalizado → senha (só no demo; produção usa Supabase Auth) */
  senhas: Record<string, string>
  checkins: CheckinRow[]
  reactions: {
    checkin_id: string
    user_id: string
    tipo: string
    /** Ausente nos dados antigos — cai na data da foto. */
    criado_em?: string
  }[]
  comments: {
    id: string
    checkin_id: string
    user_id: string
    texto: string
    criado_em: string
  }[]
  challenges: ChallengeRow[]
  members: { challenge_id: string; user_id: string; entrou_em: string }[]
  /** Convidados por telefone que ainda não criaram conta. */
  convidados: {
    challenge_id: string
    telefone: string
    telefone_exibicao: string | null
    nome: string | null
  }[]
  reports: {
    id: string
    checkin_id: string
    user_id: string
    motivo: string | null
    criado_em: string
    resolvido: boolean
  }[]
  events: AgendaEvent[]
  feriados: Feriado[]
  /** Ausente nos bancos demo antigos — vale como lista vazia. */
  confirmacoes?: { user_id: string; evento_id: string; data: string }[]
  duplas?: {
    id: string
    data: string
    de_user: string
    para_user: string
    confirmada: boolean
    criado_em: string
  }[]
  /** Última vez que cada pessoa abriu o painel de notificações. */
  notificacoesVistas?: Record<string, string>
  alunos: AlunoCadastrado[]
  turmas: Turma[]
  cargos: Cargo[]
  /** A contagem de recebedores é derivada em listDistintivos(). */
  distintivos: Omit<DistintivoDef, 'concedidos'>[]
  distintivosConcedidos: {
    distintivo_id: string
    user_id: string
    concedido_em: string
  }[]
}

const DB_KEY = 'fds-demo-db-v9'
const SESSION_KEY = 'fds-demo-uid'

function uuid(): string {
  return crypto.randomUUID()
}

function svgPhoto(h1: number, h2: number, emoji: string, texto: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${h1} 70% 40%)'/>` +
    `<stop offset='1' stop-color='hsl(${h2} 80% 22%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='800' height='1000' fill='url(#g)'/>` +
    `<text x='400' y='520' font-size='260' text-anchor='middle'>${emoji}</text>` +
    `<text x='400' y='720' font-size='40' text-anchor='middle' fill='rgba(255,255,255,0.85)' font-family='sans-serif' font-weight='bold'>${texto}</text>` +
    `<text x='400' y='940' font-size='28' text-anchor='middle' fill='rgba(255,255,255,0.5)' font-family='sans-serif'>foto de exemplo — modo demonstração</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function monthRange(now: Date): { inicio: string; fim: string } {
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { inicio: toISODate(inicio), fim: toISODate(fim) }
}

function seed(): DB {
  const now = new Date()

  const mkProfile = (
    nome: string,
    turmas: Profile['turmas'],
    telefone: string | null,
    semanas: number,
    cargos: string[] = [],
  ): Profile => ({
    id: uuid(),
    nome,
    avatar_url: null,
    turmas,
    cargos,
    telefone,
    // Contas de exemplo nascem sem e-mail, como as contas antigas de
    // produção: dá para exercitar o "cadastre seu e-mail" do perfil.
    email: null,
    criado_em: addDays(now, -7 * semanas).toISOString(),
  })

  const maria = mkProfile(
    'Maria Bonita',
    [{ turma: 'Intermediário', papel_danca: 'Conduzido(a)' }],
    '11 98888-0001',
    12,
    ['Monitor(a)'],
  )
  const joao = mkProfile(
    'João do Acordeon',
    [{ turma: 'Iniciante 01', papel_danca: 'Condutor(a)' }],
    '11 98888-0002',
    8,
    ['Membro de Comunicação'],
  )
  // Ana dança em duas turmas com papéis diferentes e acumula cargos
  const ana = mkProfile(
    'Ana Xote',
    [
      { turma: 'Avançado', papel_danca: 'Condutor(a)' },
      { turma: 'Intermediário', papel_danca: 'Conduzido(a)' },
    ],
    '11 98888-0003',
    20,
    ['Presidência', 'Professor(a)'],
  )
  const pedro = mkProfile(
    'Pedro Baião',
    [{ turma: 'Iniciante 02', papel_danca: 'Conduzido(a)' }],
    '11 98888-0004',
    3,
  )
  const profiles = [maria, joao, ana, pedro]

  const em = (diasAtras: number, hora: number, minuto: number): string => {
    const d = addDays(now, -diasAtras)
    d.setHours(hora, minuto, 0, 0)
    return d.toISOString()
  }

  const fotos = [
    svgPhoto(15, 330, '💃', 'Que noite boa!'),
    svgPhoto(270, 20, '🕺', 'Xote até tarde'),
    svgPhoto(200, 300, '🎶', 'Trio completo hoje'),
    svgPhoto(30, 260, '🪗', 'Aula de baião'),
    svgPhoto(340, 40, '🔥', 'Roda de forró'),
    svgPhoto(180, 320, '✨', 'Primeira aula!'),
  ]

  const checkins: CheckinRow[] = [
    { id: uuid(), user_id: maria.id, foto_url: fotos[0], legenda: 'Mais uma noite no pé! 💃', criado_em: em(1, 19, 45) },
    { id: uuid(), user_id: ana.id, foto_url: fotos[3], legenda: 'Baião novo no repertório 🪗', criado_em: em(1, 20, 10) },
    { id: uuid(), user_id: pedro.id, foto_url: fotos[5], legenda: 'Primeira aula! Já quero a próxima 🔥', criado_em: em(2, 19, 15) },
    { id: uuid(), user_id: maria.id, foto_url: fotos[2], legenda: 'A turma tava completa hoje 🎶', criado_em: em(4, 19, 20) },
    { id: uuid(), user_id: joao.id, foto_url: fotos[1], legenda: 'Evoluindo devagar e sempre', criado_em: em(7, 19, 40) },
    { id: uuid(), user_id: ana.id, foto_url: fotos[0], legenda: 'Melhor jeito de fechar o dia', criado_em: em(8, 20, 35) },
    { id: uuid(), user_id: maria.id, foto_url: fotos[4], legenda: null, criado_em: em(9, 19, 50) },
    { id: uuid(), user_id: joao.id, foto_url: fotos[4], legenda: null, criado_em: em(14, 19, 25) },
    { id: uuid(), user_id: maria.id, foto_url: fotos[1], legenda: 'Aprendi o dois pra lá, dois pra cá', criado_em: em(16, 19, 10) },
  ]

  const { inicio, fim } = monthRange(now)
  const desafio: ChallengeRow = {
    id: uuid(),
    titulo: 'Copa do mês — quem dança mais?',
    descricao:
      'Competição de presença: cada check-in na janela das aulas vale 1 ponto. Quem somar mais pontos até o fim do mês leva o destaque no Instagram! 🏆',
    data_inicio: inicio,
    data_fim: fim,
    // Janela ampla em todos os dias no demo, pra facilitar o teste em
    // qualquer dia/hora
    janelas: Array.from({ length: 7 }, (_, dia_semana) => ({
      dia_semana,
      hora_inicio: '00:00',
      hora_fim: '23:59',
    })),
    local: null,
    criado_por: ana.id,
  }

  const turmas: Turma[] = [
    { id: uuid(), nome: 'Iniciante 01' },
    { id: uuid(), nome: 'Iniciante 02' },
    { id: uuid(), nome: 'Intermediário' },
    { id: uuid(), nome: 'Avançado' },
  ]

  const cargos: Cargo[] = CARGOS_PADRAO.map((nome) => ({ id: uuid(), nome }))

  // Distintivos personalizados de exemplo: um já concedido, outro
  // ainda sem ninguém (pra mostrar o fluxo de entregar pelo painel)
  type DistintivoRow = Omit<DistintivoDef, 'concedidos'>
  const distintivoAlma: DistintivoRow = {
    id: uuid(),
    emoji: '🌟',
    titulo: 'Alma do Forró',
    descricao: 'Contagia a turma com energia boa toda aula',
  }
  const distintivoPadrinho: DistintivoRow = {
    id: uuid(),
    emoji: '🤝',
    titulo: 'Padrinho(a) de calouro',
    descricao: 'Ajudou alguém novo a se sentir em casa',
  }
  const distintivos: DistintivoRow[] = [distintivoAlma, distintivoPadrinho]
  const distintivosConcedidos = [
    {
      distintivo_id: distintivoAlma.id,
      user_id: maria.id,
      concedido_em: addDays(now, -5).toISOString(),
    },
  ]

  const eventos: AgendaEvent[] = [
    {
      id: uuid(),
      titulo: 'Forró na Rep 🎉',
      descricao: 'A festa do projeto! Traz um amigo novo.',
      turma: null,
      dia_semana: null,
      data: toISODate(addDays(now, 8)),
      hora: '21:00',
    },
    {
      // Evento HOJE: fazer check-in hoje rende o distintivo do evento
      id: uuid(),
      titulo: 'Aulão especial',
      descricao: 'Aulão aberto para todas as turmas!',
      turma: null,
      dia_semana: null,
      data: toISODate(now),
      hora: '19:00',
    },
    { id: uuid(), titulo: 'Aula — Iniciante 01', descricao: null, turma: 'Iniciante 01', dia_semana: 1, data: null, hora: '19:00' },
    { id: uuid(), titulo: 'Aula — Iniciante 02', descricao: null, turma: 'Iniciante 02', dia_semana: 2, data: null, hora: '19:00' },
    { id: uuid(), titulo: 'Aula — Intermediário', descricao: null, turma: 'Intermediário', dia_semana: 3, data: null, hora: '19:00' },
    { id: uuid(), titulo: 'Aula — Avançado', descricao: null, turma: 'Avançado', dia_semana: 4, data: null, hora: '20:00' },
  ]

  // Feriado de exemplo: cancela a PRÓXIMA aula de segunda (Iniciante 01)
  // para todas as turmas — mostra como a agenda avisa o cancelamento.
  const proximaSegunda = proximaOcorrencia(eventos[2], now)
  const feriados: Feriado[] = proximaSegunda
    ? [
        {
          id: uuid(),
          data: toISODate(proximaSegunda),
          motivo: 'Feriado nacional (exemplo)',
          turma: null,
          suspende_desafios: true,
        },
      ]
    : []

  const alunos: AlunoCadastrado[] = [
    { id: uuid(), nome: 'Maria Bonita', telefone: '11 98888-0001', turma: 'Intermediário', papel_danca: 'Conduzido(a)' },
    { id: uuid(), nome: 'João do Acordeon', telefone: '11 98888-0002', turma: 'Iniciante 01', papel_danca: 'Condutor(a)' },
    { id: uuid(), nome: 'Ana Xote', telefone: '11 98888-0003', turma: 'Avançado', papel_danca: 'Condutor(a)' },
    { id: uuid(), nome: 'Ana Xote', telefone: '11 98888-0003', turma: 'Intermediário', papel_danca: 'Conduzido(a)' },
    { id: uuid(), nome: 'Pedro Baião', telefone: '11 98888-0004', turma: 'Iniciante 02', papel_danca: 'Conduzido(a)' },
    // Alunos da chamada que ainda não criaram conta — use um destes
    // telefones na aba "Primeira vez" para testar o cadastro:
    { id: uuid(), nome: 'Luiz Gonzaga', telefone: '11 97777-1234', turma: 'Avançado', papel_danca: 'Condutor(a)' },
    // Felipe está em DUAS turmas com papéis diferentes:
    { id: uuid(), nome: 'Felipe Medeiros', telefone: '11 99999-0000', turma: 'Avançado', papel_danca: 'Condutor(a)' },
    { id: uuid(), nome: 'Felipe Medeiros', telefone: '11 99999-0000', turma: 'Intermediário', papel_danca: 'Conduzido(a)' },
  ]

  // Senha dos perfis de exemplo (só no demo): forro123
  const senhas: Record<string, string> = {}
  for (const p of profiles) {
    if (p.telefone) senhas[normalizeTelefone(p.telefone)] = 'forro123'
  }

  const reactions = [
    { checkin_id: checkins[0].id, user_id: joao.id, tipo: '🔥' },
    { checkin_id: checkins[0].id, user_id: ana.id, tipo: '❤️' },
    { checkin_id: checkins[2].id, user_id: maria.id, tipo: '👏' },
    { checkin_id: checkins[2].id, user_id: ana.id, tipo: '❤️' },
    { checkin_id: checkins[5].id, user_id: maria.id, tipo: '💃' },
  ]

  const comments = [
    {
      id: uuid(),
      checkin_id: checkins[2].id,
      user_id: maria.id,
      texto: 'Bem-vindo, Pedro! Amanhã tem mais 🎶',
      criado_em: em(2, 19, 40),
    },
    {
      id: uuid(),
      checkin_id: checkins[0].id,
      user_id: pedro.id,
      texto: 'Arrasou demais!',
      criado_em: em(1, 20, 0),
    },
  ]

  return {
    profiles,
    roles: {
      [maria.id]: 'aluno',
      [joao.id]: 'aluno',
      [ana.id]: 'organizador',
      [pedro.id]: 'aluno',
    },
    senhas,
    checkins,
    reactions,
    comments,
    challenges: [desafio],
    members: profiles.map((p) => ({
      challenge_id: desafio.id,
      user_id: p.id,
      entrou_em: em(16, 12, 0),
    })),
    convidados: [],
    reports: [],
    events: eventos,
    feriados,
    confirmacoes: [],
    duplas: [],
    notificacoesVistas: {},
    alunos,
    turmas,
    cargos,
    distintivos,
    distintivosConcedidos,
  }
}

export class DemoApi implements ForroApi {
  readonly mode = 'demo' as const
  private db: DB
  private authListeners = new Set<(uid: string | null) => void>()
  private feedListeners = new Set<() => void>()

  constructor() {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      this.db = JSON.parse(raw) as DB
    } else {
      // Versões antigas do banco demo são descartadas
      for (const k of [
        'fds-demo-db-v1',
        'fds-demo-db-v2',
        'fds-demo-db-v3',
        'fds-demo-db-v4',
        'fds-demo-db-v5',
        'fds-demo-db-v6',
        'fds-demo-db-v7',
        'fds-demo-db-v8',
      ]) {
        localStorage.removeItem(k)
      }
      this.db = seed()
      this.persist()
    }
    // Sessão órfã (perfil não existe mais, ex.: após reset do banco demo):
    // limpa para não travar o app numa conta fantasma.
    const uid = localStorage.getItem(SESSION_KEY)
    if (uid && !this.db.profiles.some((p) => p.id === uid)) {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  private persist() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.db))
  }

  private notifyFeed() {
    this.feedListeners.forEach((cb) => cb())
  }

  private uid(): string {
    const uid = localStorage.getItem(SESSION_KEY)
    if (!uid) throw new Error('Você precisa entrar primeiro')
    return uid
  }

  private iniciarSessao(userId: string) {
    localStorage.setItem(SESSION_KEY, userId)
    this.authListeners.forEach((cb) => cb(userId))
  }

  private membrosDaLista(telefone: string): AlunoCadastrado[] {
    return this.db.alunos.filter((a) => telefonesIguais(a.telefone, telefone))
  }

  // ---- Autenticação (telefone + senha) ----

  async getSessionUserId() {
    return localStorage.getItem(SESSION_KEY)
  }

  onAuthChange(cb: (uid: string | null) => void) {
    this.authListeners.add(cb)
    return () => this.authListeners.delete(cb)
  }

  async telefoneNaLista(telefone: string) {
    const matches = this.membrosDaLista(telefone)
    // Convidado de festa também pode se cadastrar: a festa é aberta,
    // então quem comprou ingresso pode não estar na lista de chamada.
    const convite = this.db.convidados.find(
      (c) => c.telefone === normalizeTelefone(telefone),
    )
    const jaTemConta = this.db.profiles.some(
      (p) => p.telefone && telefonesIguais(p.telefone, telefone),
    )
    return {
      existe: matches.length > 0 || Boolean(convite),
      nome: matches[0]?.nome ?? convite?.nome ?? null,
      jaTemConta,
    }
  }

  async signInTelefone(identificador: string, senha: string) {
    const id = identificador.trim()
    const porEmail = ehEmail(id)
    const p = porEmail
      ? this.db.profiles.find(
          (x) => x.email && x.email.toLowerCase() === id.toLowerCase(),
        )
      : // Espelha a produção: quem cadastrou e-mail perdeu o endereço
        // sintético, então o telefone não acha mais a conta
        this.db.profiles.find(
          (x) => !x.email && x.telefone && telefonesIguais(x.telefone, id),
        )
    // A senha é guardada pelo telefone, que é a chave estável do demo
    const chave = p?.telefone ? normalizeTelefone(p.telefone) : ''
    if (!p || this.db.senhas[chave] !== senha) {
      if (
        !porEmail &&
        this.db.profiles.some(
          (x) => x.email && x.telefone && telefonesIguais(x.telefone, id),
        )
      ) {
        throw new Error(
          'Não encontramos essa conta pelo telefone. Se você já cadastrou um e-mail, entre com ele.',
        )
      }
      throw new Error(
        porEmail ? 'E-mail ou senha incorretos' : 'Telefone ou senha incorretos',
      )
    }
    this.iniciarSessao(p.id)
  }

  async solicitarResetSenha(email: string) {
    // Sem servidor de e-mail no demo: o link seria impossível de
    // entregar, então a tela só confirma o envio como em produção.
    console.info('[demo] link de recuperação iria para', email)
  }

  async definirNovaSenha(senha: string) {
    await this.trocarSenha(senha)
  }

  async trocarSenha(senha: string) {
    const uid = localStorage.getItem(SESSION_KEY)
    const p = this.db.profiles.find((x) => x.id === uid)
    if (!p?.telefone) throw new Error('Entre na conta primeiro')
    this.db.senhas[normalizeTelefone(p.telefone)] = senha
    this.persist()
  }

  async trocarEmail(email: string) {
    const uid = localStorage.getItem(SESSION_KEY)
    const p = this.db.profiles.find((x) => x.id === uid)
    if (!p) throw new Error('Entre na conta primeiro')
    const novo = email.trim()
    if (
      novo &&
      this.db.profiles.some(
        (x) => x.id !== p.id && x.email?.toLowerCase() === novo.toLowerCase(),
      )
    ) {
      throw new Error('Esse e-mail já está em outra conta')
    }
    p.email = novo || null
    this.persist()
  }

  async signUpTelefone(telefone: string, email: string, senha: string) {
    const { existe, jaTemConta } = await this.telefoneNaLista(telefone)
    if (jaTemConta) {
      throw new Error('Este telefone já tem conta — use a aba Entrar')
    }
    if (!existe) {
      throw new Error(
        'Telefone não encontrado na lista de alunos. Fale com a organização!',
      )
    }
    const matches = this.membrosDaLista(telefone)
    const convite = this.db.convidados.find(
      (c) => c.telefone === normalizeTelefone(telefone),
    )
    const profile: Profile = {
      id: uuid(),
      // Convidado da festa não está na lista de chamada, mas o nome
      // veio na planilha de ingressos
      nome: matches[0]?.nome ?? convite?.nome ?? 'Dançarino(a)',
      avatar_url: null,
      // Veterano sem turma entra sem vínculo (espelha handle_new_user,
      // que filtra `a.turma is not null`)
      turmas: matches
        .filter((m): m is typeof m & { turma: string } => m.turma !== null)
        .map((m) => ({ turma: m.turma, papel_danca: m.papel_danca })),
      cargos: [],
      telefone: telefone.trim(),
      email: email.trim() || null,
      criado_em: new Date().toISOString(),
    }
    this.db.profiles.push(profile)
    this.db.roles[profile.id] = 'aluno'
    this.db.senhas[normalizeTelefone(telefone)] = senha

    // Convites viram participação e saem da espera (espelha o trecho
    // acrescentado a handle_new_user na migração 010)
    const norm = normalizeTelefone(telefone)
    for (const convite of this.db.convidados.filter(
      (c) => c.telefone === norm,
    )) {
      this.db.members.push({
        challenge_id: convite.challenge_id,
        user_id: profile.id,
        entrou_em: new Date().toISOString(),
      })
    }
    this.db.convidados = this.db.convidados.filter((c) => c.telefone !== norm)

    this.persist()
    this.iniciarSessao(profile.id)
  }

  async demoSignUpOrganizador(nome: string, telefone: string, senha: string) {
    const matches = this.membrosDaLista(telefone)
    const profile: Profile = {
      id: uuid(),
      nome: nome.trim() || matches[0]?.nome || 'Organizador(a)',
      avatar_url: null,
      // Veterano sem turma entra sem vínculo (espelha handle_new_user,
      // que filtra `a.turma is not null`)
      turmas: matches
        .filter((m): m is typeof m & { turma: string } => m.turma !== null)
        .map((m) => ({ turma: m.turma, papel_danca: m.papel_danca })),
      cargos: [],
      telefone: telefone.trim() || null,
      email: null,
      criado_em: new Date().toISOString(),
    }
    this.db.profiles.push(profile)
    this.db.roles[profile.id] = 'organizador'
    if (telefone.trim()) {
      this.db.senhas[normalizeTelefone(telefone)] = senha
    }
    this.persist()
    this.iniciarSessao(profile.id)
  }

  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    this.authListeners.forEach((cb) => cb(null))
  }

  // ---- Perfil ----

  async getProfile(id: string) {
    return this.db.profiles.find((p) => p.id === id) ?? null
  }

  async getMyRole(): Promise<Papel> {
    return this.db.roles[this.uid()] ?? 'aluno'
  }

  async updateProfile(patch: { nome?: string; avatarBlob?: Blob }) {
    const p = this.db.profiles.find((x) => x.id === this.uid())
    if (!p) throw new Error('Perfil não encontrado')
    if (patch.nome !== undefined) p.nome = patch.nome
    if (patch.avatarBlob) p.avatar_url = await blobToDataURL(patch.avatarBlob)
    this.persist()
    this.notifyFeed()
  }

  // ---- Feed / check-ins ----

  async getFeed(): Promise<FeedItem[]> {
    return [...this.db.checkins]
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .slice(0, 100)
      .map((c) => this.toFeedItem(c))
  }

  private toFeedItem(c: CheckinRow): FeedItem {
    const autor = this.db.profiles.find((p) => p.id === c.user_id)
    return {
      ...c,
      favorito: Boolean(c.favorito),
      autor: {
        nome: autor?.nome ?? 'Alguém',
        avatar_url: autor?.avatar_url ?? null,
        turma: autor ? turmaLabel(autor.turmas) : null,
        turmas: (autor?.turmas ?? []).map((t) => t.turma),
        cargos: autor?.cargos ?? [],
      },
      reacoes: this.db.reactions
        .filter((r) => r.checkin_id === c.id)
        .map((r) => ({ tipo: r.tipo, user_id: r.user_id })),
      comentarios: this.db.comments.filter((x) => x.checkin_id === c.id).length,
    }
  }

  subscribeFeed(cb: () => void) {
    this.feedListeners.add(cb)
    return () => this.feedListeners.delete(cb)
  }

  async createCheckin(
    foto: Blob,
    legenda: string,
    coords?: Coordenada | null,
  ) {
    // Mesma trava do trigger em produção (migração 007)
    const estado = limiteCheckin(
      this.db.checkins
        .filter((c) => c.user_id === this.uid())
        .map((c) => new Date(c.criado_em)),
    )
    if (!estado.pode) {
      throw new Error(
        estado.motivo === 'intervalo'
          ? 'Espere alguns minutos entre uma foto e outra 😉'
          : `Você já postou ${LIMITE_POR_JANELA} check-ins nas últimas horas. Curte a festa que depois dá pra postar mais! 💃`,
      )
    }
    const row: CheckinRow = {
      id: uuid(),
      user_id: this.uid(),
      foto_url: await blobToDataURL(foto),
      legenda: legenda.trim() || null,
      criado_em: new Date().toISOString(),
      // Mesmo veredito que a função registrar_checkin faz no servidor:
      // guarda em quais desafios valeu, nunca a coordenada. Não olha
      // participação de propósito — o veredito é sobre o lugar, e é o
      // que faz o ponto aparecer para quem entra depois (migração 014).
      locais: coords
        ? this.db.challenges
            .filter(
              (c) =>
                c.local && distanciaMetros(coords, c.local) <= c.local.raio_m,
            )
            .map((c) => c.id)
        : [],
    }
    this.db.checkins.push(row)
    this.persist()
    this.notifyFeed()
  }

  async deleteCheckin(id: string) {
    this.db.checkins = this.db.checkins.filter((c) => c.id !== id)
    this.db.reactions = this.db.reactions.filter((r) => r.checkin_id !== id)
    this.db.comments = this.db.comments.filter((c) => c.checkin_id !== id)
    this.db.reports = this.db.reports.filter((r) => r.checkin_id !== id)
    this.persist()
    this.notifyFeed()
  }

  async toggleReaction(checkinId: string, tipo: string) {
    const uid = this.uid()
    const existing = this.db.reactions.find(
      (r) => r.checkin_id === checkinId && r.user_id === uid,
    )
    const agora = new Date().toISOString()
    if (existing && existing.tipo === tipo) {
      this.db.reactions = this.db.reactions.filter((r) => r !== existing)
    } else if (existing) {
      existing.tipo = tipo
      existing.criado_em = agora
    } else {
      this.db.reactions.push({
        checkin_id: checkinId,
        user_id: uid,
        tipo,
        criado_em: agora,
      })
    }
    this.persist()
    this.notifyFeed()
  }

  async getComments(checkinId: string): Promise<Comment[]> {
    return this.db.comments
      .filter((c) => c.checkin_id === checkinId)
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((c) => {
        const autor = this.db.profiles.find((p) => p.id === c.user_id)
        return {
          ...c,
          autor: {
            nome: autor?.nome ?? 'Alguém',
            avatar_url: autor?.avatar_url ?? null,
          },
        }
      })
  }

  async addComment(checkinId: string, texto: string) {
    this.db.comments.push({
      id: uuid(),
      checkin_id: checkinId,
      user_id: this.uid(),
      texto: texto.trim(),
      criado_em: new Date().toISOString(),
    })
    this.persist()
    this.notifyFeed()
  }

  async deleteComment(id: string) {
    this.db.comments = this.db.comments.filter((c) => c.id !== id)
    this.persist()
    this.notifyFeed()
  }

  async reportCheckin(checkinId: string, motivo: string) {
    this.db.reports.push({
      id: uuid(),
      checkin_id: checkinId,
      user_id: this.uid(),
      motivo: motivo.trim() || null,
      criado_em: new Date().toISOString(),
      resolvido: false,
    })
    this.persist()
  }

  async checkinsDe(userId: string) {
    return this.db.checkins
      .filter((c) => c.user_id === userId)
      .map((c) => ({ criado_em: c.criado_em }))
  }

  async setFavorito(checkinId: string, favorito: boolean) {
    const c = this.db.checkins.find((x) => x.id === checkinId)
    if (!c) throw new Error('Check-in não encontrado')
    if (c.user_id !== this.uid()) {
      throw new Error('Você só pode favoritar os seus próprios check-ins')
    }
    if (favorito) {
      const total = this.db.checkins.filter(
        (x) => x.user_id === c.user_id && x.favorito && x.id !== checkinId,
      ).length
      if (total >= LIMITE_FAVORITOS) {
        throw new Error(
          `Você já tem ${LIMITE_FAVORITOS} favoritos. Desmarque um para guardar outro.`,
        )
      }
    }
    c.favorito = favorito
    this.persist()
    this.notifyFeed()
  }

  async favoritosDe(userId: string): Promise<CheckinFavorito[]> {
    return this.db.checkins
      .filter((c) => c.user_id === userId && c.favorito)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map((c) => ({
        id: c.id,
        foto_url: c.foto_url,
        legenda: c.legenda,
        criado_em: c.criado_em,
        reacoes: this.db.reactions
          .filter((r) => r.checkin_id === c.id)
          .map((r) => ({ tipo: r.tipo, user_id: r.user_id })),
        comentarios: this.db.comments.filter((x) => x.checkin_id === c.id)
          .length,
      }))
  }

  // ---- Desafios ----

  private toChallenge(c: ChallengeRow): Challenge {
    const uid = localStorage.getItem(SESSION_KEY)
    return {
      ...c,
      entrada_restrita: Boolean(c.entrada_restrita),
      participantes: this.db.members.filter((m) => m.challenge_id === c.id)
        .length,
      sou_membro: this.db.members.some(
        (m) => m.challenge_id === c.id && m.user_id === uid,
      ),
    }
  }

  async listChallenges(): Promise<Challenge[]> {
    return [...this.db.challenges]
      .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))
      .map((c) => this.toChallenge(c))
  }

  async getChallenge(id: string) {
    const c = this.db.challenges.find((x) => x.id === id)
    return c ? this.toChallenge(c) : null
  }

  async saveChallenge(data: ChallengeInput) {
    if (data.id) {
      const c = this.db.challenges.find((x) => x.id === data.id)
      if (!c) throw new Error('Desafio não encontrado')
      Object.assign(c, {
        titulo: data.titulo,
        descricao: data.descricao || null,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim,
        janelas: data.janelas,
        entrada_restrita: data.entrada_restrita,
        // Espelha o trigger marca_local_desde (migração 009): o marco
        // nasce quando a trava é ligada e é preservado depois.
        local: data.local && {
          ...data.local,
          desde: c.local?.desde ?? new Date().toISOString(),
        },
      })
    } else {
      this.db.challenges.push({
        id: uuid(),
        titulo: data.titulo,
        descricao: data.descricao || null,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim,
        janelas: data.janelas,
        entrada_restrita: data.entrada_restrita,
        local: data.local && {
          ...data.local,
          desde: new Date().toISOString(),
        },
        criado_por: this.uid(),
      })
    }
    this.persist()
  }

  async deleteChallenge(id: string) {
    this.db.challenges = this.db.challenges.filter((c) => c.id !== id)
    this.db.members = this.db.members.filter((m) => m.challenge_id !== id)
    this.persist()
  }

  private exigeConvite(id: string) {
    const c = this.db.challenges.find((x) => x.id === id)
    if (c?.entrada_restrita && this.db.roles[this.uid()] !== 'organizador') {
      throw new Error(
        'Este desafio é só para quem a organização adicionar (evento restrito)',
      )
    }
  }

  async joinChallenge(id: string) {
    const uid = this.uid()
    this.exigeConvite(id)
    if (
      !this.db.members.some((m) => m.challenge_id === id && m.user_id === uid)
    ) {
      this.db.members.push({
        challenge_id: id,
        user_id: uid,
        entrou_em: new Date().toISOString(),
      })
      this.persist()
    }
  }

  async leaveChallenge(id: string) {
    const uid = this.uid()
    this.exigeConvite(id)
    this.db.members = this.db.members.filter(
      (m) => !(m.challenge_id === id && m.user_id === uid),
    )
    this.persist()
  }

  async addMembroDesafio(challengeId: string, userId: string) {
    if (
      !this.db.members.some(
        (m) => m.challenge_id === challengeId && m.user_id === userId,
      )
    ) {
      this.db.members.push({
        challenge_id: challengeId,
        user_id: userId,
        entrou_em: new Date().toISOString(),
      })
      this.persist()
    }
  }

  async removeMembroDesafio(challengeId: string, userId: string) {
    this.db.members = this.db.members.filter(
      (m) => !(m.challenge_id === challengeId && m.user_id === userId),
    )
    this.persist()
  }

  async listConvidados(challengeId: string) {
    return this.db.convidados
      .filter((c) => c.challenge_id === challengeId)
      .map(({ telefone, telefone_exibicao, nome }) => ({
        telefone,
        telefone_exibicao,
        nome,
      }))
      .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))
  }

  async removeConvidado(challengeId: string, telefone: string) {
    const alvo = normalizeTelefone(telefone)
    this.db.convidados = this.db.convidados.filter(
      (c) => !(c.challenge_id === challengeId && c.telefone === alvo),
    )
    this.persist()
  }

  async importarConvidados(
    challengeId: string,
    linhas: { nome: string; telefone: string }[],
  ) {
    let adicionados = 0
    let pendentes = 0
    let jaEstavam = 0
    for (const linha of linhas) {
      const perfil = this.db.profiles.find(
        (p) => p.telefone && telefonesIguais(p.telefone, linha.telefone),
      )
      if (!perfil) {
        const tel = normalizeTelefone(linha.telefone)
        const existente = this.db.convidados.find(
          (c) => c.challenge_id === challengeId && c.telefone === tel,
        )
        if (existente) existente.nome = linha.nome || existente.nome
        else
          this.db.convidados.push({
            challenge_id: challengeId,
            telefone: tel,
            telefone_exibicao: linha.telefone,
            nome: linha.nome || null,
          })
        pendentes++
      } else if (
        this.db.members.some(
          (m) => m.challenge_id === challengeId && m.user_id === perfil.id,
        )
      ) {
        jaEstavam++
      } else {
        this.db.members.push({
          challenge_id: challengeId,
          user_id: perfil.id,
          entrou_em: new Date().toISOString(),
        })
        adicionados++
      }
    }
    this.persist()
    return { adicionados, pendentes, jaEstavam }
  }

  async getRanking(challenge: Challenge): Promise<RankingEntry[]> {
    const memberIds = this.db.members
      .filter((m) => m.challenge_id === challenge.id)
      .map((m) => m.user_id)
    // Aula cancelada = sem janela naquele dia, ninguém pontua
    const suspensos = diasSuspensos(this.db.feriados)
    return memberIds
      .map((uid) => {
        const p = this.db.profiles.find((x) => x.id === uid)
        // Máximo de 1 ponto por dia, mesmo com várias fotos
        const pontos = pontosNoDesafio(
          this.db.checkins
            .filter(
              (c) =>
                c.user_id === uid &&
                // Com trava de local, valem só os que têm veredito —
                // menos os anteriores à trava, que continuam valendo
                (!challenge.local ||
                  (challenge.local.desde !== null &&
                    c.criado_em < challenge.local.desde) ||
                  (c.locais ?? []).includes(challenge.id)),
            )
            .map((c) => new Date(c.criado_em)),
          challenge,
          suspensos,
        )
        return {
          user_id: uid,
          nome: p?.nome ?? 'Alguém',
          avatar_url: p?.avatar_url ?? null,
          turma: p ? turmaLabel(p.turmas) : null,
          pontos,
        }
      })
      .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome))
  }

  async contarDesafios(userId: string) {
    return this.db.members.filter((m) => m.user_id === userId).length
  }

  // ---- Agenda ----

  async listEvents(): Promise<AgendaEvent[]> {
    return [...this.db.events]
  }

  async saveEvent(e: AgendaEventInput) {
    this.db.events.push({
      id: uuid(),
      titulo: e.titulo,
      descricao: e.descricao || null,
      turma: e.turma,
      dia_semana: e.dia_semana,
      data: e.data,
      hora: e.hora,
    })
    this.persist()
  }

  async deleteEvent(id: string) {
    this.db.events = this.db.events.filter((e) => e.id !== id)
    this.persist()
  }

  async listFeriados(): Promise<Feriado[]> {
    return [...this.db.feriados].sort((a, b) => a.data.localeCompare(b.data))
  }

  async saveFeriado(f: FeriadoInput) {
    this.db.feriados.push({
      id: uuid(),
      data: f.data,
      motivo: f.motivo.trim() || null,
      turma: f.turma,
      suspende_desafios: f.suspende_desafios,
    })
    this.persist()
  }

  async deleteFeriado(id: string) {
    this.db.feriados = this.db.feriados.filter((f) => f.id !== id)
    this.persist()
  }

  // ---- Duplas de dança ----

  private fezCheckinEm(userId: string, data: string) {
    return this.db.checkins.some(
      (c) => c.user_id === userId && c.criado_em.slice(0, 10) === data,
    )
  }

  async parceirosPossiveis(data: string): Promise<ParceiroPossivel[]> {
    const uid = this.uid()
    const minhas = (this.db.duplas ?? []).filter(
      (d) => d.de_user === uid && d.data === data,
    )
    const ids = new Set(
      this.db.checkins
        .filter((c) => c.criado_em.slice(0, 10) === data && c.user_id !== uid)
        .map((c) => c.user_id),
    )
    return [...ids]
      .map((id) => {
        const p = this.db.profiles.find((x) => x.id === id)
        const marca = minhas.find((d) => d.para_user === id)
        return {
          user_id: id,
          nome: p?.nome ?? 'Alguém',
          avatar_url: p?.avatar_url ?? null,
          turma: p ? turmaLabel(p.turmas) : null,
          marcado: !!marca,
          confirmada: marca?.confirmada === true,
        }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async marcarDupla(parceiroId: string, data: string) {
    const uid = this.uid()
    if (parceiroId === uid) throw new Error('Não dá para marcar você mesmo')
    // Espelha a checagem de co-presença da função marcar_dupla
    if (!this.fezCheckinEm(uid, data)) {
      throw new Error('Você não fez check-in nesse dia')
    }
    if (!this.fezCheckinEm(parceiroId, data)) {
      throw new Error('Essa pessoa não fez check-in nesse dia')
    }
    this.db.duplas = this.db.duplas ?? []
    if (
      !this.db.duplas.some(
        (d) => d.data === data && d.de_user === uid && d.para_user === parceiroId,
      )
    ) {
      this.db.duplas.push({
        id: uuid(),
        data,
        de_user: uid,
        para_user: parceiroId,
        confirmada: false,
        criado_em: new Date().toISOString(),
      })
    }
    // Os dois se marcaram: confirma sozinho
    const oOutroMarcou = this.db.duplas.some(
      (d) => d.data === data && d.de_user === parceiroId && d.para_user === uid,
    )
    if (oOutroMarcou) {
      for (const d of this.db.duplas) {
        const par =
          d.data === data &&
          ((d.de_user === uid && d.para_user === parceiroId) ||
            (d.de_user === parceiroId && d.para_user === uid))
        if (par) d.confirmada = true
      }
    }
    this.persist()
  }

  async desmarcarDupla(parceiroId: string, data: string) {
    const uid = this.uid()
    this.db.duplas = (this.db.duplas ?? []).filter(
      (d) =>
        !(
          d.data === data &&
          ((d.de_user === uid && d.para_user === parceiroId) ||
            (d.de_user === parceiroId && d.para_user === uid))
        ),
    )
    this.persist()
  }

  async parceirosDe(userId: string): Promise<ParceiroDanca[]> {
    const porPessoa = new Map<string, { nome: string; avatar: string | null; dias: Set<string> }>()
    for (const d of this.db.duplas ?? []) {
      if (d.de_user !== userId || !d.confirmada) continue
      const p = this.db.profiles.find((x) => x.id === d.para_user)
      const atual = porPessoa.get(d.para_user) ?? {
        nome: p?.nome ?? 'Alguém',
        avatar: p?.avatar_url ?? null,
        dias: new Set<string>(),
      }
      atual.dias.add(d.data)
      porPessoa.set(d.para_user, atual)
    }
    return [...porPessoa.entries()]
      .map(([user_id, v]) => ({
        user_id,
        nome: v.nome,
        avatar_url: v.avatar,
        noites: v.dias.size,
      }))
      .sort((a, b) => b.noites - a.noites || a.nome.localeCompare(b.nome))
  }

  // ---- Notificações ----

  async listNotificacoes(): Promise<Notificacao[]> {
    const uid = this.uid()
    const meus = new Set(
      this.db.checkins.filter((c) => c.user_id === uid).map((c) => c.id),
    )
    const perfil = (id: string) => {
      const p = this.db.profiles.find((x) => x.id === id)
      return {
        id,
        nome: p?.nome ?? 'Alguém',
        avatar_url: p?.avatar_url ?? null,
      }
    }

    const itens: Notificacao[] = [
      ...this.db.reactions
        .filter((r) => meus.has(r.checkin_id) && r.user_id !== uid)
        .map((r) => ({
          id: `reacao:${r.checkin_id}:${r.user_id}`,
          tipo: 'reacao' as const,
          // Reações antigas do demo não têm hora: usa a da foto
          criado_em:
            r.criado_em ??
            this.db.checkins.find((c) => c.id === r.checkin_id)?.criado_em ??
            new Date().toISOString(),
          autor: perfil(r.user_id),
          detalhe: r.tipo,
          checkin_id: r.checkin_id,
        })),
      ...this.db.comments
        .filter((c) => meus.has(c.checkin_id) && c.user_id !== uid)
        .map((c) => ({
          id: `comentario:${c.id}`,
          tipo: 'comentario' as const,
          criado_em: c.criado_em,
          autor: perfil(c.user_id),
          detalhe: c.texto,
          checkin_id: c.checkin_id,
        })),
      ...(this.db.duplas ?? [])
        .filter((d) => d.para_user === uid)
        .map((d) => ({
          id: `dupla:${d.id}`,
          tipo: 'dupla' as const,
          criado_em: d.criado_em,
          autor: perfil(d.de_user),
          detalhe: null,
          checkin_id: null,
          data: d.data,
          pendente: !d.confirmada,
        })),
    ]
    return itens.sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  }

  async contarNaoLidas(): Promise<number> {
    const desde = this.db.notificacoesVistas?.[this.uid()]
    const itens = await this.listNotificacoes()
    return itens.filter((n) => n.pendente || !desde || n.criado_em > desde)
      .length
  }

  async marcarNotificacoesVistas() {
    this.db.notificacoesVistas = this.db.notificacoesVistas ?? {}
    this.db.notificacoesVistas[this.uid()] = new Date().toISOString()
    this.persist()
  }

  async confirmacoesDe(datas: string[]): Promise<ConfirmacaoPresenca[]> {
    const alvo = new Set(datas)
    return (this.db.confirmacoes ?? [])
      .filter((c) => alvo.has(c.data))
      .map((c) => {
        const p = this.db.profiles.find((x) => x.id === c.user_id)
        return {
          evento_id: c.evento_id,
          data: c.data,
          user_id: c.user_id,
          nome: p?.nome ?? 'Alguém',
          avatar_url: p?.avatar_url ?? null,
        }
      })
  }

  async confirmarPresenca(eventoId: string, data: string, vai: boolean) {
    const uid = this.uid()
    this.db.confirmacoes = (this.db.confirmacoes ?? []).filter(
      (c) => !(c.user_id === uid && c.evento_id === eventoId && c.data === data),
    )
    if (vai) {
      this.db.confirmacoes.push({ user_id: uid, evento_id: eventoId, data })
    }
    this.persist()
  }

  // ---- Organizador ----

  async getAttendance(inicioISO: string, fimISO: string) {
    const rows: AttendanceRow[] = this.db.checkins
      .filter((c) => {
        const dia = toISODate(new Date(c.criado_em))
        return dia >= inicioISO && dia <= fimISO
      })
      .map((c) => {
        const p = this.db.profiles.find((x) => x.id === c.user_id)
        return {
          data: c.criado_em,
          nome: p?.nome ?? 'Alguém',
          turma: p ? (turmaLabel(p.turmas) ?? '') : '',
        }
      })
    return rows.sort((a, b) => b.data.localeCompare(a.data))
  }

  async listReports(): Promise<Report[]> {
    return this.db.reports
      .filter((r) => !r.resolvido)
      .map((r) => {
        const checkin = this.db.checkins.find((c) => c.id === r.checkin_id)
        const autor = checkin
          ? this.db.profiles.find((p) => p.id === checkin.user_id)
          : undefined
        const denunciante = this.db.profiles.find((p) => p.id === r.user_id)
        return {
          id: r.id,
          checkin_id: r.checkin_id,
          motivo: r.motivo,
          criado_em: r.criado_em,
          foto_url: checkin?.foto_url ?? null,
          autor_nome: autor?.nome ?? null,
          denunciante_nome: denunciante?.nome ?? null,
        }
      })
  }

  async resolveReport(id: string, removerPost: boolean) {
    const report = this.db.reports.find((r) => r.id === id)
    if (!report) return
    if (removerPost) {
      await this.deleteCheckin(report.checkin_id)
    } else {
      report.resolvido = true
      this.persist()
    }
  }

  async listAlunosCadastrados(): Promise<AlunoCadastrado[]> {
    return [...this.db.alunos].sort(
      (a, b) =>
        (a.nome ?? '').localeCompare(b.nome ?? '') ||
        (a.turma ?? '').localeCompare(b.turma ?? ''),
    )
  }

  async saveAlunoCadastrado(a: {
    nome: string
    telefone: string
    turma: string
    papel_danca: PapelDanca | null
  }) {
    this.db.alunos.push({
      id: uuid(),
      nome: a.nome.trim() || null,
      telefone: a.telefone.trim(),
      turma: a.turma,
      papel_danca: a.papel_danca,
    })
    this.persist()
  }

  async deleteAlunoCadastrado(id: string) {
    this.db.alunos = this.db.alunos.filter((a) => a.id !== id)
    this.persist()
  }

  async matricularAlunos(plano: PessoaMatricula[]) {
    const comConta = plano.filter((p) => p.userId)
    const semConta = plano.filter((p) => !p.userId)

    // Quem tem conta: a planilha do semestre substitui as turmas do perfil
    for (const p of comConta) {
      const perfil = this.db.profiles.find((x) => x.id === p.userId)
      if (!perfil) continue
      perfil.turmas = p.turmasNovas
        .filter((t) => t.turma)
        .map((t) => ({ turma: t.turma!, papel_danca: t.papel_danca }))
    }

    // Quem não tem: a linha da chamada é que muda
    const idsVelhos = new Set(
      semConta.flatMap((p) => p.linhasChamada.map((l) => l.id)),
    )
    this.db.alunos = this.db.alunos.filter((a) => !idsVelhos.has(a.id))
    for (const p of semConta) {
      for (const t of p.turmasNovas) {
        this.db.alunos.push({
          id: uuid(),
          nome: p.nome,
          telefone: p.telefone.trim(),
          turma: t.turma,
          papel_danca: t.papel_danca,
        })
      }
    }

    this.persist()
    return { perfis: comConta.length, chamada: semConta.length }
  }

  async limparChamadaComConta() {
    const antes = this.db.alunos.length
    this.db.alunos = this.db.alunos.filter(
      (a) =>
        !this.db.profiles.some(
          (p) => p.telefone && telefonesIguais(a.telefone, p.telefone),
        ),
    )
    this.persist()
    return antes - this.db.alunos.length
  }

  async encerrarSemestre() {
    const comTurma = this.db.profiles.filter((p) => p.turmas.length > 0)
    for (const p of comTurma) p.turmas = []
    this.persist()
    return comTurma.length
  }

  async listProfiles(): Promise<Profile[]> {
    return [...this.db.profiles].sort((a, b) => a.nome.localeCompare(b.nome))
  }

  async listPerfisPublicos(): Promise<PerfilPublico[]> {
    return [...this.db.profiles]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(({ telefone: _ignorado, ...publico }) => publico)
  }

  async addTurmaAluno(userId: string, turma: string, papel: PapelDanca | null) {
    const p = this.db.profiles.find((x) => x.id === userId)
    if (!p) throw new Error('Aluno não encontrado')
    p.turmas = [
      ...p.turmas.filter((m) => m.turma !== turma),
      { turma, papel_danca: papel },
    ]
    this.persist()
    this.notifyFeed()
  }

  async removeTurmaAluno(userId: string, turma: string) {
    const p = this.db.profiles.find((x) => x.id === userId)
    if (!p) throw new Error('Aluno não encontrado')
    p.turmas = p.turmas.filter((m) => m.turma !== turma)
    this.persist()
    this.notifyFeed()
  }

  // ---- Turmas do semestre ----

  async listTurmas(): Promise<Turma[]> {
    return [...this.db.turmas].sort((a, b) => a.nome.localeCompare(b.nome))
  }

  async saveTurma(nome: string) {
    const limpo = nome.trim()
    if (!limpo) throw new Error('Nome da turma vazio')
    if (this.db.turmas.some((t) => t.nome.toLowerCase() === limpo.toLowerCase())) {
      throw new Error('Essa turma já existe')
    }
    this.db.turmas.push({ id: uuid(), nome: limpo })
    this.persist()
  }

  async deleteTurma(id: string) {
    this.db.turmas = this.db.turmas.filter((t) => t.id !== id)
    this.persist()
  }

  // ---- Cargos do projeto ----

  async listCargos(): Promise<Cargo[]> {
    return [...this.db.cargos]
  }

  async saveCargo(nome: string) {
    const limpo = nome.trim()
    if (!limpo) throw new Error('Nome do cargo vazio')
    if (this.db.cargos.some((c) => c.nome.toLowerCase() === limpo.toLowerCase())) {
      throw new Error('Esse cargo já existe')
    }
    this.db.cargos.push({ id: uuid(), nome: limpo })
    this.persist()
  }

  async deleteCargo(id: string) {
    this.db.cargos = this.db.cargos.filter((c) => c.id !== id)
    this.persist()
  }

  async addCargoAluno(userId: string, cargo: string) {
    const p = this.db.profiles.find((x) => x.id === userId)
    if (!p) throw new Error('Aluno não encontrado')
    if (!p.cargos.includes(cargo)) p.cargos = [...p.cargos, cargo]
    this.persist()
    this.notifyFeed()
  }

  async removeCargoAluno(userId: string, cargo: string) {
    const p = this.db.profiles.find((x) => x.id === userId)
    if (!p) throw new Error('Aluno não encontrado')
    p.cargos = p.cargos.filter((c) => c !== cargo)
    this.persist()
    this.notifyFeed()
  }

  // ---- Distintivos personalizados ----

  async listDistintivos(): Promise<DistintivoDef[]> {
    return this.db.distintivos.map((d) => ({
      ...d,
      concedidos: this.db.distintivosConcedidos.filter(
        (c) => c.distintivo_id === d.id,
      ).length,
    }))
  }

  async saveDistintivo(d: DistintivoDefInput) {
    const titulo = d.titulo.trim()
    if (!titulo) throw new Error('Título do distintivo vazio')
    if (!d.emoji.trim()) throw new Error('Escolha um emoji para o distintivo')
    this.db.distintivos.push({
      id: uuid(),
      emoji: d.emoji.trim(),
      titulo,
      descricao: d.descricao.trim(),
    })
    this.persist()
  }

  async deleteDistintivo(id: string) {
    this.db.distintivos = this.db.distintivos.filter((d) => d.id !== id)
    this.db.distintivosConcedidos = this.db.distintivosConcedidos.filter(
      (c) => c.distintivo_id !== id,
    )
    this.persist()
    this.notifyFeed()
  }

  async listRecebedores(distintivoId: string): Promise<DistintivoRecebedor[]> {
    return this.db.distintivosConcedidos
      .filter((c) => c.distintivo_id === distintivoId)
      .map((c) => {
        const p = this.db.profiles.find((x) => x.id === c.user_id)
        return {
          user_id: c.user_id,
          nome: p?.nome ?? 'Alguém',
          concedido_em: c.concedido_em,
        }
      })
      .sort((a, b) => b.concedido_em.localeCompare(a.concedido_em))
  }

  async concederDistintivo(distintivoId: string, userIds: string[]) {
    const agora = new Date().toISOString()
    for (const userId of userIds) {
      const jaTem = this.db.distintivosConcedidos.some(
        (c) => c.distintivo_id === distintivoId && c.user_id === userId,
      )
      if (!jaTem) {
        this.db.distintivosConcedidos.push({
          distintivo_id: distintivoId,
          user_id: userId,
          concedido_em: agora,
        })
      }
    }
    this.persist()
    this.notifyFeed()
  }

  async revogarDistintivo(distintivoId: string, userId: string) {
    this.db.distintivosConcedidos = this.db.distintivosConcedidos.filter(
      (c) => !(c.distintivo_id === distintivoId && c.user_id === userId),
    )
    this.persist()
    this.notifyFeed()
  }

  async distintivosDe(userId: string): Promise<Badge[]> {
    return this.db.distintivosConcedidos
      .filter((c) => c.user_id === userId)
      .map((c) => {
        const def = this.db.distintivos.find((d) => d.id === c.distintivo_id)
        return def
          ? {
              id: `custom-${def.id}`,
              emoji: def.emoji,
              titulo: def.titulo,
              descricao: def.descricao,
            }
          : null
      })
      .filter((b): b is Badge => b !== null)
  }

  // ---- Push ----

  async savePushSubscription() {
    // Sem backend no modo demo — nada a fazer.
  }
}
