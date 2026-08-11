import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckinCard } from '../components/CheckinCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { InstallPrompt } from '../components/InstallPrompt'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import {
  formatDateLong,
  proximasOcorrenciasAgenda,
  toISODate,
  type OcorrenciaAgenda,
} from '../lib/dates'
import { Avatar } from '../components/Avatar'
import type {
  AgendaEvent,
  ConfirmacaoPresenca,
  Feriado,
  FeedItem,
  ParceiroPossivel,
} from '../lib/types'

/**
 * "Eu vou" de uma ocorrência: quem confirmou e o botão de entrar na
 * lista. Em dança social, saber que tem gente indo é o que faz alguém
 * sair de casa — por isso as caras aparecem, e não só a contagem.
 */
function EuVou({
  confirmados,
  souEu,
  ocupado,
  onToggle,
}: {
  confirmados: ConfirmacaoPresenca[]
  souEu: boolean
  ocupado: boolean
  onToggle: () => void
}) {
  const mostrar = confirmados.slice(0, 4)
  const resto = confirmados.length - mostrar.length
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        /* verde-700 e não 600: o texto branco sobre o 600 dá 3,09:1,
           abaixo do mínimo de 4,5:1 para texto pequeno. */
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
          souEu
            ? 'bg-verde-700 text-white'
            : 'bg-preto/5 text-tinta-700 hover:bg-preto/10'
        }`}
        disabled={ocupado}
        onClick={onToggle}
      >
        {souEu ? '✓ Eu vou' : 'Eu vou'}
      </button>
      {confirmados.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex -space-x-2">
            {mostrar.map((c) => (
              <div key={c.user_id} className="ring-2 ring-papel rounded-full">
                <Avatar nome={c.nome} url={c.avatar_url} tamanho={22} />
              </div>
            ))}
          </div>
          <span className="truncate text-xs text-tinta-500">
            {confirmados.length}{' '}
            {confirmados.length === 1 ? 'confirmado' : 'confirmados'}
            {resto > 0 && ''}
          </span>
        </div>
      )}
    </div>
  )
}

function AgendaCard({
  ocorrencias,
  confirmacoes,
  userId,
  ocupado,
  onConfirmar,
}: {
  ocorrencias: OcorrenciaAgenda[]
  confirmacoes: ConfirmacaoPresenca[]
  userId: string | null
  ocupado: string | null
  onConfirmar: (eventoId: string, data: string, vai: boolean) => void
}) {
  if (ocorrencias.length === 0) return null
  const hoje = toISODate(new Date())
  return (
    <div className="card space-y-2.5 p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-tinta-500">
        📅 Agenda
      </h2>
      {ocorrencias.map(({ evento, quando, cancelada, motivoCancelamento }, i) => {
        const dia = toISODate(quando)
        const ehHoje = dia === hoje
        const confirmados = confirmacoes.filter(
          (c) => c.evento_id === evento.id && c.data === dia,
        )
        const souEu = confirmados.some((c) => c.user_id === userId)
        const chave = `${evento.id}|${dia}`
        return (
          <div key={`${evento.id}-${i}`} className="flex items-center gap-3">
            <span className="text-xl">
              {cancelada ? '🚫' : evento.data ? '🎉' : '🎓'}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-bold ${
                  cancelada ? 'text-tinta-500 line-through' : ''
                }`}
              >
                {evento.titulo}
                {evento.turma && (
                  <span className="ml-1.5 rounded-full bg-preto/5 px-2 py-0.5 text-[10px] font-bold text-tinta-600 no-underline">
                    {evento.turma}
                  </span>
                )}
              </p>
              {cancelada ? (
                <p className="text-xs text-red-600">
                  Cancelada{motivoCancelamento ? ` — ${motivoCancelamento}` : ''}
                  {' · seria '}
                  {ehHoje ? 'hoje' : formatDateLong(quando)}
                </p>
              ) : (
                <p className="text-xs text-tinta-500">
                  {ehHoje ? (
                    <strong className="text-brasa-700">Hoje</strong>
                  ) : (
                    formatDateLong(quando)
                  )}
                  {evento.hora && ` · ${evento.hora}`}
                  {evento.descricao && ` — ${evento.descricao}`}
                </p>
              )}
              {/* Aula cancelada não tem para onde ir */}
              {!cancelada && (
                <EuVou
                  confirmados={confirmados}
                  souEu={souEu}
                  ocupado={ocupado === chave}
                  onToggle={() => onConfirmar(evento.id, dia, !souEu)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FeedPage() {
  const { api, profile, userId } = useAuth()
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [eventos, setEventos] = useState<AgendaEvent[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [confirmacoes, setConfirmacoes] = useState<ConfirmacaoPresenca[]>([])
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [visao, setVisao] = useState<'todos' | 'turma'>('todos')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const carregar = useCallback(async () => {
    try {
      // Carregados em separado: se a agenda falhar, o feed ainda
      // aparece (antes um erro derrubava a tela inteira).
      setErro(null)
      const f = await api.getFeed()
      setFeed(f)
      const [e, fer] = await Promise.all([
        api.listEvents().catch(() => [] as AgendaEvent[]),
        api.listFeriados().catch(() => [] as Feriado[]),
      ])
      setEventos(e)
      setFeriados(fer)
    } catch (e) {
      console.error('[feed] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  useEffect(() => {
    void carregar()
    // Realtime: re-busca o feed (com debounce) quando algo muda
    const unsub = api.subscribeFeed(() => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void carregar(), 400)
    })
    const onFocus = () => void carregar()
    window.addEventListener('focus', onFocus)
    return () => {
      unsub()
      clearTimeout(timer.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [api, carregar])

  // Próximos compromissos relevantes pra mim (qualquer turma minha, ou
  // todos), já considerando feriados/cancelamentos: se a próxima aula
  // cair num feriado, mostra "Cancelada" + quando é a próxima válida.
  const agenda = useMemo<OcorrenciaAgenda[]>(() => {
    const agora = new Date()
    const minhasTurmas = new Set(profile?.turmas.map((m) => m.turma) ?? [])
    const relevantes = eventos.filter(
      (e) => !e.turma || minhasTurmas.has(e.turma),
    )
    return proximasOcorrenciasAgenda(relevantes, feriados, agora).slice(0, 4)
  }, [eventos, feriados, profile])

  // As confirmações só interessam para as datas que estão na tela
  const datasDaAgenda = useMemo(
    () => [...new Set(agenda.map((o) => toISODate(o.quando)))],
    [agenda],
  )

  const carregarConfirmacoes = useCallback(async () => {
    if (datasDaAgenda.length === 0) return
    try {
      setConfirmacoes(await api.confirmacoesDe(datasDaAgenda))
    } catch (e) {
      // Sem a migração 015 a tabela não existe — o resto do feed vale
      console.error('[feed] falha ao carregar confirmações', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, datasDaAgenda.join('|')])

  useEffect(() => {
    void carregarConfirmacoes()
  }, [carregarConfirmacoes])

  const confirmar = async (eventoId: string, data: string, vai: boolean) => {
    const chave = `${eventoId}|${data}`
    setConfirmando(chave)
    try {
      await api.confirmarPresenca(eventoId, data, vai)
      await carregarConfirmacoes()
    } catch (e) {
      console.error('[feed] falha ao confirmar presença', e)
    } finally {
      setConfirmando(null)
    }
  }

  // Uma consulta só, para hoje: o caminho passivo de marcar dupla é
  // sobre a noite que acabou ("rolando o feed no ônibus de volta"), e
  // buscar por data de cada post viraria N consultas.
  const hojeISO = toISODate(new Date())
  const [duplasHoje, setDuplasHoje] = useState<Map<string, ParceiroPossivel>>(
    new Map(),
  )

  const carregarDuplas = useCallback(async () => {
    try {
      const lista = await api.parceirosPossiveis(hojeISO)
      setDuplasHoje(new Map(lista.map((p) => [p.user_id, p])))
    } catch (e) {
      // Sem a migração 016 o botão simplesmente não aparece
      console.error('[feed] falha ao carregar duplas', e)
    }
  }, [api, hojeISO])

  useEffect(() => {
    void carregarDuplas()
  }, [carregarDuplas])

  const marcarDupla = async (parceiroId: string, marcar: boolean) => {
    if (marcar) await api.marcarDupla(parceiroId, hojeISO)
    else await api.desmarcarDupla(parceiroId, hojeISO)
    await carregarDuplas()
  }

  const minhasTurmas = useMemo(
    () => profile?.turmas.map((m) => m.turma) ?? [],
    [profile],
  )

  // Filtra por turma em comum, não por turma exata: quem faz duas turmas
  // vê as duas, e continua vendo quem divide qualquer uma delas.
  const feedVisivel = useMemo(() => {
    if (!feed || visao === 'todos') return feed
    return feed.filter((item) =>
      item.autor.turmas.some((t) => minhasTurmas.includes(t)),
    )
  }, [feed, visao, minhasTurmas])

  return (
    <div className="space-y-4">
      <InstallPrompt />
      <AgendaCard
        ocorrencias={agenda}
        confirmacoes={confirmacoes}
        userId={userId}
        ocupado={confirmando}
        onConfirmar={(e, d, vai) => void confirmar(e, d, vai)}
      />

      {/* Sem turma no semestre (veterano) não há o que filtrar — o
          seletor só apareceria para levar a uma lista vazia. */}
      {minhasTurmas.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-preto/5 p-1">
          {(
            [
              ['todos', 'Todo mundo'],
              ['turma', minhasTurmas.length > 1 ? 'Minhas turmas' : 'Minha turma'],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              aria-pressed={visao === v}
              className={`rounded-lg py-2 text-sm font-bold transition ${
                visao === v
                  ? 'bg-papel text-tinta-900 shadow-sm'
                  : 'text-tinta-500'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      {erro ? (
        <ErrorState
          titulo="Não consegui carregar o feed"
          erro={erro}
          onRetry={() => void carregar()}
        />
      ) : feedVisivel === null ? (
        <Spinner texto="Carregando o feed…" />
      ) : feedVisivel.length === 0 ? (
        visao === 'turma' ? (
          <EmptyState
            emoji="🫂"
            titulo="Nada da sua turma ainda"
            texto={`Ninguém de ${minhasTurmas.join(' ou ')} postou por enquanto. Que tal ser a primeira pessoa?`}
          >
            <button className="btn-ghost" onClick={() => setVisao('todos')}>
              Ver todo mundo
            </button>
          </EmptyState>
        ) : (
          <EmptyState
            emoji="💃"
            titulo="Ainda não tem check-in por aqui"
            texto="Seja a primeira pessoa a postar uma foto da aula!"
          >
            <Link to="/checkin" className="btn-primary">
              Fazer check-in 📸
            </Link>
          </EmptyState>
        )
      ) : (
        feedVisivel.map((item) => (
          <CheckinCard
            key={item.id}
            item={item}
            onChanged={() => void carregar()}
            dupla={
              item.criado_em.slice(0, 10) === hojeISO
                ? duplasHoje.get(item.user_id)
                : null
            }
            onDupla={(marcar) => marcarDupla(item.user_id, marcar)}
          />
        ))
      )}
    </div>
  )
}
