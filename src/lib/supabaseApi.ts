import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ForroApi } from './api'
import { diasSuspensos, pontosNoDesafio } from './dates'
import type { PessoaMatricula } from './matricula'
import { extensionFor } from './image'
import type { Coordenada } from './geo'
import { ehEmail, normalizeTelefone, synthEmail, telefonesIguais } from './phone'
import { PAGINA_FEED, turmaLabel } from './types'
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
  // O domínio do endereço sintético nunca existiu de verdade, e o
  // Supabase passou a validar isso. Quem tem conta antiga esbarra nele
  // ao trocar o e-mail, porque a troca confirma no endereço atual.
  if (/alunos\.forrodesegunda\.app.*invalid/i.test(msg)) {
    return (
      'Sua conta usa o endereço interno antigo, que o Supabase não aceita ' +
      'mais. A organização resolve em Authentication > Users, trocando seu ' +
      'e-mail por lá — depois é só entrar com ele.'
    )
  }
  // Tabela/coluna nova que ainda não foi criada no banco em produção
  if (msg.includes('schema cache') || /column .* does not exist/.test(msg)) {
    return (
      'Falta rodar a migração do banco. No Supabase: SQL Editor → cole o ' +
      'arquivo mais recente de supabase/migracoes → Run, e depois ' +
      'Project Settings → API → Reload schema cache.'
    )
  }
  return msg
}

/**
 * Fatia uma lista em lotes. Filtros `.in(...)` do PostgREST viajam na
 * URL: com 300 alunos de uma vez o endereço passaria de 10 KB e
 * apanharia de proxy pelo caminho.
 */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho))
  }
  return lotes
}

/**
 * Caminho do arquivo dentro do bucket a partir da URL pública
 * (…/object/public/fotos/<uid>/<arquivo>). Devolve null para URL vazia,
 * de outro domínio ou de foto já arquivada pela retenção.
 */
export function caminhoNoBucket(url: string | null | undefined): string | null {
  if (!url) return null
  const marca = '/object/public/fotos/'
  const i = url.indexOf(marca)
  if (i === -1) return null
  const caminho = url.slice(i + marca.length).split('?')[0]
  return caminho ? decodeURIComponent(caminho) : null
}

function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(traduz(res.error.message))
  return res.data
}

function horaCurta(v: unknown): string {
  return String(v ?? '00:00').slice(0, 5)
}

/** Distintivo sem a contagem de recebedores (embed simples). */
type DistintivoBasico = Omit<DistintivoDef, 'concedidos'>

/** Formas cruas das consultas que alimentam o painel de notificações. */
type PerfilNotif = { nome: string; avatar_url: string | null } | null
interface ReacaoNotif {
  checkin_id: string
  user_id: string
  tipo: string
  criado_em: string
  perfil: PerfilNotif
}
interface ComentarioNotif {
  id: string
  checkin_id: string
  user_id: string
  texto: string
  criado_em: string
  perfil: PerfilNotif
}
interface DuplaNotif {
  id: string
  data: string
  de_user: string
  confirmada: boolean
  criado_em: string
  perfil: PerfilNotif
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

  async signInTelefone(identificador: string, senha: string) {
    // Telefone só serve às contas anteriores ao e-mail, que seguem no
    // endereço sintético — e esse é CALCULADO aqui, sem consultar nada.
    // Traduzir telefone em e-mail exigiria uma consulta pública, que
    // viraria um jeito de descobrir o e-mail de qualquer aluno.
    const porTelefone = !ehEmail(identificador)
    const email = porTelefone
      ? synthEmail(identificador)
      : identificador.trim()
    const { error } = await this.sb.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (!error) return
    // Quem já cadastrou e-mail perdeu o endereço sintético: o telefone
    // deixa de achar a conta e o erro genérico não ajudaria em nada.
    if (porTelefone && /invalid login credentials/i.test(error.message)) {
      throw new Error(
        'Não encontramos essa conta pelo telefone. Se você já cadastrou um e-mail, entre com ele.',
      )
    }
    throw new Error(traduz(error.message))
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
    // Nada de cair no endereço sintético quando o e-mail vem vazio:
    // aquele domínio não existe de verdade, e o Supabase passou a
    // recusá-lo. A conta nasceria quebrada — melhor não deixar criar.
    if (!email.trim()) {
      throw new Error('Informe um e-mail para poder recuperar a senha depois')
    }
    // O e-mail informado vira o e-mail da conta: é com ele que a pessoa
    // entra e é para ele que vai o link de "esqueci minha senha".
    const { data, error } = await this.sb.auth.signUp({
      email: email.trim(),
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

  async solicitarResetSenha(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    // Erro de e-mail inexistente é engolido de propósito: a tela não
    // pode virar um verificador de quem é do projeto. Falha de rede ou
    // de limite de envio, essa sim, precisa aparecer.
    if (error && !/user not found/i.test(error.message)) {
      throw new Error(traduz(error.message))
    }
  }

  async definirNovaSenha(senha: string) {
    const { error } = await this.sb.auth.updateUser({ password: senha })
    if (error) throw new Error(traduz(error.message))
  }

  async trocarSenha(senha: string) {
    await this.definirNovaSenha(senha)
  }

  async trocarEmail(email: string) {
    const { error } = await this.sb.auth.updateUser({ email: email.trim() })
    if (error) throw new Error(traduz(error.message))
    // O gatilho da migração 013 copia para profiles.email; se ele ainda
    // não existir, ao menos a tela do painel não fica mentindo.
    const uid = await this.getSessionUserId()
    if (uid) {
      await this.sb
        .from('profiles')
        .update({ email: email.trim() })
        .eq('id', uid)
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
      email: (data.email as string) ?? null,
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

  /**
   * Apaga arquivos do bucket sem derrubar a operação principal: o registro
   * no banco já foi gravado, e uma sobra no storage é problema de limpeza
   * (a retencao.sql varre órfãos), não motivo para mostrar erro ao aluno.
   */
  private async apagarDoBucket(urls: (string | null | undefined)[]) {
    const caminhos = urls
      .map((u) => caminhoNoBucket(u))
      .filter((c): c is string => c !== null)
    if (caminhos.length === 0) return
    try {
      await this.sb.storage.from('fotos').remove(caminhos)
    } catch (e) {
      console.warn('[storage] não deu para apagar', caminhos, e)
    }
  }

  async updateProfile(patch: { nome?: string; avatarBlob?: Blob }) {
    const uid = await this.requireUid()
    const valores: Record<string, unknown> = {}
    if (patch.nome !== undefined) valores.nome = patch.nome

    let avatarAntigo: string | null = null
    if (patch.avatarBlob) {
      const { data: atual } = await this.sb
        .from('profiles')
        .select('avatar_url')
        .eq('id', uid)
        .maybeSingle()
      avatarAntigo = (atual?.avatar_url as string | null) ?? null

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

    // Só depois de o perfil já apontar para a foto nova — se apagasse
    // antes e o update falhasse, o aluno ficaria sem avatar nenhum.
    if (avatarAntigo) await this.apagarDoBucket([avatarAntigo])
  }

  // ---- Feed / check-ins ----

  async getFeed(opcoes?: {
    limite?: number
    antesDe?: string
  }): Promise<FeedItem[]> {
    const limite = opcoes?.limite ?? PAGINA_FEED
    let consulta = this.sb
      .from('checkins')
      // `profiles!user_id`: há mais de um caminho entre checkins e profiles
      // (a FK direta e o M2M que o PostgREST deduz via `reactions`), então
      // é preciso apontar a chave estrangeira explicitamente.
      .select(
        `id, user_id, foto_url, legenda, criado_em, favorito,
           autor:profiles!user_id(nome, avatar_url, turmas:profile_turmas(turma, papel_danca), cargos:profile_cargos(cargo)),
           reacoes:reactions(tipo, user_id),
           comentarios:comments(count)`,
      )
      .order('criado_em', { ascending: false })
      .limit(limite)
    if (opcoes?.antesDe) consulta = consulta.lt('criado_em', opcoes.antesDe)
    const res = await consulta

    // O embed aninhado (checkins → profiles → profile_turmas) depende das
    // FKs estarem no cache do PostgREST. Se falhar, monta o feed com
    // consultas simples em vez de deixar a tela vazia.
    if (res.error) {
      console.warn('[feed] embed falhou, usando consultas simples:', res.error)
      return this.getFeedSimples(opcoes)
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
        favorito: Boolean(c.favorito),
        autor: {
          nome: autor?.nome ?? 'Alguém',
          avatar_url: autor?.avatar_url ?? null,
          turma: turmaLabel(autor?.turmas ?? []),
          turmas: (autor?.turmas ?? []).map((t) => t.turma),
          cargos: (autor?.cargos ?? []).map((x) => x.cargo),
        },
        reacoes: (c.reacoes as FeedItem['reacoes']) ?? [],
        comentarios:
          (c.comentarios as Array<{ count: number }>)?.[0]?.count ?? 0,
      }
    })
  }

  /** Plano B do feed: sem embeds, só consultas diretas + junção no cliente. */
  private async getFeedSimples(opcoes?: {
    limite?: number
    antesDe?: string
  }): Promise<FeedItem[]> {
    let base = this.sb
      .from('checkins')
      .select('id, user_id, foto_url, legenda, criado_em')
      .order('criado_em', { ascending: false })
      .limit(opcoes?.limite ?? PAGINA_FEED)
    if (opcoes?.antesDe) base = base.lt('criado_em', opcoes.antesDe)
    const checkins = ok(await base) as Array<{
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
        // Este plano B também cobre o caso da migração 005 não ter
        // rodado ainda (sem a coluna `favorito` o embed acima falha).
        favorito: false,
        autor: {
          nome: p?.nome ?? 'Alguém',
          avatar_url: p?.avatar_url ?? null,
          turma: turmaLabel(turmasPor.get(c.user_id) ?? []),
          turmas: (turmasPor.get(c.user_id) ?? []).map((t) => t.turma),
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

  async createCheckin(
    foto: Blob,
    legenda: string,
    coords?: Coordenada | null,
  ) {
    const uid = await this.requireUid()
    const path = `${uid}/${crypto.randomUUID()}.${extensionFor(foto)}`
    ok(
      await this.sb.storage.from('fotos').upload(path, foto, {
        contentType: foto.type,
      }),
    )
    const foto_url = this.sb.storage.from('fotos').getPublicUrl(path).data
      .publicUrl
    // Via função: ela cria o check-in e decide, no servidor, em quais
    // desafios a coordenada caiu dentro do raio. A coordenada não é
    // guardada — some junto com a chamada.
    const { error } = await this.sb.rpc('registrar_checkin', {
      p_foto_url: foto_url,
      p_legenda: legenda.trim() || null,
      p_lat: coords?.lat ?? null,
      p_lng: coords?.lng ?? null,
    })
    if (error) throw new Error(traduz(error.message))
  }

  async deleteCheckin(id: string) {
    // Guarda a URL antes: depois do delete não há como descobrir o arquivo,
    // e ele ficaria ocupando o bucket para sempre.
    const { data } = await this.sb
      .from('checkins')
      .select('foto_url')
      .eq('id', id)
      .maybeSingle()
    ok(await this.sb.from('checkins').delete().eq('id', id))
    await this.apagarDoBucket([data?.foto_url as string | undefined])
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

  async checkinsComReacoes(
    userId: string,
    desdeISO: string,
  ): Promise<CheckinComReacoes[]> {
    const data = ok(
      await this.sb
        .from('checkins')
        .select('id, foto_url, legenda, criado_em, reacoes:reactions(count)')
        .eq('user_id', userId)
        .gte('criado_em', desdeISO)
        .order('criado_em', { ascending: false }),
    ) as unknown as Array<{
      id: string
      foto_url: string
      legenda: string | null
      criado_em: string
      reacoes: { count: number }[]
    }>
    return data.map((c) => ({
      id: c.id,
      foto_url: c.foto_url,
      legenda: c.legenda,
      criado_em: c.criado_em,
      reacoes: c.reacoes?.[0]?.count ?? 0,
    }))
  }

  async setFavorito(checkinId: string, favorito: boolean) {
    // A regra de dono e o teto ficam na função (security definer): a RLS
    // de checkins não permite update, e nem deve — a foto é imutável.
    const { error } = await this.sb.rpc('favoritar_checkin', {
      p_checkin: checkinId,
      p_valor: favorito,
    })
    if (error) throw new Error(traduz(error.message))
  }

  async favoritosDe(userId: string): Promise<CheckinFavorito[]> {
    const data = ok(
      await this.sb
        .from('checkins')
        .select(
          'id, foto_url, legenda, criado_em, reacoes:reactions(tipo, user_id), comentarios:comments(count)',
        )
        .eq('user_id', userId)
        .eq('favorito', true)
        .order('criado_em', { ascending: false }),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((c) => ({
      id: c.id as string,
      foto_url: c.foto_url as string,
      legenda: c.legenda as string | null,
      criado_em: c.criado_em as string,
      reacoes: (c.reacoes as CheckinFavorito['reacoes']) ?? [],
      comentarios:
        (c.comentarios as Array<{ count: number }>)?.[0]?.count ?? 0,
    }))
  }

  async addMembroDesafio(challengeId: string, userId: string) {
    ok(
      await this.sb
        .from('challenge_members')
        .upsert(
          { challenge_id: challengeId, user_id: userId },
          { onConflict: 'challenge_id,user_id' },
        ),
    )
  }

  async removeMembroDesafio(challengeId: string, userId: string) {
    ok(
      await this.sb
        .from('challenge_members')
        .delete()
        .eq('challenge_id', challengeId)
        .eq('user_id', userId),
    )
  }

  async listConvidados(challengeId: string): Promise<ConvidadoDesafio[]> {
    const data = ok(
      await this.sb
        .from('challenge_convidados')
        .select('telefone, telefone_exibicao, nome')
        .eq('challenge_id', challengeId)
        .order('nome'),
    ) as ConvidadoDesafio[]
    return data
  }

  async removeConvidado(challengeId: string, telefone: string) {
    ok(
      await this.sb
        .from('challenge_convidados')
        .delete()
        .eq('challenge_id', challengeId)
        .eq('telefone', normalizeTelefone(telefone)),
    )
  }

  async importarConvidados(
    challengeId: string,
    linhas: { nome: string; telefone: string }[],
  ) {
    // Casa a lista de ingressos com quem já tem conta. O telefone é o
    // elo: é o login do app e o que a bilheteria costuma anotar.
    const perfis = ok(
      await this.sb.from('profiles').select('id, telefone'),
    ) as Array<{ id: string; telefone: string | null }>

    const jaMembros = ok(
      await this.sb
        .from('challenge_members')
        .select('user_id')
        .eq('challenge_id', challengeId),
    ) as Array<{ user_id: string }>
    const membros = new Set(jaMembros.map((m) => m.user_id))

    const novosMembros: string[] = []
    const pendentes: Array<{
      challenge_id: string
      telefone: string
      telefone_exibicao: string
      nome: string | null
    }> = []
    let jaEstavam = 0

    for (const linha of linhas) {
      const perfil = perfis.find(
        (p) => p.telefone && telefonesIguais(p.telefone, linha.telefone),
      )
      if (!perfil) {
        pendentes.push({
          challenge_id: challengeId,
          telefone: normalizeTelefone(linha.telefone),
          telefone_exibicao: linha.telefone,
          nome: linha.nome || null,
        })
      } else if (membros.has(perfil.id)) {
        jaEstavam++
      } else {
        novosMembros.push(perfil.id)
        membros.add(perfil.id)
      }
    }

    if (novosMembros.length > 0) {
      ok(
        await this.sb.from('challenge_members').upsert(
          novosMembros.map((user_id) => ({
            challenge_id: challengeId,
            user_id,
          })),
          { onConflict: 'challenge_id,user_id' },
        ),
      )
    }
    if (pendentes.length > 0) {
      ok(
        await this.sb
          .from('challenge_convidados')
          .upsert(pendentes, { onConflict: 'challenge_id,telefone' }),
      )
    }

    return {
      adicionados: novosMembros.length,
      pendentes: pendentes.length,
      jaEstavam,
    }
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
      entrada_restrita: Boolean(c.entrada_restrita),
      // Ausente enquanto a migração 008 não roda — sem trava de local
      local:
        c.local_lat != null && c.local_lng != null
          ? {
              nome: (c.local_nome as string | null) ?? null,
              lat: Number(c.local_lat),
              lng: Number(c.local_lng),
              raio_m: Number(c.local_raio_m),
              desde: (c.local_desde as string | null) ?? null,
            }
          : null,
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
      local_nome: data.local?.nome || null,
      local_lat: data.local?.lat ?? null,
      local_lng: data.local?.lng ?? null,
      local_raio_m: data.local?.raio_m ?? null,
      entrada_restrita: data.entrada_restrita,
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
        .select('id, user_id, criado_em')
        .gte('criado_em', inicio)
        .lte('criado_em', fim)
        .in(
          'user_id',
          membros.map((m) => m.user_id),
        ),
    ) as Array<{ id: string; user_id: string; criado_em: string }>

    // Desafio com trava de local: valem só os check-ins com veredito
    // registrado. Vem a lista de ids aprovados — nenhuma coordenada
    // trafega, que é o ponto do desenho (ver migração 008).
    // Tudo que é anterior a `desde` continua valendo: ligar a trava no
    // meio do desafio não pode zerar quem já compareceu (migração 009).
    const travaDesde = challenge.local?.desde
      ? new Date(challenge.local.desde).getTime()
      : null
    let aprovados: Set<string> | null = null
    if (challenge.local) {
      const rows = ok(
        await this.sb
          .from('checkin_locais')
          .select('checkin_id')
          .eq('challenge_id', challenge.id),
      ) as Array<{ checkin_id: string }>
      aprovados = new Set(rows.map((r) => r.checkin_id))
    }

    // A janela (dias + horário) é avaliada no fuso local do usuário e
    // cada dia vale no máximo 1 ponto, mesmo com várias fotos
    const datasPor = new Map<string, Date[]>()
    for (const c of checkins) {
      const anteriorATrava =
        travaDesde !== null && new Date(c.criado_em).getTime() < travaDesde
      if (aprovados && !anteriorATrava && !aprovados.has(c.id)) continue
      const lista = datasPor.get(c.user_id) ?? []
      lista.push(new Date(c.criado_em))
      datasPor.set(c.user_id, lista)
    }
    // Dias em que a aula foi cancelada não têm janela: não houve forró,
    // então ninguém pontua (migração 012). A tabela é pequena e o
    // ranking é uma tela só — não vale um cache aqui.
    const suspensos = diasSuspensos(
      await this.listFeriados().catch(() => [] as Feriado[]),
    )

    const pontos = new Map<string, number>()
    for (const [uid, datas] of datasPor) {
      pontos.set(uid, pontosNoDesafio(datas, challenge, suspensos))
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
      // Sem a migração 012 a coluna não existe: o cancelamento volta a
      // valer só como aviso na agenda, que era o comportamento antigo.
      suspende_desafios: f.suspende_desafios === true,
    }))
  }

  async saveFeriado(f: FeriadoInput) {
    ok(
      await this.sb.from('feriados').insert({
        data: f.data,
        motivo: f.motivo.trim() || null,
        turma: f.turma,
        suspende_desafios: f.suspende_desafios,
      }),
    )
  }

  async deleteFeriado(id: string) {
    ok(await this.sb.from('feriados').delete().eq('id', id))
  }

  async confirmacoesDe(datas: string[]): Promise<ConfirmacaoPresenca[]> {
    if (datas.length === 0) return []
    const data = ok(
      await this.sb
        .from('confirmacoes_presenca')
        .select('evento_id, data, user_id, perfil:profiles(nome, avatar_url)')
        .in('data', datas),
    ) as unknown as Array<{
      evento_id: string
      data: string
      user_id: string
      perfil: { nome: string; avatar_url: string | null } | null
    }>
    return data.map((c) => ({
      evento_id: c.evento_id,
      data: c.data,
      user_id: c.user_id,
      nome: c.perfil?.nome ?? 'Alguém',
      avatar_url: c.perfil?.avatar_url ?? null,
    }))
  }

  // ---- Notificações ----

  /**
   * Monta a lista a partir do que já existe no banco: reações e
   * comentários nas MINHAS fotos, e marcações de dupla apontando para
   * mim. Sem tabela própria, sem gatilhos, sem limpeza.
   */
  async listNotificacoes(): Promise<Notificacao[]> {
    const uid = await this.requireUid()
    const meus = ok(
      await this.sb
        .from('checkins')
        .select('id')
        .eq('user_id', uid)
        .order('criado_em', { ascending: false })
        .limit(100),
    ) as Array<{ id: string }>
    const ids = meus.map((c) => c.id)

    const [reacoes, comentarios, duplas] = await Promise.all([
      ids.length
        ? this.sb
            .from('reactions')
            .select(
              'checkin_id, user_id, tipo, criado_em, perfil:profiles!user_id(nome, avatar_url)',
            )
            .in('checkin_id', ids)
            .neq('user_id', uid)
            .order('criado_em', { ascending: false })
            .limit(50)
            .then((r) => (r.data ?? []) as unknown as ReacaoNotif[])
        : Promise.resolve([] as ReacaoNotif[]),
      ids.length
        ? this.sb
            .from('comments')
            .select(
              'id, checkin_id, user_id, texto, criado_em, perfil:profiles!user_id(nome, avatar_url)',
            )
            .in('checkin_id', ids)
            .neq('user_id', uid)
            .order('criado_em', { ascending: false })
            .limit(50)
            .then((r) => (r.data ?? []) as unknown as ComentarioNotif[])
        : Promise.resolve([] as ComentarioNotif[]),
      this.sb
        .from('duplas')
        .select(
          'id, data, de_user, confirmada, criado_em, perfil:profiles!de_user(nome, avatar_url)',
        )
        .eq('para_user', uid)
        .order('criado_em', { ascending: false })
        .limit(50)
        .then((r) => (r.data ?? []) as unknown as DuplaNotif[]),
    ])

    const itens: Notificacao[] = [
      ...reacoes.map((r) => ({
        id: `reacao:${r.checkin_id}:${r.user_id}`,
        tipo: 'reacao' as const,
        criado_em: r.criado_em,
        autor: {
          id: r.user_id,
          nome: r.perfil?.nome ?? 'Alguém',
          avatar_url: r.perfil?.avatar_url ?? null,
        },
        detalhe: r.tipo,
        checkin_id: r.checkin_id,
      })),
      ...comentarios.map((c) => ({
        id: `comentario:${c.id}`,
        tipo: 'comentario' as const,
        criado_em: c.criado_em,
        autor: {
          id: c.user_id,
          nome: c.perfil?.nome ?? 'Alguém',
          avatar_url: c.perfil?.avatar_url ?? null,
        },
        detalhe: c.texto,
        checkin_id: c.checkin_id,
      })),
      ...duplas.map((d) => ({
        id: `dupla:${d.id}`,
        tipo: 'dupla' as const,
        criado_em: d.criado_em,
        autor: {
          id: d.de_user,
          nome: d.perfil?.nome ?? 'Alguém',
          avatar_url: d.perfil?.avatar_url ?? null,
        },
        detalhe: null,
        checkin_id: null,
        data: d.data,
        pendente: !d.confirmada,
      })),
    ]
    return itens.sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  }

  async contarNaoLidas(): Promise<number> {
    const uid = await this.requireUid()
    const perfil = ok(
      await this.sb
        .from('profiles')
        .select('notificacoes_vistas_em')
        .eq('id', uid)
        .maybeSingle(),
    ) as { notificacoes_vistas_em: string | null } | null
    const desde = perfil?.notificacoes_vistas_em
    const itens = await this.listNotificacoes()
    // Pendência de confirmação conta sempre: é ação, não aviso
    return itens.filter(
      (n) => n.pendente || !desde || n.criado_em > desde,
    ).length
  }

  async marcarNotificacoesVistas() {
    const uid = await this.requireUid()
    ok(
      await this.sb
        .from('profiles')
        .update({ notificacoes_vistas_em: new Date().toISOString() })
        .eq('id', uid),
    )
  }

  // ---- Duplas de dança ----

  /** Início e fim do dia em ISO, para filtrar check-ins por data. */
  private limitesDoDia(data: string) {
    return {
      de: new Date(`${data}T00:00:00`).toISOString(),
      ate: new Date(`${data}T23:59:59.999`).toISOString(),
    }
  }

  async parceirosPossiveis(data: string): Promise<ParceiroPossivel[]> {
    const uid = await this.requireUid()
    const { de, ate } = this.limitesDoDia(data)
    const checkins = ok(
      await this.sb
        .from('checkins')
        .select(
          'user_id, autor:profiles!user_id(nome, avatar_url, turmas:profile_turmas(turma, papel_danca))',
        )
        .gte('criado_em', de)
        .lte('criado_em', ate),
    ) as unknown as Array<{
      user_id: string
      autor: {
        nome: string
        avatar_url: string | null
        turmas: TurmaMembro[] | null
      } | null
    }>

    const minhas = ok(
      await this.sb
        .from('duplas')
        .select('para_user, confirmada')
        .eq('de_user', uid)
        .eq('data', data),
    ) as Array<{ para_user: string; confirmada: boolean }>
    const marcados = new Map(minhas.map((d) => [d.para_user, d.confirmada]))

    // Uma pessoa por mais de um check-in no dia vira uma linha só
    const porPessoa = new Map<string, ParceiroPossivel>()
    for (const c of checkins) {
      if (c.user_id === uid || porPessoa.has(c.user_id)) continue
      porPessoa.set(c.user_id, {
        user_id: c.user_id,
        nome: c.autor?.nome ?? 'Alguém',
        avatar_url: c.autor?.avatar_url ?? null,
        turma: turmaLabel(c.autor?.turmas ?? []),
        marcado: marcados.has(c.user_id),
        confirmada: marcados.get(c.user_id) === true,
      })
    }
    return [...porPessoa.values()].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  }

  async marcarDupla(parceiroId: string, data: string) {
    ok(
      await this.sb.rpc('marcar_dupla', {
        p_parceiro: parceiroId,
        p_data: data,
      }),
    )
  }

  async desmarcarDupla(parceiroId: string, data: string) {
    const uid = await this.requireUid()
    // Apaga os dois sentidos: se eu tiro, a dupla deixa de existir —
    // manter só o lado do outro deixaria um "confirmada" mentiroso.
    ok(
      await this.sb
        .from('duplas')
        .delete()
        .eq('data', data)
        .or(
          `and(de_user.eq.${uid},para_user.eq.${parceiroId}),and(de_user.eq.${parceiroId},para_user.eq.${uid})`,
        ),
    )
  }

  async parceirosDe(userId: string): Promise<ParceiroDanca[]> {
    // Só confirmadas contam. Como a dupla confirmada tem as duas
    // linhas, olhar por de_user já cobre tudo sem duplicar.
    const rows = ok(
      await this.sb
        .from('duplas')
        .select('data, para_user, perfil:profiles!para_user(nome, avatar_url)')
        .eq('de_user', userId)
        .eq('confirmada', true),
    ) as unknown as Array<{
      data: string
      para_user: string
      perfil: { nome: string; avatar_url: string | null } | null
    }>

    const porPessoa = new Map<string, ParceiroDanca & { dias: Set<string> }>()
    for (const r of rows) {
      let p = porPessoa.get(r.para_user)
      if (!p) {
        p = {
          user_id: r.para_user,
          nome: r.perfil?.nome ?? 'Alguém',
          avatar_url: r.perfil?.avatar_url ?? null,
          noites: 0,
          dias: new Set(),
        }
        porPessoa.set(r.para_user, p)
      }
      p.dias.add(r.data)
    }
    return [...porPessoa.values()]
      .map(({ dias, ...p }) => ({ ...p, noites: dias.size }))
      .sort((a, b) => b.noites - a.noites || a.nome.localeCompare(b.nome))
  }

  async confirmarPresenca(eventoId: string, data: string, vai: boolean) {
    const uid = await this.requireUid()
    if (vai) {
      ok(
        await this.sb.from('confirmacoes_presenca').upsert(
          { user_id: uid, evento_id: eventoId, data },
          { onConflict: 'user_id,evento_id,data' },
        ),
      )
    } else {
      ok(
        await this.sb
          .from('confirmacoes_presenca')
          .delete()
          .eq('user_id', uid)
          .eq('evento_id', eventoId)
          .eq('data', data),
      )
    }
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

  async matricularAlunos(plano: PessoaMatricula[]) {
    const comConta = plano.filter((p) => p.userId)
    const semConta = plano.filter((p) => !p.userId)

    // ---- Quem já tem conta: troca as turmas do perfil ----
    // Apaga e reinsere em vez de comparar diferença: a planilha do
    // semestre é a verdade, e "sumiu do arquivo" precisa mesmo sumir.
    if (comConta.length > 0) {
      for (const lote of emLotes(comConta.map((p) => p.userId!), 100)) {
        ok(await this.sb.from('profile_turmas').delete().in('user_id', lote))
      }
      const vinculos = comConta.flatMap((p) =>
        p.turmasNovas
          .filter((t) => t.turma)
          .map((t) => ({
            user_id: p.userId!,
            turma: t.turma!,
            papel_danca: t.papel_danca,
          })),
      )
      if (vinculos.length > 0) {
        ok(await this.sb.from('profile_turmas').insert(vinculos))
      }
    }

    // ---- Quem ainda não tem conta: troca a linha da chamada ----
    const idsVelhos = semConta.flatMap((p) => p.linhasChamada.map((l) => l.id))
    for (const lote of emLotes(idsVelhos, 100)) {
      ok(await this.sb.from('alunos_cadastrados').delete().in('id', lote))
    }
    const linhas = semConta.flatMap((p) =>
      p.turmasNovas.map((t) => ({
        nome: p.nome,
        telefone: p.telefone.trim(),
        turma: t.turma,
        papel_danca: t.papel_danca,
      })),
    )
    if (linhas.length > 0) {
      ok(await this.sb.from('alunos_cadastrados').insert(linhas))
    }

    return { perfis: comConta.length, chamada: semConta.length }
  }

  async limparChamadaComConta() {
    const [alunos, perfis] = await Promise.all([
      this.listAlunosCadastrados(),
      this.listProfiles(),
    ])
    const alvo = alunos.filter((a) =>
      perfis.some((p) => p.telefone && telefonesIguais(a.telefone, p.telefone)),
    )
    for (const lote of emLotes(alvo.map((a) => a.id), 100)) {
      ok(await this.sb.from('alunos_cadastrados').delete().in('id', lote))
    }
    return alvo.length
  }

  async semestreEncerrado() {
    // head + count: não traz linha nenhuma, só quer saber se existe
    const { count, error } = await this.sb
      .from('profile_turmas')
      .select('user_id', { count: 'exact', head: true })
    if (error) throw new Error(traduz(error.message))
    return (count ?? 0) === 0
  }

  async encerrarSemestre() {
    const perfis = await this.listProfiles()
    const comTurma = perfis.filter((p) => p.turmas.length > 0)
    for (const lote of emLotes(comTurma.map((p) => p.id), 100)) {
      ok(await this.sb.from('profile_turmas').delete().in('user_id', lote))
    }
    // Fica registrado mesmo se ninguém tinha turma (comTurma vazio):
    // é o carimbo de quando o semestre virou, não uma contagem.
    const uid = await this.getSessionUserId()
    ok(
      await this.sb
        .from('semestres')
        .insert({ encerrado_por: uid }),
    )
    return comTurma.length
  }

  async inicioSemestreAtual(): Promise<string | null> {
    const { data, error } = await this.sb
      .from('semestres')
      .select('encerrado_em')
      .order('encerrado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Sem a migração 017 a tabela não existe — cai no fallback de quem
    // chamou (data de criação da conta), sem quebrar a retrospectiva.
    if (error) return null
    return (data as { encerrado_em: string } | null)?.encerrado_em ?? null
  }

  async listPerfisPublicos(): Promise<PerfilPublico[]> {
    // Colunas nomeadas de propósito: `*` traria o telefone junto, e a
    // busca é usada por qualquer aluno.
    const data = ok(
      await this.sb
        .from('profiles')
        .select(
          'id, nome, avatar_url, criado_em, turmas:profile_turmas(turma, papel_danca), cargos:profile_cargos(cargo)',
        )
        .order('nome'),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((p) => {
      const {
        telefone: _semTelefone,
        email: _semEmail,
        ...publico
      } = this.mapProfile(p)
      return publico
    })
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

  // ---- Distintivos personalizados ----

  async listDistintivos(): Promise<DistintivoDef[]> {
    const data = ok(
      await this.sb
        .from('distintivos')
        .select(
          'id, emoji, titulo, descricao, concedidos:distintivos_concedidos(count)',
        )
        .order('criado_em'),
    ) as unknown as Array<Record<string, unknown>>
    return data.map((d) => ({
      id: d.id as string,
      emoji: d.emoji as string,
      titulo: d.titulo as string,
      descricao: (d.descricao as string) ?? '',
      concedidos:
        (d.concedidos as Array<{ count: number }>)?.[0]?.count ?? 0,
    }))
  }

  async saveDistintivo(d: DistintivoDefInput) {
    const titulo = d.titulo.trim()
    if (!titulo) throw new Error('Título do distintivo vazio')
    if (!d.emoji.trim()) throw new Error('Escolha um emoji para o distintivo')
    const uid = await this.requireUid()
    ok(
      await this.sb.from('distintivos').insert({
        emoji: d.emoji.trim(),
        titulo,
        descricao: d.descricao.trim(),
        criado_por: uid,
      }),
    )
  }

  async deleteDistintivo(id: string) {
    ok(await this.sb.from('distintivos').delete().eq('id', id))
  }

  async listRecebedores(distintivoId: string): Promise<DistintivoRecebedor[]> {
    const data = ok(
      await this.sb
        .from('distintivos_concedidos')
        .select('user_id, concedido_em, perfil:profiles(nome)')
        .eq('distintivo_id', distintivoId)
        .order('concedido_em', { ascending: false }),
    ) as unknown as Array<{
      user_id: string
      concedido_em: string
      perfil: { nome: string } | null
    }>
    return data.map((r) => ({
      user_id: r.user_id,
      nome: r.perfil?.nome ?? 'Alguém',
      concedido_em: r.concedido_em,
    }))
  }

  async concederDistintivo(distintivoId: string, userIds: string[]) {
    if (userIds.length === 0) return
    ok(
      await this.sb.from('distintivos_concedidos').upsert(
        userIds.map((user_id) => ({ distintivo_id: distintivoId, user_id })),
        { onConflict: 'distintivo_id,user_id' },
      ),
    )
  }

  async revogarDistintivo(distintivoId: string, userId: string) {
    ok(
      await this.sb
        .from('distintivos_concedidos')
        .delete()
        .eq('distintivo_id', distintivoId)
        .eq('user_id', userId),
    )
  }

  async distintivosDe(userId: string): Promise<Badge[]> {
    const data = ok(
      await this.sb
        .from('distintivos_concedidos')
        .select('distintivo:distintivos(id, emoji, titulo, descricao)')
        .eq('user_id', userId),
    ) as unknown as Array<{ distintivo: DistintivoBasico | null }>
    return data
      .filter((r): r is { distintivo: DistintivoBasico } => r.distintivo !== null)
      .map((r) => ({
        id: `custom-${r.distintivo.id}`,
        emoji: r.distintivo.emoji,
        titulo: r.distintivo.titulo,
        descricao: r.distintivo.descricao,
      }))
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
