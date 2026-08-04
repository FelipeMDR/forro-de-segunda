import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChallengeForm } from '../components/ChallengeForm'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { challengePhase, daysLeft, formatDate } from '../lib/dates'
import { DIAS_ABREV, type Challenge } from '../lib/types'

function CartaoDesafio({ c }: { c: Challenge }) {
  const fase = challengePhase(c)
  const restantes = daysLeft(c.data_fim)
  const dias =
    c.dias_semana.length === 7
      ? 'todo dia'
      : c.dias_semana.map((d) => DIAS_ABREV[d]).join('·')
  return (
    <Link
      to={`/desafios/${c.id}`}
      className="card block p-4 transition hover:border-brasa-400/30"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-extrabold">{c.titulo}</h3>
        {c.sou_membro && (
          <span className="shrink-0 rounded-full bg-brasa-500/15 px-2 py-1 text-[10px] font-bold text-brasa-300">
            participando
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-400">
        {formatDate(c.data_inicio)} – {formatDate(c.data_fim)} · {dias},{' '}
        {c.hora_inicio}–{c.hora_fim} · 👥 {c.participantes}
      </p>
      {fase === 'ativo' && (
        <p className="mt-2 text-xs font-bold text-brasa-400">
          🔥 {restantes} {restantes === 1 ? 'dia restante' : 'dias restantes'}
        </p>
      )}
      {fase === 'futuro' && (
        <p className="mt-2 text-xs font-bold text-stone-500">
          ⏳ Começa em {formatDate(c.data_inicio)}
        </p>
      )}
    </Link>
  )
}

export function ChallengesPage() {
  const { api, papel } = useAuth()
  const [desafios, setDesafios] = useState<Challenge[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setErro(null)
      setDesafios(await api.listChallenges())
    } catch (e) {
      console.error('[desafios] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (erro) {
    return (
      <ErrorState
        titulo="Não consegui carregar os desafios"
        erro={erro}
        onRetry={() => void carregar()}
      />
    )
  }
  if (desafios === null) return <Spinner texto="Carregando desafios…" />

  const ativos = desafios.filter((c) => challengePhase(c) === 'ativo')
  const futuros = desafios.filter((c) => challengePhase(c) === 'futuro')
  const encerrados = desafios.filter((c) => challengePhase(c) === 'encerrado')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Desafios 🏆</h1>
        {papel === 'organizador' && (
          <button className="btn-primary" onClick={() => setCriando(true)}>
            + Novo
          </button>
        )}
      </div>

      {desafios.length === 0 && (
        <EmptyState
          emoji="🏆"
          titulo="Nenhum desafio por enquanto"
          texto={
            papel === 'organizador'
              ? 'Crie o primeiro desafio para animar a turma!'
              : 'Os organizadores vão lançar um desafio em breve. Fica de olho!'
          }
        />
      )}

      {ativos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Rolando agora
          </h2>
          {ativos.map((c) => (
            <CartaoDesafio key={c.id} c={c} />
          ))}
        </section>
      )}

      {futuros.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Em breve
          </h2>
          {futuros.map((c) => (
            <CartaoDesafio key={c.id} c={c} />
          ))}
        </section>
      )}

      {encerrados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Encerrados
          </h2>
          {encerrados.map((c) => (
            <CartaoDesafio key={c.id} c={c} />
          ))}
        </section>
      )}

      {criando && (
        <ChallengeForm
          onClose={() => setCriando(false)}
          onSaved={() => void carregar()}
        />
      )}
    </div>
  )
}
