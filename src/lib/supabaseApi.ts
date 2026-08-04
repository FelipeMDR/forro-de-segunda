import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ForroApi } from './api'
import { pontosNoDesafio } from './dates'
import { extensionFor } from './image'
import { synthEmail, telefonesIguais } from './phone'
import { turmaLabel } from './types'
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
  TurmaMembro,
} from './types'

/** Traduz mensagens comuns do Supabase Auth para o usuário final. */
function traduz(msg: string): string {
  const mapa: Record<string, string> = {
    'Invalid login credentials': 'Telefone ou senha incorretos',
    'User already registered':
      'Este telefone já tem conta — use a aba Entrar',
    'Password should be at least 6 characters':
      'A senha precisa ter pelo menos 6 caracteres',
  }
  if (mapa[msg]) return mapa[msg]
  // Tabela nova que ainda não foi criada no banco em produção
  if (msg.includes('schema cache')) {
    return (
      'Falta rodar a migração do banco. No Supabase: SQL Editor → cole o ' +
      'arquivo mais recente de supabase/migracoes → Run, e depois ' +
      'Project Settings → API → Reload schema cache.'
    )
  }
  return msg
}

function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(traduz(res.error.message))
  return res.data
}

function horaCurta(v: unknown): string {
  return String(v ?? '00:00').slice(0, 5)
}

export class SupabaseApi implements ForroApi {
  readonly mode = 'supabase' as const
  private sb: SupabaseClient

  constructor() {
    this.sb = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )
  }

  // ---- Autenticação ----

  async getSessionUserId() {
    const { data } = await this.sb.auth.getSession()
    return data.session?.user.id ?? null
  }

  onAuthChange(cb: (uid: string | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      cb(session?.user.id ?? null)
    })
    return () => data.subscription.unsubscribe()
  }

  async telefoneNaLista(telefone: string) {
    const data = ok(
      await this.sb.rpc('telefone_na_lista', { tel: telefone }),
    ) as { existe: boolean; nome: string | null; ja_tem_conta: boolean }
    return {
      existe: data.existe,
      nome: data.nome,
      jaTemConta: data.ja_tem_conta,
    }
  }

  async signInTelefone(telefone: string, senha: string) {
    const { error } = await this.sb.auth.signInWithPassword({
      email: synthEmail(telefone),
      password: senha,
    })
    if (error) throw new Error(traduz(error.message))
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
    // O trigger handle_new_user busca nome e turma na lista de chamada
    // a partir do telefone dos metadados.
    const { data, error } = await this.sb.auth.signUp({
      email: synthEmail(telefone),
      password: senha,
      options: { data: { telefone } },
    })
    if (error) throw new Error(traduz(error.message))
    if (!data.session) {
      throw new Error(
        'O Supabase está exigindo confirmação de e-mail — desative em Authentication > Providers > Email > "Confirm email" (ver README)',
      )
    }
  }

  async demoSignUpOrganizador(): Promise<void> {
    throw new Error('Modo demo indisponível com Supabase configurado')
  }

  async signOut() {
    await this.sb.auth.signOut()
  }

  // ---- Perfil ----

  private static PROFILE_SELECT =
    '*, turmas:profile_turmas(turma, papel_danca), cargos:profile_cargos(cargo)'

  private mapProfile(data: Record<string, unknown>): Profile {
    return {
      id: data.id as string,
      nome: data.nome as string,
      avatar_url: (data.avatar_url as string) ?? null,
      telefone: (data.telefone as string) ?? null,
      criado_em: data.criado_em as string,
      turmas: (data.turmas as TurmaMembro[]) ?? [],
      cargos: ((data.cargos as Array<{ cargo: string }>) ?? []).map(
        (c) => c.cargo,
      ),
    }
  }

  /** Turmas do aluno em consulta separada (plano B do embed). */
  private async turmasDe(userId: string): Promise<TurmaMembro[]> {
    const { data } = await this.sb
      .from('profile_turmas')
      .select('turma, papel_danca')
      .eq('user_id', userId)
    return (data ?? []) as TurmaMembro[]
  }

  /** Cargos do aluno em consulta separada (plano B do embed). */
  private async cargosDe(userId: string): Promise<string[]> {
    const { data } = await this.sb
      .from('profile_cargos')
      .select('cargo')
      .eq('user_id', userId)
    return ((data ?? []) as Array<{ cargo: string }>).map((c) => c.cargo)
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.sb
      .from('profiles')
      .select(SupabaseApi.PROFILE_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (data) return this.mapProfile(data as unknown as Record<string, unknown>)

    if (error) {
      // Embed falhou: busca o perfil e as turmas separadamente
      console.warn('[perfil] embed falhou, usando consultas simples:', error)
      const { data: simples } = await this.sb
        .from('profiles')
        .select('id, nome, avatar_url, telefone, criado_em')
        .eq('id', id)
        .maybeSingle()
      if (simples) {
        const [turmas, cargos] = await Promise.all([
          this.turmasDe(id),
          this.cargosDe(id),
        ])
        return {
          ...(simples as Omit<Profile, 'turmas' | 'cargos'>),
          turmas,
          cargos,
        }
      }
    }

    // Fallback: se o trigger de criação de perfil ainda não rodou,
    // cria o perfil a partir dos metadados da sessão.
    const { data: s } = await this.sb.auth.getSession()
    const user = s.session?.user
    if (!user || user.id !== id) return null
    const nome =
      (user.user_metadata?.nome as string) || 'Dançarino(a)'
    const novo = {
      id,
      nome,
      avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      telefone: (user.user_metadata?.telefone as string) ?? null,
    }
    const { data: criado } = await this.sb
      .from('profiles')
      .upsert(novo)
      .select(SupabaseApi.PROFILE_SELECT)
      .maybeSingle()
    return criado
      ? this.mapProfile(criado as unknown as Record<string, unknown>)
      : null
  }

  async getMyRole(): Promise<Papel> {
    const uid = await this.getSessionUserId()
    if (!uid) return 'aluno'
    const { data } = await this.sb
      .from('roles')
      .select('papel')
      .eq('user_id', uid)
      .maybeSingle()
    return (data?.papel as Papel) ?? 'aluno'
  }

  private async requireUid(): Promise<string> {
    const uid = await this.getSessionUserId()
    if (!uid) throw new Error('Você precisa entrar primeiro')
    return uid
  }

  async updateProfile(patch: { nome?: string; avatarBlob?: Blob }) {
    const uid = await this.requireUid()
    const valores: Record<string, unknown> = {}
    if (patch.nome !== undefined) valores.nome = patch.nome
    if (patch.avatarBlob) {
      const path = `${uid}/avatar-${Date.now()}.${extensionFor(patch.avatarBlob)}`
      ok(
        await this.sb.storage.from('fotos').upload(path, patch.avatarBlob, {
          contentType: patch.avatarBlob.type,
        }),
      )
      valores.avatar_url = this.sb.storage
        .from('fotos')
        .getPublicUrl(path).data.publicUrl
    }
    if (Object.keys(valores).length === 0) return
    ok(await this.sb.from('profiles').update(valores).eq('id', uid))
  }

  // ---- Feed / check-ins ----

  async getFeed(): Promise<FeedItem[]> {
    const res = await this.sb
      .from('checkins')
      // `profiles!user_id`: há mais de um caminho entre checkins e profiles
      // (a FK direta e o M2M que o PostgREST deduz via `reactions`), então
      // é preciso apontar a chave estrangeira explicitamente.
      .select(
        `id, user_id, foto_url, legenda, criado_em,
           autor:profiles!user_id(nome, avatar_url, turmas:profile_turmas(turma, papel_danca), cargos:profile_cargos(cargo)),
           reacoes:reactions(tipo, user_id),
           comentarios:comments(count)`,
      )
      .order('criado_em', { ascending: false })
      .limit(60)

    // O embed aninhado (checkins → profiles → profile_turmas) depende das
    // FKs estarem no cache do PostgREST. Se falhar, monta o feed com
    // consultas simples em vez de deixar a tela vazia.
    if (res.error) {
      console.warn('[feed] embed falhou, usando consultas simples:', res.error)
      return this.getFeedSimples()
    }

    const data = res.data as unknown as Array<Record<string, unknown>>
    return data.map((c) => {
      const autor = c.autor as {
        nome: string
        avatar_url: string | null
        turmas: TurmaMembro[] | null
        cargos: Array<{ cargo: string }> | null
      } | null
      return {
        id: c.id as string,
        user_id: c.user_id as string,
        foto_url: c.foto_url as string,
        legenda: c.legenda as string | null,
        criado_em: c.criado_em as string,
        autor: {
          nome: autor?.nome ?? 'Alguém',
          avatar_url: autor?.avatar_url ?? null,
          turma: turmaLabel(autor?.turmas ?? []),
          cargos: (autor?.cargos ?? []).map((x) => x.cargo),
        },
        reacoes: (c.reacoes as FeedItem['reacoes']) ?? [],
        comentarios:
          (c.comentarios as Array<{ count: number }>)?.[0]?.count ?? 0,
      }
    })
  }

  /** Plano B do feed: sem embeds, só consultas diretas + junção no cliente. */
  private async getFeedSimples(): Promise<FeedItem[]> {
    const checkins = ok(
      await this.sb
        .from('checkins')
        .select('id, user_id, foto_url, legenda, criado_em')
        .order('criado_em', { ascending: false })
        .limit(60),
    ) as Array<{
      id: string
      user_id: string
      foto_url: string
      legenda: string | null
      criado_em: string
    }>
    if (checkins.length === 0) return []

    const userIds = [...new Set(checkins.map((c) => c.user_id))]
    const checkinIds = checkins.map((c) => c.id)

    const [perfis, turmasRows, cargosRows, reacoes, comentarios] = await Promise.all([
      this.sb
        .from('profiles')
        .select('id, nome, avatar_url')
        .in('id', userIds)
        .then((r) => (r.data ?? []) as Array<{ id: string; nome: string; avatar_url: string | null }>),
      this.sb
        .from('profile_turmas')
        .select('user_id, turma, papel_danca')
        .in('user_id', userIds)
        .then(
          (r) =>
            (r.data ?? []) as Array<
              { user_id: string } & TurmaMembro
            >,
        ),
      this.sb
        .from('profile_cargos')
        .select('user_id, cargo')
        .in('user_id', userIds)
        .then(
          (r) => (r.data ?? []) as Array<{ user_id: string; cargo: string }>,
        ),
      this.sb
        .from('reactions')
        .select('checkin_id, tipo, user_id')
        .in('checkin_id', checkinIds)
        .then((r) => (r.data ?? []) as Array<{ checkin_id: string; tipo: string; user_id: string }>),
      this.sb
        .from('comments')
        .select('checkin_id')
        .in('checkin_id', checkinIds)
        .then((r) => (r.data ?? []) as Array<{ checkin_id: string }>),
    ])

    const perfilPor = new Map(perfis.map((p) => [p.id, p]))
    const turmasPor = new Map<string, TurmaMembro[]>()
    for (const t of turmasRows) {
      const lista = turmasPor.get(t.user_id) ?? []
      lista.push({ turma: t.turma, papel_danca: t.papel_danca })
      turmasPor.set(t.user_id, lista)
    }
    const cargosPor = new Map<string, string[]>()
    for (const c of cargosRows) {
      cargosPor.set(c.user_id, [...(cargosPor.get(c.user_id) ?? []), c.cargo])
    }
    const nComentarios = new Map<string, number>()
    for (const c of comentarios) {
      nComentarios.set(c.checkin_id, (nComentarios.get(c.checkin_id) ?? 0) + 1)
    }

    return checkins.map((c) => {
      const p = perfilPor.get(c.user_id)
      return {
        ...c,
        autor: {
          nome: p?.nome ?? 'Alguém',
          avatar_url: p?.avatar_url ?? null,
          turma: turmaLabel(turmasPor.get(c.user_id) ?? []),
          cargos: cargosPor.get(c.user_id) ?? [],
        },
        reacoes: reacoes
          .filter((r) => r.checkin_id === c.id)
          .map((r) => ({ tipo: r.tipo, user_id: r.user_id })),
        comentarios: nComentarios.get(c.id) ?? 0,
      }
    })
  }

  subscribeFeed(cb: () => void) {
    const channel = this.sb
      .channel('feed-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkins' },
        cb,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        cb,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        cb,
      )
      .subscribe()
    return () => {
      void this.sb.removeChannel(channel)
    }
  }

  async createCheckin(foto: Blob, legenda: string) {
    const uid = await this.requireUid()
    const path = `${uid}/${crypto.randomUUID()}.${extensionFor(foto)}`
    ok(
      await this.sb.storage.from('fotos').upload(path, foto, {
        contentType: foto.type,
      }),
    )
    const foto_url = this.sb.storage.from('fotos').getPublicUrl(path).data
      .publicUrl
    ok(
      await this.sb
        .from('checkins')
        .insert({ user_id: uid, foto_url, legenda: legenda.trim() || null }),
    )
  }

  async deleteCheckin(id: string) {
    ok(await this.sb.from('checkins').delete().eq('id', id))
  }

  async toggleReaction(checkinId: string, tipo: string) {
    const uid = await this.requireUid()
    const { data: atual } = await this.sb
      .from('reactions')
      .select('tipo')
      .eq('checkin_id', checkinId)
      .eq('user_id', uid)
      .maybeSingle()
    if (atual?.tipo === tipo) {
      ok(
        await this.sb
          .from('reactions')
          .delete()
          .eq('checkin_id', checkinId)
          .eq('user_id', uid),
      )
    } else {
      ok(
        await this.sb
          .from('reactions')
          .upsert(
            { checkin_id: checkinId, user_id: uid, tipo },
            { onConflict: 'checkin_id,user_id' },
          ),
      )
    }
  }

  async getComments(checkinId: string): Promise<Comment[]> {
    const data = ok(
      await this.sb
        .from('comments')
        .select(
          'id, checkin_id, user_id, texto, criado_em, autor:profiles!user_id(nome, avatar_url)',
        )
        .eq('checkin_id', checkinId)
        .order('criado_em', { ascending: true }),
    ) as unknown as Comment[]
    return data
  }

  async addComment(checkinId: string, texto: string) {
    const uid = await this.requireUid()
    ok(
      await this.sb
        .from('comments')
        .insert({ checkin_id: checkinId, user_id: uid, texto: texto.trim() }),
    )
  }

  async deleteComment(id: string) {
    ok(await this.sb.from('comments').delete().eq('id', id))
  }

  async reportCheckin(checkinId: string, motivo: string) {
    const uid = await this.requireUid()
    ok(
      await this.sb.from('reports').insert({
        checkin_id: checkinId,
        user_id: uid,
        motivo: motivo.trim() || null,
      }),
    )
  }

  async checkinsDe(userId: string) {
    const data = ok(
      await this.sb
        .from('checkins')
        .select('criado_em')
        .eq('user_id', userId),
    )
    return data as { criado_em: string }[]
  }

  async contarDesafios(userId: string) {
    const { count, error } = await this.sb
      .from('challenge_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) throw new Error(traduz(error.message))
    return count ?? 0
  }

  // ---- Desafios ----

  private mapChallenge(
    c: Record<string, unknown>,
    meusIds: Set<string>,
  ): Challenge {
    const janelas = (c.janelas as Array<Record<string, unknown>>) ?? []
    return {
      id: c.id as string,
      titulo: c.titulo as string,
      descricao: c.descricao as string | null,
      data_inicio: c.data_inicio as string,
      data_fim: c.data_fim as string,
      janelas: janelas
        .map((j) => ({
          dia_semana: j.dia_semana as number,
          hora_inicio: horaCurta(j.hora_inicio),
          hora_fim: horaCurta(j.hora_fim),
        }))
        .sort((a, b) => a.dia_semana - b.dia_semana),
      criado_por: c.criado_por as string | null,
      participantes:
        (c.participantes as Array<{ count: number }>)?.[0]?.count ?? 0,
      sou_membro: meusIds.has(c.id as string),
    }
  }

  async listChallenges(): Promise<Challenge[]> {
    const uid = await this.getSessionUserId()
    const data = ok(
      await this.sb
        .from('challenges')
        .select(
          '*, participantes:challenge_members(count), janelas:challenge_janelas(dia_semana, hora_inicio, hora_fim)',
        )
        .order('data_inicio', { ascending: false }),
    ) as unknown as Array<Record<string, unknown>>
    const meus = uid
      ? ((ok(
          await this.sb
            .from('challenge_members')
            .select('challenge_id')
            .eq('user_id', uid),
        ) as Array<{ challenge_id: string }>) ?? [])
      : []
    const meusIds = new Set(meus.map((m) => m.challenge_id))
    return data.map((c) => this.mapChallenge(c, meusIds))
  }

  async getChallenge(id: string) {
    const all = await this.listChallenges()
    return all.find((c) => c.id === id) ?? null
  }

  async saveChallenge(data: ChallengeInput) {
    const valores = {
      titulo: data.titulo,
      descricao: data.descricao || null,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
    }
    let challengeId = data.id
    if (challengeId) {
      ok(
        await this.sb.from('challenges').update(valores).eq('id', challengeId),
      )
      // Substitui as janelas por completo — mais simples e seguro que
      // tentar casar quais dias mudaram, sumiram ou são novos.
      ok(
        await this.sb
          .from('challenge_janelas')
          .delete()
          .eq('challenge_id', challengeId),
      )
    } else {
      const uid = await this.requireUid()
      const criado = ok(
        await this.sb
          .from('challenges')
          .insert({ ...valores, criado_por: uid })
          .select('id')
          .single(),
      ) as { id: string }
      challengeId = criado.id
    }
    if (data.janelas.length > 0) {
      ok(
        await this.sb.from('challenge_janelas').insert(
          data.janelas.map((j) => ({
            challenge_id: challengeId,
            dia_semana: j.dia_semana,
            hora_inicio: j.hora_inicio,
            hora_fim: j.hora_fim,
          })),
        ),
      )
    }
  }

  async deleteChallenge(id: string) {
    ok(await this.sb.from('challenges').delete().eq('id', id))
  }

  async joinChallenge(id: string) {
    const uid = await this.requireUid()
    ok(
      await this.sb
        .from('challenge_members')
        .upsert(
          { challenge_id: id, user_id: uid },
          { onConflict: 'challenge_id,user_id' },
        ),
    )
  }

  async leaveChallenge(id: string) {
    const uid = await this.requireUid()
    ok(
      await this.sb
        .from('challenge_members')
        .delete()
        .eq('challenge_id', id)
        .eq('user_id', uid),
    )
  }

  async getRanking(challenge: Challenge): Promise<RankingEntry[]> {
    const membros = ok(
      await this.sb
        .from('challenge_members')
        .select(
          'user_id, perfil:profiles(nome, avatar_url, turmas:profile_turmas(turma, papel_danca))',
        )
        .eq('challenge_id', challenge.id),
    ) as unknown as Array<{
      user_id: string
      perfil: {
        nome: string
        avatar_url: string | null
        turmas: TurmaMembro[] | null
      }
    }>
    if (membros.length === 0) return []

    const inicio = new Date(`${challenge.data_inicio}T00:00:00`).toISOString()
    const fim = new Date(`${challenge.data_fim}T23:59:59`).toISOString()
    const checkins = ok(
      await this.sb
        .from('checkins')
        .select('user_id, criado_em')
        .gte('criado_em', inicio)
        .lte('criado_em', fim)
        .in(
          'user_id',
          membros.map((m) => m.user_id),
        ),
    ) as Array<{ user_id: string; criado_em: string }>

    // A janela (dias + horário) é avaliada no fuso local do usuário e
    // cada dia vale no máximo 1 ponto, mesmo com várias fotos
    const datasPor = new Map<string, Date[]>()
    for (const c of checkins) {
      const lista = datasPor.get(c.user_id) ?? []
      lista.push(new Date(c.criado_em))
      datasPor.set(c.user_id, lista)
    }
    const pontos = new Map<string, number>()
    for (const [uid, datas] of datasPor) {
      pontos.set(uid, pontosNoDesafio(datas, challenge))
    }

    return membros
      .map((m) => ({
        user_id: m.user_id,
        nome: m.perfil?.nome ?? 'Alguém',
        avatar_url: m.perfil?.avatar_url ?? null,
        turma: turmaLabel(m.perfil?.turmas ?? []),
        pontos: pontos.get(m.user_id) ?? 0,
      }))
      .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome))
  }

  // ---- Agenda ----

  async listEvents(): Promise<AgendaEvent[]> {
    const data = ok(
      await this.sb.from('events').select('*').order('criado_em'),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((e) => ({
      id: e.id as string,
      titulo: e.titulo as string,
      descricao: e.descricao as string | null,
      turma: e.turma as string | null,
      dia_semana: e.dia_semana as number | null,
      data: e.data as string | null,
      hora: e.hora ? horaCurta(e.hora) : null,
    }))
  }

  async saveEvent(e: AgendaEventInput) {
    ok(
      await this.sb.from('events').insert({
        titulo: e.titulo,
        descricao: e.descricao || null,
        turma: e.turma,
        dia_semana: e.dia_semana,
        data: e.data,
        hora: e.hora,
      }),
    )
  }

  async deleteEvent(id: string) {
    ok(await this.sb.from('events').delete().eq('id', id))
  }

  async listFeriados(): Promise<Feriado[]> {
    const data = ok(
      await this.sb.from('feriados').select('*').order('data'),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((f) => ({
      id: f.id as string,
      data: f.data as string,
      motivo: (f.motivo as string) ?? null,
      turma: (f.turma as string) ?? null,
    }))
  }

  async saveFeriado(f: FeriadoInput) {
    ok(
      await this.sb.from('feriados').insert({
        data: f.data,
        motivo: f.motivo.trim() || null,
        turma: f.turma,
      }),
    )
  }

  async deleteFeriado(id: string) {
    ok(await this.sb.from('feriados').delete().eq('id', id))
  }

  // ---- Organizador ----

  async getAttendance(
    inicioISO: string,
    fimISO: string,
  ): Promise<AttendanceRow[]> {
    const inicio = new Date(`${inicioISO}T00:00:00`).toISOString()
    const fim = new Date(`${fimISO}T23:59:59`).toISOString()
    const data = ok(
      await this.sb
        .from('checkins')
        .select(
          'criado_em, autor:profiles!user_id(nome, turmas:profile_turmas(turma, papel_danca))',
        )
        .gte('criado_em', inicio)
        .lte('criado_em', fim)
        .order('criado_em', { ascending: false }),
    ) as unknown as Array<{
      criado_em: string
      autor: { nome: string; turmas: TurmaMembro[] | null } | null
    }>
    return data.map((c) => ({
      data: c.criado_em,
      nome: c.autor?.nome ?? 'Alguém',
      turma: turmaLabel(c.autor?.turmas ?? []) ?? '',
    }))
  }

  async listReports(): Promise<Report[]> {
    const data = ok(
      await this.sb
        .from('reports')
        .select(
          `id, checkin_id, motivo, criado_em,
           denunciante:profiles!user_id(nome),
           checkin:checkins(foto_url, autor:profiles!user_id(nome))`,
        )
        .eq('resolvido', false)
        .order('criado_em', { ascending: false }),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((r) => {
      const checkin = r.checkin as {
        foto_url: string
        autor: { nome: string } | null
      } | null
      return {
        id: r.id as string,
        checkin_id: r.checkin_id as string,
        motivo: r.motivo as string | null,
        criado_em: r.criado_em as string,
        foto_url: checkin?.foto_url ?? null,
        autor_nome: checkin?.autor?.nome ?? null,
        denunciante_nome:
          (r.denunciante as { nome: string } | null)?.nome ?? null,
      }
    })
  }

  async resolveReport(id: string, removerPost: boolean) {
    if (removerPost) {
      const { data } = await this.sb
        .from('reports')
        .select('checkin_id')
        .eq('id', id)
        .maybeSingle()
      if (data) await this.deleteCheckin(data.checkin_id)
    } else {
      ok(await this.sb.from('reports').update({ resolvido: true }).eq('id', id))
    }
  }

  async listAlunosCadastrados(): Promise<AlunoCadastrado[]> {
    const data = ok(
      await this.sb.from('alunos_cadastrados').select('*').order('nome'),
    )
    return data as AlunoCadastrado[]
  }

  async saveAlunoCadastrado(a: {
    nome: string
    telefone: string
    turma: string
    papel_danca: PapelDanca | null
  }) {
    ok(
      await this.sb.from('alunos_cadastrados').insert({
        nome: a.nome.trim() || null,
        telefone: a.telefone.trim(),
        turma: a.turma,
        papel_danca: a.papel_danca,
      }),
    )
  }

  async deleteAlunoCadastrado(id: string) {
    ok(await this.sb.from('alunos_cadastrados').delete().eq('id', id))
  }

  async importAlunos(
    rows: {
      nome: string
      telefone: string
      turma: string
      papel_danca: PapelDanca | null
    }[],
  ) {
    const existentes = await this.listAlunosCadastrados()
    // Duplicado = mesmo telefone NA MESMA turma (multi-turma é permitido)
    const novos = rows.filter(
      (r) =>
        !existentes.some(
          (e) =>
            telefonesIguais(e.telefone, r.telefone) &&
            e.turma.toLowerCase() === r.turma.toLowerCase(),
        ),
    )
    if (novos.length > 0) {
      ok(
        await this.sb.from('alunos_cadastrados').insert(
          novos.map((r) => ({
            nome: r.nome.trim() || null,
            telefone: r.telefone.trim(),
            turma: r.turma.trim(),
            papel_danca: r.papel_danca,
          })),
        ),
      )
    }
    return { importados: novos.length, ignorados: rows.length - novos.length }
  }

  async listProfiles(): Promise<Profile[]> {
    const data = ok(
      await this.sb
        .from('profiles')
        .select(SupabaseApi.PROFILE_SELECT)
        .order('nome'),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((p) => this.mapProfile(p))
  }

  async addTurmaAluno(userId: string, turma: string, papel: PapelDanca | null) {
    ok(
      await this.sb
        .from('profile_turmas')
        .upsert(
          { user_id: userId, turma, papel_danca: papel },
          { onConflict: 'user_id,turma' },
        ),
    )
  }

  async removeTurmaAluno(userId: string, turma: string) {
    ok(
      await this.sb
        .from('profile_turmas')
        .delete()
        .eq('user_id', userId)
        .eq('turma', turma),
    )
  }

  // ---- Turmas do semestre ----

  async listTurmas(): Promise<Turma[]> {
    const data = ok(await this.sb.from('turmas').select('id, nome').order('nome'))
    return data as Turma[]
  }

  async saveTurma(nome: string) {
    const limpo = nome.trim()
    if (!limpo) throw new Error('Nome da turma vazio')
    ok(await this.sb.from('turmas').insert({ nome: limpo }))
  }

  async deleteTurma(id: string) {
    ok(await this.sb.from('turmas').delete().eq('id', id))
  }

  // ---- Cargos do projeto ----

  async listCargos(): Promise<Cargo[]> {
    const data = ok(
      await this.sb.from('cargos').select('id, nome').order('ordem'),
    )
    return data as Cargo[]
  }

  async saveCargo(nome: string) {
    const limpo = nome.trim()
    if (!limpo) throw new Error('Nome do cargo vazio')
    ok(await this.sb.from('cargos').insert({ nome: limpo }))
  }

  async deleteCargo(id: string) {
    ok(await this.sb.from('cargos').delete().eq('id', id))
  }

  async addCargoAluno(userId: string, cargo: string) {
    ok(
      await this.sb
        .from('profile_cargos')
        .upsert({ user_id: userId, cargo }, { onConflict: 'user_id,cargo' }),
    )
  }

  async removeCargoAluno(userId: string, cargo: string) {
    ok(
      await this.sb
        .from('profile_cargos')
        .delete()
        .eq('user_id', userId)
        .eq('cargo', cargo),
    )
  }

  // ---- Push ----

  async savePushSubscription(sub: PushSubscriptionJSON) {
    const uid = await this.requireUid()
    if (!sub.endpoint) return
    ok(
      await this.sb.from('push_subscriptions').upsert(
        {
          endpoint: sub.endpoint,
          user_id: uid,
          subscription: sub,
        },
        { onConflict: 'endpoint' },
      ),
    )
  }
}
