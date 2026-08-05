import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ChallengeForm } from '../components/ChallengeForm'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { downloadCSV } from '../lib/csv'
import { challengePhase, daysLeft, formatDate } from '../lib/dates'
import { ParticipantesDesafio } from '../components/ParticipantesDesafio'
import { colocacoes } from '../lib/ranking'
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
  const classificacao = colocacoes(ranking)
  const lider = classificacao[0]?.entrada
  const minhaColocacao = classificacao.find(
    (c) => c.entrada.user_id === userId,
  )
  const minhaEntrada = minhaColocacao?.entrada

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
      colocacoes(ranking).map(({ entrada, posicao }) => [
        String(posicao),
        entrada.nome,
        entrada.turma ?? '',
        String(entrada.pontos),
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
        <div className="space-y-2 text-xs text-stone-500">
          <p>
            📆 {formatDate(desafio.data_inicio)} –{' '}
            {formatDate(desafio.data_fim)} · 👥 {desafio.participantes}{' '}
            {desafio.participantes === 1 ? 'participante' : 'participantes'}
          </p>
          <div>
            <p className="mb-1">⏰ Check-in vale ponto:</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-1">
              {desafio.janelas.map((j) => (
                <p key={j.dia_semana}>
                  <strong className="text-stone-300">
                    {DIAS_ABREV[j.dia_semana]}
                  </strong>{' '}
                  {j.hora_inicio}–{j.hora_fim}
                  {j.hora_fim < j.hora_inicio && ' 🌙'}
                </p>
              ))}
            </div>
          </div>
          <p>
            🎯 <strong>1 ponto por janela</strong> — postar mais de uma foto
            na mesma janela não pontua de novo
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
            ) : minhaColocacao?.empatado ? (
              // Empatado na frente não é "na frente" — é empate
              <>
                {' '}
                — você está <strong>empatado em {minhaColocacao.posicao}º</strong>{' '}
                🤝
              </>
            ) : (
              <> — você está na frente! 👑</>
            )}
          </div>
        )}

        {/* Entrada restrita: quem entra é a organização, então nem o
            botão de entrar nem o de sair fazem sentido para o aluno */}
        {desafio.entrada_restrita ? (
          <div className="rounded-xl bg-noite-950 px-4 py-3 text-sm text-stone-400">
            🎟️{' '}
            {desafio.sou_membro ? (
              <>
                Você está na lista deste evento. A organização é quem
                gerencia quem participa.
              </>
            ) : (
              <>
                Este desafio é do evento e só a organização adiciona
                participantes. Comprou ingresso e não está aqui? Fale com a
                organização.
              </>
            )}
          </div>
        ) : (
          fase !== 'encerrado' && (
            <button
              className={
                desafio.sou_membro ? 'btn-ghost w-full' : 'btn-primary w-full'
              }
              disabled={ocupado}
              onClick={() => void entrarOuSair()}
            >
              {desafio.sou_membro
                ? 'Sair do desafio'
                : 'Entrar na competição 🔥'}
            </button>
          )
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
            {classificacao.map(({ entrada: r, posicao, empatado }) => (
              <li
                key={r.user_id}
                className={r.user_id === userId ? 'bg-brasa-500/5' : ''}
              >
                <Link
                  to={`/perfil/${r.user_id}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Empate divide a mesma posição — e a mesma medalha */}
                  <span className="w-7 shrink-0 text-center text-lg font-extrabold">
                    {MEDALHAS[posicao - 1] ?? (
                      <span className="text-sm text-stone-500">{posicao}º</span>
                    )}
                  </span>
                  <Avatar nome={r.nome} url={r.avatar_url} tamanho={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {r.nome}
                      {r.user_id === userId && (
                        <span className="text-brasa-400"> (você)</span>
                      )}
                      {empatado && (
                        <span className="text-stone-500"> · empate</span>
                      )}
                    </p>
                    {r.turma && (
                      <p className="truncate text-xs text-stone-500">
                        {r.turma}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-extrabold text-brasa-400">
                    {r.pontos} {r.pontos === 1 ? 'pt' : 'pts'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {papel === 'organizador' && desafio.entrada_restrita && (
        <section className="card p-4">
          <ParticipantesDesafio desafio={desafio} onMudou={() => void carregar()} />
        </section>
      )}

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
