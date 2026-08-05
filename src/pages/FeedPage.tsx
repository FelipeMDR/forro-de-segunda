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
import type { AgendaEvent, Feriado, FeedItem } from '../lib/types'

function AgendaCard({ ocorrencias }: { ocorrencias: OcorrenciaAgenda[] }) {
  if (ocorrencias.length === 0) return null
  const hoje = toISODate(new Date())
  return (
    <div className="card space-y-2.5 p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-tinta-500">
        📅 Agenda
      </h2>
      {ocorrencias.map(({ evento, quando, cancelada, motivoCancelamento }, i) => {
        const ehHoje = toISODate(quando) === hoje
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
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FeedPage() {
  const { api, profile } = useAuth()
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [eventos, setEventos] = useState<AgendaEvent[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [erro, setErro] = useState<string | null>(null)
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

  return (
    <div className="space-y-4">
      <InstallPrompt />
      <AgendaCard ocorrencias={agenda} />

      {erro ? (
        <ErrorState
          titulo="Não consegui carregar o feed"
          erro={erro}
          onRetry={() => void carregar()}
        />
      ) : feed === null ? (
        <Spinner texto="Carregando o feed…" />
      ) : feed.length === 0 ? (
        <EmptyState
          emoji="💃"
          titulo="Ainda não tem check-in por aqui"
          texto="Seja a primeira pessoa a postar uma foto da aula!"
        >
          <Link to="/checkin" className="btn-primary">
            Fazer check-in 📸
          </Link>
        </EmptyState>
      ) : (
        feed.map((item) => (
          <CheckinCard
            key={item.id}
            item={item}
            onChanged={() => void carregar()}
          />
        ))
      )}
    </div>
  )
}
