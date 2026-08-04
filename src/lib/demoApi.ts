import type { ForroApi } from './api'
import { addDays, pontosNoDesafio, toISODate } from './dates'
import { blobToDataURL } from './image'
import { normalizeTelefone, telefonesIguais } from './phone'
import { turmaLabel } from './types'
import type {
  AgendaEvent,
  AgendaEventInput,
  AlunoCadastrado,
  AttendanceRow,
  Challenge,
  ChallengeInput,
  Comment,
  FeedItem,
  Papel,
  PapelDanca,
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
}

interface ChallengeRow {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string
  data_fim: string
  dias_semana: number[]
  hora_inicio: string
  hora_fim: string
  criado_por: string | null
}

interface DB {
  profiles: Profile[]
  roles: Record<string, Papel>
  /** telefone normalizado → senha (só no demo; produção usa Supabase Auth) */
  senhas: Record<string, string>
  checkins: CheckinRow[]
  reactions: { checkin_id: string; user_id: string; tipo: string }[]
  comments: {
    id: string
    checkin_id: string
    user_id: string
    texto: string
    criado_em: string
  }[]
  challenges: ChallengeRow[]
  members: { challenge_id: string; user_id: string; entrou_em: string }[]
  reports: {
    id: string
    checkin_id: string
    user_id: string
    motivo: string | null
    criado_em: string
    resolvido: boolean
  }[]
  events: AgendaEvent[]
  alunos: AlunoCadastrado[]
  turmas: Turma[]
}

const DB_KEY = 'fds-demo-db-v4'
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
  ): Profile => ({
    id: uuid(),
    nome,
    avatar_url: null,
    turmas,
    telefone,
    criado_em: addDays(now, -7 * semanas).toISOString(),
  })

  const maria = mkProfile(
    'Maria Bonita',
    [{ turma: 'Intermediário', papel_danca: 'Conduzido(a)' }],
    '11 98888-0001',
    12,
  )
  const joao = mkProfile(
    'João do Acordeon',
    [{ turma: 'Iniciante 01', papel_danca: 'Condutor(a)' }],
    '11 98888-0002',
    8,
  )
  // Ana dança em duas turmas com papéis diferentes
  const ana = mkProfile(
    'Ana Xote',
    [
      { turma: 'Avançado', papel_danca: 'Condutor(a)' },
      { turma: 'Intermediário', papel_danca: 'Conduzido(a)' },
    ],
    '11 98888-0003',
    20,
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
    // Janela ampla no demo para facilitar o teste em qualquer dia/hora
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    hora_inicio: '00:00',
    hora_fim: '23:59',
    criado_por: ana.id,
  }

  const turmas: Turma[] = [
    { id: uuid(), nome: 'Iniciante 01' },
    { id: uuid(), nome: 'Iniciante 02' },
    { id: uuid(), nome: 'Intermediário' },
    { id: uuid(), nome: 'Avançado' },
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
    reports: [],
    events: eventos,
    alunos,
    turmas,
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
      for (const k of ['fds-demo-db-v1', 'fds-demo-db-v2', 'fds-demo-db-v3']) {
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
    const jaTemConta = this.db.profiles.some(
      (p) => p.telefone && telefonesIguais(p.telefone, telefone),
    )
    return {
      existe: matches.length > 0,
      nome: matches[0]?.nome ?? null,
      jaTemConta,
    }
  }

  async signInTelefone(telefone: string, senha: string) {
    const norm = normalizeTelefone(telefone)
    const p = this.db.profiles.find(
      (x) => x.telefone && telefonesIguais(x.telefone, telefone),
    )
    if (!p || this.db.senhas[norm] !== senha) {
      throw new Error('Telefone ou senha incorretos')
    }
    this.iniciarSessao(p.id)
  }

  async signUpTelefone(telefone: string, senha: string) {
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
    const profile: Profile = {
      id: uuid(),
      nome: matches[0]?.nome ?? 'Dançarino(a)',
      avatar_url: null,
      turmas: matches.map((m) => ({
        turma: m.turma,
        papel_danca: m.papel_danca,
      })),
      telefone: telefone.trim(),
      criado_em: new Date().toISOString(),
    }
    this.db.profiles.push(profile)
    this.db.roles[profile.id] = 'aluno'
    this.db.senhas[normalizeTelefone(telefone)] = senha
    this.persist()
    this.iniciarSessao(profile.id)
  }

  async demoSignUpOrganizador(nome: string, telefone: string, senha: string) {
    const matches = this.membrosDaLista(telefone)
    const profile: Profile = {
      id: uuid(),
      nome: nome.trim() || matches[0]?.nome || 'Organizador(a)',
      avatar_url: null,
      turmas: matches.map((m) => ({
        turma: m.turma,
        papel_danca: m.papel_danca,
      })),
      telefone: telefone.trim() || null,
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
      autor: {
        nome: autor?.nome ?? 'Alguém',
        avatar_url: autor?.avatar_url ?? null,
        turma: autor ? turmaLabel(autor.turmas) : null,
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

  async createCheckin(foto: Blob, legenda: string) {
    const row: CheckinRow = {
      id: uuid(),
      user_id: this.uid(),
      foto_url: await blobToDataURL(foto),
      legenda: legenda.trim() || null,
      criado_em: new Date().toISOString(),
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
    if (existing && existing.tipo === tipo) {
      this.db.reactions = this.db.reactions.filter((r) => r !== existing)
    } else if (existing) {
      existing.tipo = tipo
    } else {
      this.db.reactions.push({ checkin_id: checkinId, user_id: uid, tipo })
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

  // ---- Desafios ----

  private toChallenge(c: ChallengeRow): Challenge {
    const uid = localStorage.getItem(SESSION_KEY)
    return {
      ...c,
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
        dias_semana: data.dias_semana,
        hora_inicio: data.hora_inicio,
        hora_fim: data.hora_fim,
      })
    } else {
      this.db.challenges.push({
        id: uuid(),
        titulo: data.titulo,
        descricao: data.descricao || null,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim,
        dias_semana: data.dias_semana,
        hora_inicio: data.hora_inicio,
        hora_fim: data.hora_fim,
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

  async joinChallenge(id: string) {
    const uid = this.uid()
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
    this.db.members = this.db.members.filter(
      (m) => !(m.challenge_id === id && m.user_id === uid),
    )
    this.persist()
  }

  async getRanking(challenge: Challenge): Promise<RankingEntry[]> {
    const memberIds = this.db.members
      .filter((m) => m.challenge_id === challenge.id)
      .map((m) => m.user_id)
    return memberIds
      .map((uid) => {
        const p = this.db.profiles.find((x) => x.id === uid)
        // Máximo de 1 ponto por dia, mesmo com várias fotos
        const pontos = pontosNoDesafio(
          this.db.checkins
            .filter((c) => c.user_id === uid)
            .map((c) => new Date(c.criado_em)),
          challenge,
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
        a.turma.localeCompare(b.turma),
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

  async importAlunos(
    rows: {
      nome: string
      telefone: string
      turma: string
      papel_danca: PapelDanca | null
    }[],
  ) {
    let importados = 0
    let ignorados = 0
    for (const row of rows) {
      const jaExiste = this.db.alunos.some(
        (a) =>
          telefonesIguais(a.telefone, row.telefone) &&
          a.turma.toLowerCase() === row.turma.toLowerCase(),
      )
      if (jaExiste) {
        ignorados++
        continue
      }
      this.db.alunos.push({
        id: uuid(),
        nome: row.nome.trim() || null,
        telefone: row.telefone.trim(),
        turma: row.turma.trim(),
        papel_danca: row.papel_danca,
      })
      importados++
    }
    this.persist()
    return { importados, ignorados }
  }

  async listProfiles(): Promise<Profile[]> {
    return [...this.db.profiles].sort((a, b) => a.nome.localeCompare(b.nome))
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

  // ---- Push ----

  async savePushSubscription() {
    // Sem backend no modo demo — nada a fazer.
  }
}
