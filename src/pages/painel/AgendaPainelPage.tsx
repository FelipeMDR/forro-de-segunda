import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChallengeForm } from '../../components/ChallengeForm'
import { Icone } from '../../components/Icone'
import { Spinner } from '../../components/Spinner'
import {
  BotaoAcao,
  BotaoSuave,
  Cabecalho,
  ChipEscolha,
  Confirmar,
  Folha,
  LinhaInterruptor,
  Segmentado,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  addDays,
  challengePhase,
  formatDate,
  ocorrenciasEvento,
  toISODate,
  type OcorrenciaAgenda,
} from '../../lib/dates'
import { ordenarTurmas } from '../../lib/forrodex'
import { periodoCurto } from '../../lib/horarios'
import {
  DIAS_ABREV,
  DIAS_SEMANA,
  type AberturaAntecipadaInput,
  type AgendaEvent,
  type Challenge,
  type FeriadoInput,
  PassoTrilha,
} from '../../lib/types'
import { nomesModalidades, statusDoDesafio } from '../ChallengesPage'
import { Campo, Dica, usePainel } from './contexto'
import { useLembrado } from '../../lib/memoriaTelas'
import { passoDaAula } from '../../lib/trilha'

type Aba = 'prox' | 'eventos' | 'desafios'

function rotuloDia(d: Date): string {
  const s = d
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: '2-digit' })
    .replace('.', '')
    .replace(',', '')
  return s[0].toUpperCase() + s.slice(1)
}

/** Linha de lista com Editar/Excluir, para eventos e desafios. */
function LinhaGestao({
  rotulo,
  corRotulo,
  titulo,
  sub,
  onEditar,
  onExcluir,
}: {
  rotulo: string
  corRotulo: string
  titulo: string
  sub: string
  onEditar?: () => void
  onExcluir: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[18px] border border-linha bg-sf py-3 pl-3.5 pr-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-xs font-extrabold ${corRotulo}`}>{rotulo}</span>
        <span className="truncate text-base font-extrabold">{titulo}</span>
        <span className="truncate text-[13px] text-ink3">{sub}</span>
      </div>
      {onEditar && (
        <button
          type="button"
          onClick={onEditar}
          className="h-10 shrink-0 rounded-xl bg-chip px-3 text-sm font-extrabold text-ink"
        >
          Editar
        </button>
      )}
      <button
        type="button"
        onClick={onExcluir}
        aria-label={`Excluir ${titulo}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink3"
      >
        <Icone nome="lixo" tamanho={20} />
      </button>
    </div>
  )
}

export function AgendaPainelPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba | null) ?? 'prox'
  const { turmas, feriados, aberturas, desafios, recarregar } = usePainel()
  const [eventos, setEventos] = useLembrado<AgendaEvent[] | null>('agenda:eventos', null)
  /** Cancelar uma aula (ou um dia inteiro, sem ocorrência). */
  const [cancelando, setCancelando] = useState<{ data: string; turma: string | null; titulo: string } | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [excluir, setExcluir] = useState<{ tipo: 'evento' | 'desafio' | 'abertura' | 'feriado'; id: string; titulo: string } | null>(null)
  const [editando, setEditando] = useState<Challenge | 'novo' | null>(null)

  // Trilha de vídeos: o passo de cada aula (sem a migração 036, nada aparece)
  const [passos, setPassos] = useState<PassoTrilha[]>([])
  useEffect(() => {
    void api.listPassosTrilha().then(setPassos).catch(() => setPassos([]))
  }, [api])

  const carregarEventos = useCallback(async () => {
    setEventos(await api.listEvents())
  }, [api])
  useEffect(() => {
    void carregarEventos().catch((e) => toast((e as Error).message, 'erro'))
  }, [carregarEventos, toast])

  // Próximas duas semanas, de todos os eventos e todas as turmas
  const proximas = useMemo<OcorrenciaAgenda[]>(() => {
    if (!eventos) return []
    const agora = new Date()
    const limite = addDays(agora, 14)
    return eventos
      .flatMap((e) => ocorrenciasEvento(e, feriados, agora, 3))
      .filter((o) => o.quando <= limite)
      .sort((a, b) => a.quando.getTime() - b.quando.getTime())
  }, [eventos, feriados])

  const feriadoDe = (o: OcorrenciaAgenda) =>
    feriados.find(
      (f) =>
        f.cancela_aulas && f.data === toISODate(o.quando) && (f.turma === null || f.turma === o.evento.turma),
    )

  const desfazerCancelamento = async (o: OcorrenciaAgenda) => {
    const f = feriadoDe(o)
    if (!f) return
    try {
      await api.deleteFeriado(f.id)
      // A reposição da aula (se houve) sai junto com o cancelamento
      await Promise.all([recarregar.feriados(), carregarEventos()])
      toast(`${f.turma ? `Aula de ${f.turma}` : 'O dia'} volta a valer`)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    try {
      if (excluir.tipo === 'evento') {
        await api.deleteEvent(excluir.id)
        await carregarEventos()
      } else if (excluir.tipo === 'desafio') {
        await api.deleteChallenge(excluir.id)
        await recarregar.desafios()
      } else if (excluir.tipo === 'feriado') {
        await api.deleteFeriado(excluir.id)
        await Promise.all([recarregar.feriados(), carregarEventos()])
      } else {
        await api.deleteAbertura(excluir.id)
        await recarregar.aberturas()
      }
      toast(`${excluir.titulo} excluído`)
      setExcluir(null)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const hoje = toISODate(new Date())
  const proximasAberturas = aberturas.filter((a) => a.data >= hoje)
  const proximosFeriados = [...feriados]
    .filter((f) => f.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data))

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Agenda" sobretitulo="Painel" fallback="/organizador" />
      <Segmentado
        className="mx-4 mb-1 mt-3"
        valor={aba}
        onChange={(v) => setParams({ aba: v }, { replace: true })}
        opcoes={[
          { valor: 'prox', rotulo: 'Próximas' },
          { valor: 'eventos', rotulo: 'Eventos' },
          { valor: 'desafios', rotulo: 'Desafios' },
        ]}
      />
      <div className="flex flex-col gap-2.5 px-4 pt-2.5">
        {aba === 'prox' &&
          (eventos === null ? (
            <Spinner />
          ) : (
            <>
              {proximas.length === 0 && (
                <Dica>Nada marcado para as próximas duas semanas.</Dica>
              )}
              {proximas.map((o, i) => (
                <div
                  key={`${o.evento.id}-${i}`}
                  className="flex items-center gap-3 rounded-[18px] border-[1.5px] bg-sf p-3.5"
                  style={{ borderColor: o.cancelada ? 'var(--or-t)' : 'var(--line)' }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-extrabold text-or-t">
                      {rotuloDia(o.quando)}
                      {o.evento.hora && ` · ${o.evento.hora}`}
                    </span>
                    <span className={`truncate text-base font-extrabold ${o.cancelada ? 'line-through' : ''}`}>
                      {o.evento.titulo}
                    </span>
                    <span className="truncate text-[13px] text-ink3">
                      {o.cancelada
                        ? `Cancelada${o.motivoCancelamento ? ` · ${o.motivoCancelamento}` : ''}`
                        : (o.evento.turma ?? 'Todas as turmas')}
                    </span>
                    {!o.cancelada && eventos && (() => {
                      const passo = passoDaAula(o.evento, toISODate(o.quando), { turmas, passos, eventos, feriados })
                      return passo ? (
                        <span className="truncate text-[13px] font-bold text-ink2">Passo: {passo.nome}</span>
                      ) : null
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      o.cancelada
                        ? void desfazerCancelamento(o)
                        : setCancelando({
                            data: toISODate(o.quando),
                            turma: o.evento.turma,
                            titulo: `${o.evento.titulo} em ${formatDate(toISODate(o.quando))}`,
                          })
                    }
                    className="h-11 shrink-0 rounded-[14px] border-[1.5px] border-linha bg-chip px-3.5 text-sm font-extrabold text-ink"
                  >
                    {o.cancelada ? 'Desfazer' : 'Cancelar'}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCancelando({ data: '', turma: null, titulo: 'Feriado ou dia sem forró' })}
                className="h-[52px] rounded-2xl border-[1.5px] border-dashed border-linha text-[15px] font-extrabold text-ink"
              >
                + Feriado ou dia sem forró
              </button>

              {proximosFeriados.length > 0 && (
                <>
                  <span className="px-1 pt-3 text-[15px] font-extrabold">Cancelamentos marcados</span>
                  {proximosFeriados.map((f) => (
                    <LinhaGestao
                      key={f.id}
                      rotulo={
                        !f.cancela_aulas
                          ? 'Sem Espaço Livre · aulas mantidas'
                          : f.suspende_desafios
                            ? 'Sem forró · desafios fechados'
                            : 'Aula cancelada'
                      }
                      corRotulo="text-or-t"
                      titulo={`${formatDate(f.data)} · ${!f.cancela_aulas ? 'desafios fechados' : (f.turma ?? 'todas as turmas')}`}
                      sub={f.motivo || 'Sem motivo informado'}
                      onExcluir={() => setExcluir({ tipo: 'feriado', id: f.id, titulo: 'Cancelamento' })}
                    />
                  ))}
                </>
              )}

              <div className="flex items-baseline justify-between px-1 pt-3">
                <span className="text-[15px] font-extrabold">Abriu mais cedo</span>
                <button type="button" className="text-sm font-extrabold text-bl-t" onClick={() => setAbrindo(true)}>
                  + Registrar
                </button>
              </div>
              <Dica>
                Quando uma aula é cancelada e o espaço abre mais cedo: adianta a janela dos
                desafios naquele dia, e quem já fez check-in passa a contar.
              </Dica>
              {proximasAberturas.map((a) => (
                <LinhaGestao
                  key={a.id}
                  rotulo="Abertura antecipada"
                  corRotulo="text-bl-t"
                  titulo={`${formatDate(a.data)} às ${a.hora_abertura}`}
                  sub={a.motivo || 'Sem motivo informado'}
                  onExcluir={() => setExcluir({ tipo: 'abertura', id: a.id, titulo: 'Abertura' })}
                />
              ))}
            </>
          ))}

        {aba === 'eventos' &&
          (eventos === null ? (
            <Spinner />
          ) : (
            <>
              {eventos.length === 0 && <Dica>Nenhum evento na agenda ainda.</Dica>}
              {eventos.map((e) => (
                <LinhaGestao
                  key={e.id}
                  rotulo={e.data ? 'Evento' : 'Toda semana'}
                  corRotulo={e.data ? 'text-or-t' : 'text-bl-t'}
                  titulo={e.titulo}
                  sub={[
                    e.data ? formatDate(e.data) : DIAS_SEMANA[e.dia_semana ?? 0],
                    e.hora,
                    e.turma ?? 'todas as turmas',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onExcluir={() => setExcluir({ tipo: 'evento', id: e.id, titulo: e.titulo })}
                />
              ))}
              <BotaoAcao tamanho="g" bloco onClick={() => navigate('/organizador/agenda/evento')}>
                + Novo evento
              </BotaoAcao>
            </>
          ))}

        {aba === 'desafios' && (
          <>
            {desafios.length === 0 && <Dica>Nenhum desafio ainda.</Dica>}
            {[...desafios]
              .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))
              .map((d) => {
                const st = statusDoDesafio(d)
                return (
                  <LinhaGestao
                    key={d.id}
                    rotulo={challengePhase(d) === 'encerrado' ? 'Encerrado' : st.texto}
                    corRotulo={st.cor}
                    titulo={d.titulo}
                    sub={`${periodoCurto(d.data_inicio, d.data_fim)} · ${nomesModalidades(d)}`}
                    onEditar={() => setEditando(d)}
                    onExcluir={() => setExcluir({ tipo: 'desafio', id: d.id, titulo: d.titulo })}
                  />
                )
              })}
            <BotaoAcao tamanho="g" bloco onClick={() => setEditando('novo')}>
              + Novo desafio
            </BotaoAcao>
          </>
        )}
      </div>

      <FolhaCancelar
        alvo={cancelando}
        onFechar={() => setCancelando(null)}
        onSalvou={carregarEventos}
        turmas={turmas.map((t) => t.nome)}
      />
      <FolhaAbertura aberta={abrindo} onFechar={() => setAbrindo(false)} />
      <Confirmar
        aberto={excluir !== null}
        titulo={`Excluir ${excluir?.titulo ?? ''}?`}
        texto={
          excluir?.tipo === 'desafio'
            ? 'O desafio e o ranking somem para todo mundo. Os check-ins continuam no feed.'
            : excluir?.tipo === 'evento'
              ? 'Ele sai da agenda de todo mundo.'
              : excluir?.tipo === 'feriado'
                ? 'A aula volta a valer nesse dia.'
                : 'A janela volta ao horário normal nesse dia.'
        }
        ok="Excluir"
        onOk={() => void confirmarExclusao()}
        onVoltar={() => setExcluir(null)}
      />
      {editando && (
        <ChallengeForm
          desafio={editando === 'novo' ? undefined : editando}
          onClose={() => setEditando(null)}
          onSaved={() => void recarregar.desafios()}
        />
      )}
    </div>
  )
}

/**
 * Cancelar a aula de um dia (ou o dia inteiro). Vira um feriado: a aula
 * aparece "Cancelada" para os alunos, com o motivo e quando volta.
 */
function FolhaCancelar({
  alvo,
  turmas,
  onFechar,
  onSalvou,
}: {
  alvo: { data: string; turma: string | null; titulo: string } | null
  turmas: string[]
  onFechar: () => void
  /** Recarrega os eventos: a reposição é um evento novo na agenda. */
  onSalvou: () => Promise<void>
}) {
  const { api } = useAuth()
  const toast = useToast()
  const { recarregar } = usePainel()
  const [form, setForm] = useState<FeriadoInput>({
    data: '',
    motivo: '',
    turma: null,
    suspende_desafios: true,
    cancela_aulas: true,
  })
  const [salvando, setSalvando] = useState(false)
  const [repor, setRepor] = useState<'nao' | 'sim'>('nao')
  const [reposicao, setReposicao] = useState({ data: '', hora: '' })
  // Só dá para repor uma aula de verdade: o cancelamento aberto a partir
  // da aula de uma turma (com data). No "Feriado ou dia sem forró" a data
  // é livre e pode nem ser dia de aula da turma escolhida.
  const podeRepor = form.turma !== null && Boolean(alvo?.data)

  useEffect(() => {
    if (!alvo) return
    // Cancelar só uma turma normalmente não fecha o espaço: as outras
    // continuam dançando ali. Cancelar todas, sim.
    setForm({ data: alvo.data, motivo: '', turma: alvo.turma, suspende_desafios: alvo.turma === null, cancela_aulas: true })
    setRepor('nao')
    setReposicao({ data: '', hora: '' })
  }, [alvo])

  const salvar = async () => {
    if (!form.data) {
      toast('Escolha a data', 'erro')
      return
    }
    const comReposicao = podeRepor && repor === 'sim'
    if (comReposicao && !reposicao.data) {
      toast('Escolha o dia da reposição', 'erro')
      return
    }
    if (comReposicao && reposicao.data <= form.data) {
      toast('A reposição precisa ser depois da aula cancelada', 'erro')
      return
    }
    setSalvando(true)
    try {
      await api.saveFeriado({ ...form, reposicao: comReposicao ? reposicao : null })
      await Promise.all([recarregar.feriados(), onSalvou()])
      toast(
        !form.cancela_aulas
          ? 'Marcado. As aulas seguem, e os desafios não contam ponto nesse dia.'
          : form.suspende_desafios
            ? 'Cancelado. Os alunos já veem na agenda, e os desafios não contam ponto nesse dia.'
            : 'Cancelado. Os alunos já veem na agenda.',
      )
      onFechar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={alvo !== null} onFechar={onFechar} titulo={alvo?.titulo}>
      <div className="flex flex-col gap-3 px-5 pb-8">
        {!alvo?.data && (
          <Campo rotulo="Data">
            <input type="date" className="input" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </Campo>
        )}
        {/* As aulas acontecem, mas o salão não fica livre depois
            (treinamento, evento no espaço). Só no cadastro livre:
            cancelar uma aula da agenda é sempre cancelar aula. */}
        {!alvo?.data && (
          <Campo rotulo="O que não vai acontecer?">
            <Segmentado
              opcoes={[
                { valor: 'aulas', rotulo: 'Aulas' },
                { valor: 'espaco', rotulo: 'Só o Espaço Livre' },
              ]}
              valor={form.cancela_aulas ? 'aulas' : 'espaco'}
              onChange={(v) =>
                setForm({ ...form, turma: null, suspende_desafios: true, cancela_aulas: v === 'aulas' })
              }
            />
          </Campo>
        )}
        {form.cancela_aulas && (
          <Campo rotulo="Cancela para">
            <div className="flex flex-wrap gap-2">
              <ChipEscolha
                ativo={form.turma === null}
                onClick={() => setForm({ ...form, turma: null, suspende_desafios: true })}
              >
                Todas as turmas
              </ChipEscolha>
              {(alvo?.turma ? [alvo.turma] : ordenarTurmas(turmas)).map((t) => (
                <ChipEscolha
                  key={t}
                  ativo={form.turma === t}
                  onClick={() => setForm({ ...form, turma: t, suspende_desafios: false })}
                >
                  Só {t}
                </ChipEscolha>
              ))}
            </div>
          </Campo>
        )}
        <Campo rotulo="Motivo" dica="Opcional, mas ajuda o aluno a entender.">
          <input
            className="input"
            placeholder="Ex.: semana de provas"
            value={form.motivo ?? ''}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          />
        </Campo>
        {podeRepor && (
          <Campo rotulo="A aula vai ser reposta?">
            <Segmentado
              opcoes={[
                { valor: 'nao', rotulo: 'Sem reposição' },
                { valor: 'sim', rotulo: 'Repor em outro dia' },
              ]}
              valor={repor}
              onChange={setRepor}
            />
          </Campo>
        )}
        {podeRepor && repor === 'sim' && (
          <div className="grid grid-cols-2 gap-2.5">
            <Campo rotulo="Dia da reposição">
              <input
                type="date"
                className="input"
                value={reposicao.data}
                onChange={(e) => setReposicao({ ...reposicao, data: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Horário">
              <input
                type="time"
                className="input"
                value={reposicao.hora}
                onChange={(e) => setReposicao({ ...reposicao, hora: e.target.value })}
              />
            </Campo>
          </div>
        )}
        <div className="rounded-2xl bg-sf2 px-4 py-3 text-sm leading-snug text-ink2">
          <b className="text-ink">Trilha de vídeos: </b>
          {!form.cancela_aulas
            ? 'as aulas acontecem normalmente, e nada muda.'
            : form.turma === null
              ? 'todas as turmas com aula nesse dia andam uma semana.'
              : podeRepor && repor === 'sim'
                ? 'o passo desta aula vai para o dia da reposição, e nada mais muda. A reposição aparece na agenda da turma.'
                : 'os passos seguintes desta turma andam uma semana.'}
        </div>
        {form.cancela_aulas && (
          <LinhaInterruptor
            titulo="Não vai ter forró nesse dia"
            descricao="Fecha a janela dos desafios: quem aparecer não marca presença"
            ligado={form.suspende_desafios}
            onChange={(v) => setForm({ ...form, suspende_desafios: v })}
          />
        )}
        <div className="mt-1 flex gap-2.5">
          <BotaoSuave tamanho="g" className="flex-1" onClick={onFechar}>
            Voltar
          </BotaoSuave>
          <BotaoAcao tamanho="g" sombra={false} className="flex-[1.3]" disabled={salvando} onClick={() => void salvar()}>
            {salvando
              ? 'Salvando…'
              : !form.cancela_aulas
                ? 'Fechar os desafios'
                : podeRepor && repor === 'sim'
                  ? 'Cancelar e marcar reposição'
                  : 'Cancelar e avisar'}
          </BotaoAcao>
        </div>
      </div>
    </Folha>
  )
}

/** O espaço abriu mais cedo hoje (ou noutro dia): pensado para o celular, na hora. */
function FolhaAbertura({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { api } = useAuth()
  const toast = useToast()
  const { recarregar } = usePainel()
  const [form, setForm] = useState<AberturaAntecipadaInput>({ data: toISODate(new Date()), hora_abertura: '', motivo: '' })
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    setSalvando(true)
    try {
      await api.saveAbertura(form)
      await recarregar.aberturas()
      toast(`Abertura registrada! Check-ins desde as ${form.hora_abertura} já contam.`)
      setForm({ data: toISODate(new Date()), hora_abertura: '', motivo: '' })
      onFechar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="O espaço abriu mais cedo">
      <div className="flex flex-col gap-3 px-5 pb-8">
        <div className="flex gap-2">
          <Campo rotulo="Data">
            <input type="date" className="input" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </Campo>
          <Campo rotulo="A partir de">
            <input
              type="time"
              className="input"
              value={form.hora_abertura}
              onChange={(e) => setForm({ ...form, hora_abertura: e.target.value })}
            />
          </Campo>
        </div>
        <Campo rotulo="Motivo (opcional)">
          <input
            className="input"
            placeholder="Ex.: aula do Intermediário foi cancelada"
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          />
        </Campo>
        <BotaoAcao tamanho="g" bloco disabled={salvando || !form.hora_abertura} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Registrar abertura'}
        </BotaoAcao>
      </div>
    </Folha>
  )
}

/**
 * Novo evento da agenda: aula semanal de uma turma (um ou mais dias) ou
 * evento de data única, como uma festa.
 */
export function NovoEventoPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { turmas } = usePainel()
  const [tipo, setTipo] = useState<'semanal' | 'data'>('semanal')
  const [titulo, setTitulo] = useState('')
  const [local, setLocal] = useState('')
  const [turma, setTurma] = useState<string | null>(null)
  const [dias, setDias] = useState<Set<number>>(new Set([1]))
  const [data, setData] = useState('')
  const [hora, setHora] = useState('19:30')
  const [salvando, setSalvando] = useState(false)

  const pronto =
    titulo.trim().length > 1 && !!hora && (tipo === 'data' ? !!data : dias.size > 0)

  const salvar = async () => {
    setSalvando(true)
    try {
      const base = { titulo: titulo.trim(), descricao: local.trim(), turma, hora }
      if (tipo === 'data') {
        await api.saveEvent({ ...base, dia_semana: null, data })
      } else {
        // A agenda guarda um dia da semana por evento: vários dias viram
        // vários eventos, cada um com sua própria recorrência.
        for (const d of [...dias].sort()) {
          await api.saveEvent({ ...base, dia_semana: d, data: null })
        }
      }
      toast('Evento adicionado à agenda!')
      navigate('/organizador/agenda?aba=eventos', { replace: true })
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const ordemSemana = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="anima-tela">
      <Cabecalho titulo="Novo evento" sobretitulo="Agenda" fallback="/organizador/agenda?aba=eventos" />
      <div className="flex flex-col gap-4 px-4 pt-3.5">
        <Segmentado
          valor={tipo}
          onChange={setTipo}
          opcoes={[
            { valor: 'semanal', rotulo: 'Toda semana' },
            { valor: 'data', rotulo: 'Data única' },
          ]}
        />
        <Campo rotulo="Título">
          <input
            className="input"
            placeholder={tipo === 'semanal' ? 'Ex.: Aula · Intermediário' : 'Ex.: Festa de Primavera'}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Para quem">
          <div className="flex flex-wrap gap-2">
            <ChipEscolha ativo={turma === null} onClick={() => setTurma(null)}>
              Todas as turmas
            </ChipEscolha>
            {ordenarTurmas(turmas.map((t) => t.nome)).map((t) => (
              <ChipEscolha key={t} ativo={turma === t} onClick={() => setTurma(t)}>
                {t}
              </ChipEscolha>
            ))}
          </div>
        </Campo>
        {tipo === 'semanal' ? (
          <Campo rotulo="Dias da semana">
            <div className="flex flex-wrap gap-2">
              {ordemSemana.map((d) => (
                <ChipEscolha
                  key={d}
                  ativo={dias.has(d)}
                  onClick={() => {
                    const n = new Set(dias)
                    if (n.has(d)) n.delete(d)
                    else n.add(d)
                    setDias(n)
                  }}
                >
                  {DIAS_ABREV[d]}
                </ChipEscolha>
              ))}
            </div>
          </Campo>
        ) : (
          <Campo rotulo="Data">
            <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        )}
        <Campo rotulo="Horário">
          <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
        <Campo rotulo="Local (opcional)" dica="Aparece embaixo do título na agenda dos alunos.">
          <input
            className="input"
            placeholder="Espaço Livre · salão"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
          />
        </Campo>
        <div className="h-1" />
        <BotaoAcao tamanho="g" bloco disabled={!pronto || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar evento'}
        </BotaoAcao>
      </div>
    </div>
  )
}
