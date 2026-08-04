import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckinCard } from '../components/CheckinCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { InstallPrompt } from '../components/InstallPrompt'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import {
  desafiosQueContam,
  formatDateLong,
  proximaOcorrencia,
  toISODate,
} from '../lib/dates'
import type { AgendaEvent, Challenge, FeedItem } from '../lib/types'

interface Ocorrencia {
  evento: AgendaEvent
  quando: Date
}

function AgendaCard({ eventos }: { eventos: Ocorrencia[] }) {
  if (eventos.length === 0) return null
  const hoje = toISODate(new Date())
  return (
    <div className="card space-y-2.5 p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">
        📅 Agenda
      </h2>
      {eventos.map(({ evento, quando }) => {
        const ehHoje = toISODate(quando) === hoje
        return (
          <div key={evento.id} className="flex items-center gap-3">
            <span className="text-xl">{evento.data ? '🎉' : '🎓'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {evento.titulo}
                {evento.turma && (
                  <span className="ml-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-stone-400">
                    {evento.turma}
                  </span>
                )}
              </p>
              <p className="text-xs text-stone-500">
                {ehHoje ? (
                  <strong className="text-brasa-400">Hoje</strong>
                ) : (
                  formatDateLong(quando)
                )}
                {evento.hora && ` · ${evento.hora}`}
                {evento.descricao && ` — ${evento.descricao}`}
              </p>
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
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [eventos, setEventos] = useState<AgendaEvent[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const carregar = useCallback(async () => {
    try {
      // Carregados em separado: se a agenda ou os desafios falharem,
      // o feed ainda aparece (antes um erro derrubava a tela inteira).
      setErro(null)
      const f = await api.getFeed()
      setFeed(f)
      const [d, e] = await Promise.all([
        api.listChallenges().catch(() => [] as Challenge[]),
        api.listEvents().catch(() => [] as AgendaEvent[]),
      ])
      setDesafios(d)
      setEventos(e)
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

  // Próximos compromissos relevantes pra mim (qualquer turma minha, ou todos)
  const agenda = useMemo<Ocorrencia[]>(() => {
    const agora = new Date()
    const minhasTurmas = new Set(profile?.turmas.map((m) => m.turma) ?? [])
    return eventos
      .filter((e) => !e.turma || minhasTurmas.has(e.turma))
      .map((evento) => ({ evento, quando: proximaOcorrencia(evento, agora) }))
      .filter((o): o is Ocorrencia => o.quando !== null)
      .sort((a, b) => a.quando.getTime() - b.quando.getTime())
      .slice(0, 4)
  }, [eventos, profile])

  return (
    <div className="space-y-4">
      <InstallPrompt />
      <AgendaCard eventos={agenda} />

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
            contaPontos={desafiosQueContam(item.criado_em, desafios).length > 0}
            onChanged={() => void carregar()}
          />
        ))
      )}
    </div>
  )
}
