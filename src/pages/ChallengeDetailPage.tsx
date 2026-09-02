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
import {
  aberturasDoDesafio,
  challengePhase,
  daysLeft,
  formatDate,
  suspensoesDoDesafio,
} from '../lib/dates'
import { ParticipantesDesafio } from '../components/ParticipantesDesafio'
import { colocacoes } from '../lib/ranking'
import {
  DIAS_ABREV,
  defModalidade,
  rotuloPontos,
  type AberturaAntecipada,
  type Challenge,
  type Feriado,
  type Modalidade,
  type RankingEntry,
} from '../lib/types'

const MEDALHAS = ['🥇', '🥈', '🥉']

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [desafio, setDesafio] = useState<Challenge | null | undefined>()
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [aberturasAntecipadas, setAberturasAntecipadas] = useState<
    AberturaAntecipada[]
  >([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  /**
   * Qual disputa está na tela. `null` = ainda não escolhida; assim que
   * o desafio carrega, cai na primeira modalidade dele — que é a
   * presença nos desafios que só têm uma.
   */
  const [modalidade, setModalidade] = useState<Modalidade | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    try {
      setErro(null)
      const c = await api.getChallenge(id)
      setDesafio(c)
      setFeriados(await api.listFeriados().catch(() => [] as Feriado[]))
      setAberturasAntecipadas(
        await api.listAberturas().catch(() => [] as AberturaAntecipada[]),
      )
      // Se a modalidade aberta sumiu (a organização desligou aquela
      // disputa enquanto a tela estava aberta), volta para a primeira.
      setModalidade((atual) =>
        c && atual && c.modalidades.includes(atual)
          ? atual
          : (c?.modalidades[0] ?? null),
      )
    } catch (e) {
      console.error('[desafio] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // O ranking recarrega sozinho ao trocar de aba. Consulta à parte da
  // de cima porque trocar de disputa não precisa rebuscar o desafio,
  // os feriados e as aberturas — que não mudam entre uma aba e outra.
  useEffect(() => {
    if (!desafio || !modalidade) return
    let cancelado = false
    void api
      .getRanking(desafio, modalidade)
      .then((r) => {
        if (!cancelado) setRanking(r)
      })
      .catch((e) => {
        console.error('[desafio] falha ao carregar ranking', e)
        if (!cancelado) setRanking([])
      })
    return () => {
      cancelado = true
    }
  }, [api, desafio, modalidade])

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
  const suspensoes = suspensoesDoDesafio(desafio, feriados)
  const aberturas = aberturasDoDesafio(desafio, aberturasAntecipadas)
  const modalidadeAtual = modalidade ?? desafio.modalidades[0]
  const def = defModalidade(modalidadeAtual)
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

  // Um CSV por disputa: o arquivo e a coluna dizem qual, senão dois
  // downloads do mesmo desafio ficariam indistinguíveis na pasta.
  const exportarCSV = () => {
    const base = desafio.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadCSV(
      `desafio-${base}-${modalidadeAtual}`,
      ['Posição', 'Nome', 'Turma', def.nome],
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
        className="text-sm font-bold text-tinta-600"
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
                ? 'bg-emerald-500/15 text-emerald-700'
                : fase === 'futuro'
                  ? 'bg-azul-500/10 text-azul-700'
                  : 'bg-preto/5 text-tinta-500'
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
          <p className="text-sm text-tinta-700">{desafio.descricao}</p>
        )}
        <div className="space-y-2 text-xs text-tinta-500">
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
                  <strong className="text-tinta-700">
                    {DIAS_ABREV[j.dia_semana]}
                  </strong>{' '}
                  {j.hora_inicio}–{j.hora_fim}
                  {j.hora_fim < j.hora_inicio && ' 🌙'}
                </p>
              ))}
            </div>
          </div>
          {suspensoes.length > 0 && (
            <div>
              <p className="mb-1">🚫 Sem forró (não conta ponto):</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-1">
                {suspensoes.map((f) => (
                  <p key={f.id}>
                    <strong className="text-tinta-700">
                      {formatDate(f.data)}
                    </strong>
                    {f.motivo && ` · ${f.motivo}`}
                  </p>
                ))}
              </div>
            </div>
          )}
          {aberturas.length > 0 && (
            <div>
              <p className="mb-1">🕐 Abriu mais cedo (conta desde então):</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-1">
                {aberturas.map((a) => (
                  <p key={a.id}>
                    <strong className="text-tinta-700">
                      {formatDate(a.data)}
                    </strong>{' '}
                    às {a.hora_abertura}
                    {a.motivo && ` · ${a.motivo}`}
                  </p>
                ))}
              </div>
            </div>
          )}
          <p>
            🎯 <strong>1 ponto por janela</strong> — postar mais de uma foto
            na mesma janela não pontua de novo
          </p>
        </div>

        {/* Fala da disputa que está aberta na tela — com duas abas, um
            "você tem 3 presenças" fixo contradiria o rodízio ao lado. */}
        {desafio.sou_membro && minhaEntrada && (
          <div className="rounded-xl bg-fundo px-4 py-3 text-sm">
            {desafio.modalidades.length > 1 && `${def.emoji} ${def.nome}: `}
            Você tem{' '}
            <strong className="text-brasa-700">
              {rotuloPontos(modalidadeAtual, minhaEntrada.pontos)}
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
          <div className="rounded-xl bg-fundo px-4 py-3 text-sm text-tinta-600">
            🎟️{' '}
            {desafio.sou_membro ? (
              <>
                Você está na lista deste desafio restrito. A organização é
                quem gerencia quem participa.
              </>
            ) : (
              <>
                Este é um desafio restrito — só a organização adiciona
                participantes. Acha que deveria estar aqui? Fale com a
                organização.
              </>
            )}
          </div>
        ) : (
          fase !== 'encerrado' && (
            <div className="space-y-2">
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
              {/* Entrar é escolha, e ninguém perde o que já fez por ter
                  demorado a decidir. */}
              {!desafio.sou_membro && (
                <p className="text-center text-xs text-tinta-500">
                  Os check-ins que você já fez dentro do período entram junto
                  — não precisa começar do zero.
                </p>
              )}
            </div>
          )
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
            Ranking
          </h2>
          {papel === 'organizador' && ranking.length > 0 && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={exportarCSV}>
              ⬇️ Resultado (CSV)
            </button>
          )}
        </div>

        {/* Só aparece quando há mais de uma disputa: num desafio comum
            um seletor de uma opção só seria ruído. */}
        {desafio.modalidades.length > 1 && (
          <div
            className="grid gap-1 rounded-xl bg-preto/5 p-1"
            style={{
              gridTemplateColumns: `repeat(${desafio.modalidades.length}, minmax(0, 1fr))`,
            }}
          >
            {desafio.modalidades.map((id) => {
              const d = defModalidade(id)
              return (
                <button
                  key={id}
                  onClick={() => setModalidade(id)}
                  aria-pressed={modalidadeAtual === id}
                  className={`rounded-lg py-2 text-sm font-bold transition ${
                    modalidadeAtual === id
                      ? 'bg-papel text-tinta-900 shadow-sm'
                      : 'text-tinta-500'
                  }`}
                >
                  {d.emoji} {d.nome}
                </button>
              )
            })}
          </div>
        )}
        {desafio.modalidades.length > 1 && (
          <p className="px-1 text-xs text-tinta-500">{def.regra}</p>
        )}

        {ranking.length === 0 ? (
          <EmptyState
            emoji="🕺"
            titulo="Ninguém entrou ainda"
            texto="Seja a primeira pessoa a participar!"
          />
        ) : (
          <ol className="card divide-y divide-preto/10">
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
                      <span className="text-sm text-tinta-500">{posicao}º</span>
                    )}
                  </span>
                  <Avatar nome={r.nome} url={r.avatar_url} tamanho={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {r.nome}
                      {r.user_id === userId && (
                        <span className="text-brasa-700"> (você)</span>
                      )}
                      {empatado && (
                        <span className="text-tinta-500"> · empate</span>
                      )}
                    </p>
                    {r.turma && (
                      <p className="truncate text-xs text-tinta-500">
                        {r.turma}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-brasa-700">
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
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
