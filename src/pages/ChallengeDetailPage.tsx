import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ChallengeForm } from '../components/ChallengeForm'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { downloadCSV } from '../lib/csv'
import { challengePhase, daysLeft, formatDate } from '../lib/dates'
import { DIAS_ABREV, type Challenge, type RankingEntry } from '../lib/types'

const MEDALHAS = ['🥇', '🥈', '🥉']

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [desafio, setDesafio] = useState<Challenge | null | undefined>()
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    if (!id) return
    try {
      setErro(null)
      const c = await api.getChallenge(id)
      setDesafio(c)
      if (c) setRanking(await api.getRanking(c))
    } catch (e) {
      console.error('[desafio] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (erro) {
    return (
      <ErrorState erro={erro} onRetry={() => void carregar()} />
    )
  }
  if (desafio === undefined) return <Spinner texto="Carregando desafio…" />
  if (desafio === null)
    return (
      <EmptyState emoji="🤔" titulo="Desafio não encontrado">
        <button className="btn-ghost" onClick={() => navigate('/desafios')}>
          Voltar aos desafios
        </button>
      </EmptyState>
    )

  const fase = challengePhase(desafio)
  const restantes = daysLeft(desafio.data_fim)
  const lider = ranking[0]
  const minhaEntrada = ranking.find((r) => r.user_id === userId)
  const dias =
    desafio.dias_semana.length === 7
      ? 'todos os dias'
      : desafio.dias_semana.map((d) => DIAS_ABREV[d]).join(' · ')

  const entrarOuSair = async () => {
    setOcupado(true)
    try {
      if (desafio.sou_membro) {
        await api.leaveChallenge(desafio.id)
        toast('Você saiu do desafio')
      } else {
        await api.joinChallenge(desafio.id)
        toast('Bora dançar! Você entrou na competição 🔥')
      }
      await carregar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const excluir = async () => {
    try {
      await api.deleteChallenge(desafio.id)
      toast('Desafio excluído')
      navigate('/desafios')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const exportarCSV = () => {
    downloadCSV(
      `desafio-${desafio.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      ['Posição', 'Nome', 'Turma', 'Presenças'],
      ranking.map((r, i) => [
        String(i + 1),
        r.nome,
        r.turma ?? '',
        String(r.pontos),
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <button
        className="text-sm font-bold text-stone-400"
        onClick={() => navigate('/desafios')}
      >
        ← Desafios
      </button>

      <div className="card space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-extrabold">{desafio.titulo}</h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              fase === 'ativo'
                ? 'bg-emerald-500/15 text-emerald-300'
                : fase === 'futuro'
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'bg-white/5 text-stone-500'
            }`}
          >
            {fase === 'ativo'
              ? `ativo · ${restantes}d restantes`
              : fase === 'futuro'
                ? 'em breve'
                : 'encerrado'}
          </span>
        </div>
        {desafio.descricao && (
          <p className="text-sm text-stone-300">{desafio.descricao}</p>
        )}
        <div className="space-y-1 text-xs text-stone-500">
          <p>
            📆 {formatDate(desafio.data_inicio)} –{' '}
            {formatDate(desafio.data_fim)} · 👥 {desafio.participantes}{' '}
            {desafio.participantes === 1 ? 'participante' : 'participantes'}
          </p>
          <p>
            ⏰ Check-in vale ponto: <strong>{dias}</strong>, das{' '}
            {desafio.hora_inicio} às {desafio.hora_fim}
          </p>
        </div>

        {desafio.sou_membro && minhaEntrada && (
          <div className="rounded-xl bg-noite-950 px-4 py-3 text-sm">
            Você tem{' '}
            <strong className="text-brasa-400">
              {minhaEntrada.pontos}{' '}
              {minhaEntrada.pontos === 1 ? 'presença' : 'presenças'}
            </strong>
            {lider && lider.pontos > minhaEntrada.pontos ? (
              <>
                {' '}
                — faltam{' '}
                <strong>{lider.pontos - minhaEntrada.pontos}</strong> para
                alcançar {lider.user_id === userId ? 'você mesmo' : lider.nome}{' '}
                🏃
              </>
            ) : (
              <> — você está na frente! 👑</>
            )}
          </div>
        )}

        {fase !== 'encerrado' && (
          <button
            className={desafio.sou_membro ? 'btn-ghost w-full' : 'btn-primary w-full'}
            disabled={ocupado}
            onClick={() => void entrarOuSair()}
          >
            {desafio.sou_membro ? 'Sair do desafio' : 'Entrar na competição 🔥'}
          </button>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Ranking
          </h2>
          {papel === 'organizador' && ranking.length > 0 && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={exportarCSV}>
              ⬇️ Resultado (CSV)
            </button>
          )}
        </div>
        {ranking.length === 0 ? (
          <EmptyState
            emoji="🕺"
            titulo="Ninguém entrou ainda"
            texto="Seja a primeira pessoa a participar!"
          />
        ) : (
          <ol className="card divide-y divide-white/5">
            {ranking.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  r.user_id === userId ? 'bg-brasa-500/5' : ''
                }`}
              >
                <span className="w-7 text-center text-lg font-extrabold">
                  {MEDALHAS[i] ?? (
                    <span className="text-sm text-stone-500">{i + 1}º</span>
                  )}
                </span>
                <Avatar nome={r.nome} url={r.avatar_url} tamanho={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {r.nome}
                    {r.user_id === userId && (
                      <span className="text-brasa-400"> (você)</span>
                    )}
                  </p>
                  {r.turma && (
                    <p className="text-xs text-stone-500">{r.turma}</p>
                  )}
                </div>
                <span className="text-sm font-extrabold text-brasa-400">
                  {r.pontos} {r.pontos === 1 ? 'pt' : 'pts'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {papel === 'organizador' && (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Organização
          </h2>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setEditando(true)}>
              ✏️ Editar
            </button>
            {confirmandoExclusao ? (
              <button className="btn-danger flex-1" onClick={() => void excluir()}>
                ⚠️ Confirmar?
              </button>
            ) : (
              <button
                className="btn-danger flex-1"
                onClick={() => setConfirmandoExclusao(true)}
              >
                🗑️ Excluir
              </button>
            )}
          </div>
        </section>
      )}

      {editando && (
        <ChallengeForm
          desafio={desafio}
          onClose={() => setEditando(false)}
          onSaved={() => void carregar()}
        />
      )}
    </div>
  )
}
