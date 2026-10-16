import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ChallengeForm } from '../components/ChallengeForm'
import { ErrorState } from '../components/ErrorState'
import { Icone } from '../components/Icone'
import { ParticipantesDesafio } from '../components/ParticipantesDesafio'
import { Spinner } from '../components/Spinner'
import {
  BotaoAcao,
  BotaoIcone,
  BotaoSuave,
  Confirmar,
  RotuloSecao,
  Segmentado,
  useVoltar,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { downloadCSV } from '../lib/csv'
import {
  aberturasDoDesafio,
  challengePhase,
  suspensoesDoDesafio,
} from '../lib/dates'
import { diaCurto, faixasDeHorario, periodoCurto } from '../lib/horarios'
import { colocacoes } from '../lib/ranking'
import {
  defModalidade,
  rotuloPontos,
  type AberturaAntecipada,
  type Challenge,
  type Feriado,
  type Modalidade,
  type RankingEntry,
} from '../lib/types'
import { statusDoDesafio } from './ChallengesPage'
import { useLembrado } from '../lib/memoriaTelas'

/**
 * Junta dias seguidos com o mesmo motivo numa faixa só ("05 – 09 out ·
 * Semana do saco cheio"), em vez de repetir o motivo dia a dia.
 */
function agruparSuspensoes(suspensoes: Feriado[]): { quando: string; texto: string }[] {
  const grupos: { inicio: string; fim: string; motivo: string }[] = []
  for (const f of suspensoes) {
    const motivo = f.motivo ?? ''
    const ultimo = grupos[grupos.length - 1]
    const seguinte =
      ultimo &&
      ultimo.motivo === motivo &&
      new Date(`${f.data}T12:00:00`).getTime() -
        new Date(`${ultimo.fim}T12:00:00`).getTime() <=
        86_400_000 + 3_600_000 // folga para o horário de verão
    if (seguinte) ultimo.fim = f.data
    else grupos.push({ inicio: f.data, fim: f.data, motivo })
  }
  return grupos.map((g) => ({
    quando: g.inicio === g.fim ? diaCurto(g.inicio) : periodoCurto(g.inicio, g.fim),
    texto: g.motivo || 'Sem forró',
  }))
}

/** Datas especiais do desafio: data à esquerda, explicação à direita. */
function ListaDeDatas({
  titulo,
  itens,
}: {
  titulo: string
  itens: { quando: string; texto: string }[]
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-linha pt-3">
      <span className="text-[12px] font-extrabold uppercase tracking-[.08em] text-ink3">
        {titulo}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {itens.map((i) => (
          <li key={i.quando} className="flex items-baseline gap-3 text-sm">
            <span className="w-[88px] shrink-0 font-bold tabular-nums text-ink">{i.quando}</span>
            <span className="leading-snug text-ink2">{i.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ouro, prata e bronze do pódio; daí para baixo, superfície. */
const MEDALHAS = ['#E2B33C', '#A9B1B6', '#B8743D']

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { api, userId, papel, profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const voltar = useVoltar('/desafios')
  const [desafio, setDesafio] = useLembrado<Challenge | null | undefined>(
    `desafio:${id}`,
    undefined,
  )
  const [feriados, setFeriados] = useLembrado<Feriado[]>('feriados', [])
  const [aberturasAntecipadas, setAberturasAntecipadas] = useLembrado<AberturaAntecipada[]>(
    'aberturas',
    [],
  )
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  /**
   * Qual disputa está na tela. `null` = ainda não escolhida; assim que
   * o desafio carrega, cai na primeira modalidade dele.
   */
  const [modalidade, setModalidade] = useLembrado<Modalidade | null>(
    `desafio:${id}:modalidade`,
    null,
  )
  // Uma memória por disputa: alternar entre elas não pisca o ranking
  const [ranking, setRanking] = useLembrado<RankingEntry[]>(
    `desafio:${id}:ranking:${modalidade}`,
    [],
  )

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
        c && atual && c.modalidades.includes(atual) ? atual : (c?.modalidades[0] ?? null),
      )
    } catch (e) {
      console.error('[desafio] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // O ranking recarrega sozinho ao trocar de aba, sem rebuscar o resto
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
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => void carregar()} />
      </div>
    )
  }
  if (desafio === undefined) return <Spinner texto="Carregando desafio…" />
  if (desafio === null) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-24 text-center">
        <p className="text-lg font-extrabold">Desafio não encontrado</p>
        <BotaoSuave onClick={() => navigate('/desafios')}>Ver os desafios</BotaoSuave>
      </div>
    )
  }

  const fase = challengePhase(desafio)
  const status = statusDoDesafio(desafio)
  const suspensoes = suspensoesDoDesafio(desafio, feriados)
  const aberturas = aberturasDoDesafio(desafio, aberturasAntecipadas)
  const modalidadeAtual = modalidade ?? desafio.modalidades[0]
  const def = defModalidade(modalidadeAtual)
  const classificacao = colocacoes(ranking)
  const lider = classificacao[0]?.entrada
  const minhaColocacao = classificacao.find((c) => c.entrada.user_id === userId)
  const minhaEntrada = minhaColocacao?.entrada

  const entrarOuSair = async () => {
    setOcupado(true)
    try {
      if (desafio.sou_membro) {
        await api.leaveChallenge(desafio.id)
        toast('Você saiu do desafio')
      } else {
        await api.joinChallenge(desafio.id)
        toast('Bora dançar! Você entrou no desafio.')
      }
      setConfirmandoSaida(false)
      await carregar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const excluir = async () => {
    setOcupado(true)
    try {
      await api.deleteChallenge(desafio.id)
      toast('Desafio excluído')
      navigate('/desafios', { replace: true })
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  // Um CSV por disputa: o arquivo e a coluna dizem qual
  const exportarCSV = () => {
    const base = desafio.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadCSV(
      `desafio-${base}-${modalidadeAtual}`,
      ['Posição', 'Nome', 'Turma', def.nome],
      classificacao.map(({ entrada, posicao }) => [
        String(posicao),
        entrada.nome,
        entrada.turma ?? '',
        String(entrada.pontos),
      ]),
    )
  }

  /** Fala da disputa que está aberta na tela. */
  const minhaSituacao = (() => {
    if (!desafio.sou_membro || !minhaEntrada) return null
    const pts = rotuloPontos(modalidadeAtual, minhaEntrada.pontos)
    if (lider && lider.pontos > minhaEntrada.pontos) {
      return `Você tem ${pts} · faltam ${lider.pontos - minhaEntrada.pontos} para alcançar ${lider.nome.split(' ')[0]}`
    }
    if (minhaColocacao?.empatado) return `Você tem ${pts} · empatado em ${minhaColocacao.posicao}º`
    return `Você tem ${pts} · está na frente`
  })()

  const meuNome = profile?.nome.split(' ')[0]

  return (
    <div className="anima-tela pb-6">
      <div className="px-3 pb-1 pt-1">
        <BotaoIcone icone="voltar" rotulo="Voltar" onClick={voltar} />
      </div>
      <div className="flex flex-col gap-1.5 px-5 pb-4">
        <span className={`text-sm font-extrabold ${status.cor}`}>{status.texto}</span>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.02] tracking-[-.03em]">
          {desafio.titulo}
        </h1>
        <span className="text-[15px] text-ink2">
          {periodoCurto(desafio.data_inicio, desafio.data_fim)} · {desafio.participantes}{' '}
          {desafio.participantes === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </div>

      <div className="flex flex-col gap-3.5 px-4">
        <div className="flex flex-col gap-3 rounded-[20px] border border-linha bg-sf p-4">
          <span className="text-[15px] leading-relaxed text-ink2 [text-wrap:pretty]">
            {desafio.descricao ||
              'Vale uma presença por janela com check-in dentro dos horários — várias fotos na mesma janela contam uma vez.'}
          </span>
          {desafio.janelas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {faixasDeHorario(desafio.janelas).map((h) => (
                <span key={h} className="rounded-[10px] bg-chip px-2.5 py-1.5 text-sm font-bold">
                  {h}
                </span>
              ))}
            </div>
          )}
          {desafio.local && (
            <div className="flex items-center gap-2.5 text-sm text-ink2">
              <Icone nome="local" tamanho={18} traco={2} className="shrink-0" />
              <span>
                {desafio.local.nome || 'Local do desafio'} · raio de {desafio.local.raio_m} m · sua
                localização não é guardada
              </span>
            </div>
          )}
          {suspensoes.length > 0 && (
            <ListaDeDatas
              titulo="Sem forró · não conta ponto"
              itens={agruparSuspensoes(suspensoes)}
            />
          )}
          {aberturas.length > 0 && (
            <ListaDeDatas
              titulo="Abriu mais cedo"
              itens={aberturas.map((a) => ({
                quando: diaCurto(a.data),
                texto: `Check-in liberado a partir das ${a.hora_abertura.slice(0, 5)}`,
              }))}
            />
          )}
        </div>

        {/* Logo depois das regras: lida a descrição, entrar é a decisão da
            tela. Sair fica no fim da página, longe do caminho. Entrada
            restrita: quem entra é a organização, então nem o botão de entrar
            nem o de sair fazem sentido para o aluno */}
        {desafio.entrada_restrita ? (
          <p className="rounded-2xl border border-linha bg-sf px-4 py-3 text-sm leading-snug text-ink2">
            {desafio.sou_membro
              ? 'Você está na lista deste desafio restrito. A organização é quem gerencia quem participa.'
              : 'Este desafio é restrito — só a organização adiciona participantes. Acha que deveria estar aqui? Fale com a organização.'}
          </p>
        ) : (
          fase !== 'encerrado' &&
          !desafio.sou_membro && (
            <>
              <BotaoAcao
                cor="brasa"
                tamanho="g"
                bloco
                disabled={ocupado}
                onClick={() => void entrarOuSair()}
              >
                Entrar no desafio
              </BotaoAcao>
              <span className="text-center text-[13px] leading-snug text-ink3">
                Entrar é opcional e não zera o passado: check-ins já feitos no período
                contam.
              </span>
            </>
          )
        )}

        {desafio.modalidades.length > 1 && (
          <Segmentado
            valor={modalidadeAtual}
            onChange={setModalidade}
            opcoes={desafio.modalidades.map((m) => ({
              valor: m,
              rotulo: defModalidade(m).nome,
            }))}
          />
        )}
        <span className="px-1 text-[13px] leading-snug text-ink3">
          {minhaSituacao ?? def.regra}
        </span>

        {ranking.length === 0 ? (
          <p className="rounded-2xl border border-linha bg-sf px-4 py-6 text-center text-[15px] text-ink3">
            Ninguém pontuou ainda. Seja a primeira pessoa!
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {classificacao.map(({ entrada: r, posicao, empatado }) => {
              const eu = r.user_id === userId
              return (
                <li key={r.user_id}>
                  <button
                    type="button"
                    onClick={() => navigate(eu ? '/perfil' : `/perfil/${r.user_id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-2.5 text-left"
                    style={{
                      background: eu ? 'rgba(222,83,0,.12)' : 'var(--sf)',
                      borderColor: eu ? '#DE5300' : 'var(--line)',
                    }}
                  >
                    <span
                      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                        posicao <= 3 ? 'text-preto' : 'bg-sf2 text-ink'
                      }`}
                      style={posicao <= 3 ? { background: MEDALHAS[posicao - 1] } : undefined}
                    >
                      {posicao}
                    </span>
                    <Avatar nome={r.nome} url={r.avatar_url} tamanho={32} borda={false} />
                    {/* Só o nome encurta; o "empate" fica sempre visível */}
                    <span className={`flex min-w-0 flex-1 text-base ${eu ? 'font-extrabold' : 'font-semibold'}`}>
                      <span className="truncate">{eu ? `Você · ${meuNome ?? r.nome}` : r.nome}</span>
                      {empatado && <span className="shrink-0 whitespace-pre text-ink3"> · empate</span>}
                    </span>
                    <span className="shrink-0 text-lg font-extrabold">{r.pontos}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}

        {papel === 'organizador' && desafio.entrada_restrita && (
          <section className="rounded-[20px] border border-linha bg-sf p-4">
            <ParticipantesDesafio desafio={desafio} onMudou={() => void carregar()} />
          </section>
        )}

        {papel === 'organizador' && (
          <section className="flex flex-col gap-2 pt-2">
            <RotuloSecao>Organização</RotuloSecao>
            <div className="flex gap-2">
              <BotaoSuave className="flex-1" onClick={() => setEditando(true)}>
                Editar
              </BotaoSuave>
              {ranking.length > 0 && (
                <BotaoSuave className="flex-1" onClick={exportarCSV}>
                  Resultado CSV
                </BotaoSuave>
              )}
              <BotaoSuave perigo className="flex-1" onClick={() => setConfirmandoExclusao(true)}>
                Excluir
              </BotaoSuave>
            </div>
          </section>
        )}

        {!desafio.entrada_restrita && fase !== 'encerrado' && desafio.sou_membro && (
          <div className="pt-4">
            <BotaoAcao
              cor="claro"
              tamanho="g"
              bloco
              disabled={ocupado}
              onClick={() => setConfirmandoSaida(true)}
            >
              Sair do desafio
            </BotaoAcao>
          </div>
        )}
      </div>

      <Confirmar
        aberto={confirmandoSaida}
        titulo="Sair do desafio?"
        texto="Você some do ranking. Se entrar de novo depois, seus check-ins do período voltam a contar."
        ok="Sair"
        ocupado={ocupado}
        onOk={() => void entrarOuSair()}
        onVoltar={() => setConfirmandoSaida(false)}
      />
      <Confirmar
        aberto={confirmandoExclusao}
        titulo="Excluir este desafio?"
        texto="O desafio e o ranking somem para todo mundo. Os check-ins continuam no feed."
        ok="Excluir"
        ocupado={ocupado}
        onOk={() => void excluir()}
        onVoltar={() => setConfirmandoExclusao(false)}
      />
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
