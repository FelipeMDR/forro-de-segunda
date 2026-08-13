import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Navigate } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { combinaBusca } from '../lib/busca'
import { downloadCSV } from '../lib/csv'
import { parseAlunosCSV, type ResultadoParse } from '../lib/csvImport'
import {
  agruparChamada,
  filtrarPorTurma,
  semConta,
  SEM_TURMA,
  type PessoaNaChamada,
} from '../lib/chamada'
import { planejarMatricula, turmasDaLinha } from '../lib/matricula'
import { ateAPosicao } from '../lib/ranking'
import {
  diasSuspensos,
  formatDate,
  formatRelative,
  janelaDoCheckin,
  ocorrenciasEvento,
  toISODate,
} from '../lib/dates'
import {
  DIAS_SEMANA,
  PAPEIS_DANCA,
  emojiCargo,
  type AgendaEvent,
  type AgendaEventInput,
  type AlunoCadastrado,
  type AttendanceRow,
  type Cargo,
  type Challenge,
  type DistintivoDef,
  type DistintivoDefInput,
  type DistintivoRecebedor,
  type Feriado,
  type FeriadoInput,
  type PapelDanca,
  type Profile,
  type Report,
  type Turma,
} from '../lib/types'

/**
 * O painel virou muitas seções (cargos, turmas, agenda, feriados,
 * frequência, denúncias) — abas evitam ter que rolar a página inteira
 * pra achar uma função específica.
 */
const ABAS_PAINEL = [
  { id: 'pessoas', emoji: '👥', label: 'Pessoas' },
  { id: 'agenda', emoji: '📅', label: 'Agenda' },
  { id: 'distintivos', emoji: '🎖️', label: 'Distintivos' },
  { id: 'frequencia', emoji: '📋', label: 'Frequência' },
  { id: 'denuncias', emoji: '🚩', label: 'Denúncias' },
] as const

type AbaPainel = (typeof ABAS_PAINEL)[number]['id']

function mesAtual(): string {
  return toISODate(new Date()).slice(0, 7)
}

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number)
  const fim = new Date(ano, m, 0)
  return { inicio: `${mes}-01`, fim: toISODate(fim) }
}

const EVENTO_VAZIO: AgendaEventInput & { recorrencia: 'semanal' | 'data' } = {
  titulo: '',
  descricao: '',
  turma: null,
  dia_semana: 1,
  data: null,
  hora: '19:00',
  recorrencia: 'semanal',
}

function SecaoAgenda({
  turmas,
  feriados,
}: {
  turmas: Turma[]
  feriados: Feriado[]
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [eventos, setEventos] = useState<AgendaEvent[] | null>(null)
  const [form, setForm] = useState({ ...EVENTO_VAZIO })
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setEventos(await api.listEvents())
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.saveEvent({
        titulo: form.titulo,
        descricao: form.descricao,
        turma: form.turma,
        dia_semana: form.recorrencia === 'semanal' ? form.dia_semana : null,
        data: form.recorrencia === 'data' ? form.data : null,
        hora: form.hora,
      })
      toast('Evento adicionado à agenda! 📅')
      setForm({ ...EVENTO_VAZIO })
      setAberto(false)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (id: string) => {
    try {
      await api.deleteEvent(id)
      await carregar()
      toast('Evento removido')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          📅 Agenda
        </h2>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Fechar' : '+ Novo evento'}
        </button>
      </div>
      <p className="text-xs text-tinta-500">
        Aulas semanais por turma e eventos como o Forró na Rep. Cada aluno vê
        na tela inicial só o que é da turma dele (ou de todos).
      </p>

      {aberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl bg-fundo p-4">
          <div>
            <label className="label" htmlFor="ev-titulo">
              Título
            </label>
            <input
              id="ev-titulo"
              className="input"
              placeholder="Ex.: Forró na Rep / Aula — Avançado"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-desc">
              Descrição (opcional)
            </label>
            <input
              id="ev-desc"
              className="input"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-turma">
                Para quem
              </label>
              <select
                id="ev-turma"
                className="input"
                value={form.turma ?? ''}
                onChange={(e) =>
                  setForm({ ...form, turma: e.target.value || null })
                }
              >
                <option value="">Todas as turmas</option>
                {turmas.map((t) => (
                  <option key={t.id} value={t.nome}>
                    Turma {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ev-hora">
                Hora
              </label>
              <input
                id="ev-hora"
                type="time"
                className="input"
                value={form.hora ?? ''}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-rec">
                Repetição
              </label>
              <select
                id="ev-rec"
                className="input"
                value={form.recorrencia}
                onChange={(e) =>
                  setForm({
                    ...form,
                    recorrencia: e.target.value as 'semanal' | 'data',
                  })
                }
              >
                <option value="semanal">Toda semana</option>
                <option value="data">Data única</option>
              </select>
            </div>
            {form.recorrencia === 'semanal' ? (
              <div>
                <label className="label" htmlFor="ev-dia">
                  Dia da semana
                </label>
                <select
                  id="ev-dia"
                  className="input"
                  value={form.dia_semana ?? 1}
                  onChange={(e) =>
                    setForm({ ...form, dia_semana: Number(e.target.value) })
                  }
                >
                  {DIAS_SEMANA.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="ev-data">
                  Data
                </label>
                <input
                  id="ev-data"
                  type="date"
                  className="input"
                  value={form.data ?? ''}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  required
                />
              </div>
            )}
          </div>
          <button className="btn-primary w-full" disabled={salvando}>
            Adicionar à agenda
          </button>
        </form>
      )}

      {eventos === null ? (
        <Spinner />
      ) : eventos.length === 0 ? (
        <p className="text-sm text-tinta-500">Nenhum evento na agenda ainda.</p>
      ) : (
        <div className="divide-y divide-preto/10">
          {eventos.map((e) => {
            const proxima = ocorrenciasEvento(e, feriados, new Date(), 1)[0]
            return (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="text-lg">
                  {proxima?.cancelada ? '🚫' : e.data ? '🎉' : '🎓'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.titulo}</p>
                  <p className="text-xs text-tinta-500">
                    {e.data
                      ? formatDate(e.data)
                      : `Toda ${DIAS_SEMANA[e.dia_semana ?? 0].toLowerCase()}`}
                    {e.hora && ` · ${e.hora}`} ·{' '}
                    {e.turma ? `turma ${e.turma}` : 'todas as turmas'}
                  </p>
                  {proxima?.cancelada && (
                    <p className="text-xs font-bold text-red-600">
                      🚫 Próxima ocorrência cancelada
                      {proxima.motivoCancelamento
                        ? ` — ${proxima.motivoCancelamento}`
                        : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void excluir(e.id)}
                  className="p-1.5 text-tinta-400 hover:text-red-600"
                  aria-label={`Remover ${e.titulo}`}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const FERIADO_VAZIO: FeriadoInput = {
  data: '',
  motivo: '',
  turma: null,
  // Cancelar a aula de todo mundo quase sempre quer dizer que não vai
  // ter forró — então já vem marcado, e desmarcar é a exceção.
  suspende_desafios: true,
}

/**
 * Feriados/cancelamentos: suspendem a(s) aula(s) recorrente(s) numa
 * data específica sem precisar apagar e recriar o evento da agenda.
 */
function SecaoFeriados({
  feriados,
  turmas,
  onChanged,
}: {
  feriados: Feriado[]
  turmas: Turma[]
  onChanged: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<FeriadoInput>({ ...FERIADO_VAZIO })
  const [salvando, setSalvando] = useState(false)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.saveFeriado(form)
      toast(
        form.suspende_desafios
          ? 'Cancelamento adicionado! Os desafios não contam ponto nesse dia. 🚫'
          : 'Cancelamento adicionado! Os alunos já veem na agenda. 🚫',
      )
      setForm({ ...FERIADO_VAZIO })
      setAberto(false)
      onChanged()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (id: string) => {
    try {
      await api.deleteFeriado(id)
      onChanged()
      toast('Cancelamento removido — a aula volta a valer')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const hoje = toISODate(new Date())

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          🚫 Feriados e cancelamentos
        </h2>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Fechar' : '+ Novo'}
        </button>
      </div>
      <p className="text-xs text-tinta-500">
        Cancela a aula recorrente daquele dia sem precisar apagar o evento da
        agenda. Os alunos veem "Cancelada" no lugar da aula normal, com o
        motivo e quando ela volta — e, se o dia for marcado como sem forró,
        os desafios também não contam ponto nele.
      </p>

      {aberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl bg-fundo p-4">
          <div>
            <label className="label" htmlFor="fer-data">
              Data
            </label>
            <input
              id="fer-data"
              type="date"
              className="input"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="fer-motivo">
              Motivo (opcional, mas ajuda o aluno a entender)
            </label>
            <input
              id="fer-motivo"
              className="input"
              placeholder='Ex.: "Feriado nacional" ou "Professor(a) viajando"'
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="fer-turma">
              Cancela para
            </label>
            <select
              id="fer-turma"
              className="input"
              value={form.turma ?? ''}
              onChange={(e) => {
                const turma = e.target.value || null
                // Cancelar só uma turma normalmente não fecha o espaço:
                // as outras continuam dançando ali. Cancelar todas,
                // sim. O organizador ainda pode mudar no campo abaixo.
                setForm({ ...form, turma, suspende_desafios: turma === null })
              }}
            >
              <option value="">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.nome}>
                  Só a turma {t.nome}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-2.5 rounded-xl bg-papel p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-brasa-600"
              checked={form.suspende_desafios}
              onChange={(e) =>
                setForm({ ...form, suspende_desafios: e.target.checked })
              }
            />
            <span className="text-xs text-tinta-600">
              <strong className="text-tinta-700">
                Não vai ter forró nesse dia
              </strong>{' '}
              — fecha também a janela dos desafios: quem aparecer no local
              não marca presença nem ponto. Desmarque se o espaço continua
              aberto (ex.: feriado sem aula, mas com festa à noite).
            </span>
          </label>
          <button className="btn-primary w-full" disabled={salvando}>
            Cancelar aula(s) nessa data
          </button>
        </form>
      )}

      {feriados.length === 0 ? (
        <p className="text-sm text-tinta-500">
          Nenhum feriado ou cancelamento cadastrado.
        </p>
      ) : (
        <div className="divide-y divide-preto/10">
          {feriados.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5">
              <span className="text-lg">🚫</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {formatDate(f.data)}
                  {f.data < hoje && (
                    <span className="ml-1.5 text-[10px] font-normal text-tinta-400">
                      (passado)
                    </span>
                  )}
                </p>
                <p className="text-xs text-tinta-500">
                  {f.motivo || 'Sem motivo informado'} ·{' '}
                  {f.turma ? `só turma ${f.turma}` : 'todas as turmas'} ·{' '}
                  {f.suspende_desafios
                    ? 'desafios fechados'
                    : 'desafios valendo'}
                </p>
              </div>
              <button
                onClick={() => void excluir(f.id)}
                className="p-1.5 text-tinta-400 hover:text-red-600"
                aria-label={`Remover cancelamento de ${formatDate(f.data)}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** CRUD dos cargos do projeto (Presidência, Professor(a)…). */
function SecaoCargos({
  cargos,
  onChanged,
}: {
  cargos: Cargo[]
  onChanged: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [novo, setNovo] = useState('')

  const adicionar = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.saveCargo(novo)
      setNovo('')
      onChanged()
      toast('Cargo criado! 🎖️')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const remover = async (id: string) => {
    try {
      await api.deleteCargo(id)
      onChanged()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
        🎖️ Cargos do projeto
      </h2>
      <p className="text-xs text-tinta-500">
        Aparecem em destaque no perfil de quem ocupa. Ao trocar a gestão,
        basta remover o cargo de uma pessoa e dar para outra.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cargos.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-brasa-500/15 px-3 py-1.5 text-xs font-bold text-brasa-700"
          >
            {emojiCargo(c.nome)} {c.nome}
            <button
              onClick={() => void remover(c.id)}
              className="text-brasa-700/60 hover:text-red-600"
              aria-label={`Remover cargo ${c.nome}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={adicionar} className="flex gap-2">
        <input
          className="input"
          placeholder='Novo cargo (ex.: "Diretor(a) de Eventos")'
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          required
        />
        <button className="btn-ghost shrink-0">+ Criar</button>
      </form>
    </section>
  )
}

const DISTINTIVO_VAZIO: DistintivoDefInput = {
  emoji: '🎖️',
  titulo: '',
  descricao: '',
}


/**
 * Distintivos personalizados: a organização cria (emoji + título +
 * descrição) e entrega manualmente a quem quiser — por qualquer
 * motivo, não só vencer um desafio. Toque num distintivo do catálogo
 * pra abrir o painel de entrega dele.
 */
function SecaoDistintivos({
  desafios,
  turmas,
}: {
  desafios: Challenge[]
  turmas: Turma[]
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [distintivos, setDistintivos] = useState<DistintivoDef[] | null>(null)
  const [perfis, setPerfis] = useState<Profile[]>([])
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<DistintivoDefInput>({ ...DISTINTIVO_VAZIO })
  const [salvando, setSalvando] = useState(false)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    setDistintivos(await api.listDistintivos())
  }, [api])

  useEffect(() => {
    void carregar()
    void api.listProfiles().then(setPerfis)
  }, [api, carregar])

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.saveDistintivo(form)
      setForm({ ...DISTINTIVO_VAZIO })
      setAberto(false)
      await carregar()
      toast('Distintivo criado! 🎖️')
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const remover = async (id: string) => {
    try {
      await api.deleteDistintivo(id)
      if (selecionadoId === id) setSelecionadoId(null)
      await carregar()
      toast('Distintivo removido')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const selecionado = distintivos?.find((d) => d.id === selecionadoId) ?? null
  const filtrados = (distintivos ?? []).filter((d) =>
    combinaBusca(busca, [d.titulo, d.descricao]),
  )

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
        🎖️ Distintivos personalizados{' '}
        {distintivos && distintivos.length > 0 && (
          <span className="font-normal text-tinta-400">
            ({distintivos.length})
          </span>
        )}
      </h2>
      <p className="text-xs text-tinta-500">
        Crie reconhecimentos e entregue pra quem você quiser, por qualquer
        motivo — não só vencer um desafio. Toque num distintivo pra ver quem
        já recebeu ou entregar pra mais gente.
      </p>

      {/* Com a lista crescendo a cada semestre, busca + contagem evitam
          ter que caçar o distintivo certo no meio de dezenas */}
      {distintivos && distintivos.length > 5 && (
        <input
          type="search"
          className="input"
          placeholder="🔎 Buscar distintivo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}

      {distintivos === null ? (
        <Spinner />
      ) : distintivos.length === 0 ? (
        <p className="text-sm text-tinta-500">Nenhum distintivo criado ainda.</p>
      ) : filtrados.length === 0 ? (
        <p className="py-3 text-center text-sm text-tinta-500">
          Nenhum distintivo encontrado com "{busca}".
        </p>
      ) : (
        <div className="max-h-80 divide-y divide-preto/10 overflow-y-auto rounded-xl bg-fundo">
          {filtrados.map((d) => {
            const ativo = selecionadoId === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelecionadoId(ativo ? null : d.id)}
                aria-pressed={ativo}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  ativo ? 'bg-brasa-500/15' : 'hover:bg-preto/5'
                }`}
              >
                <span className="shrink-0 text-xl">{d.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{d.titulo}</p>
                  {d.descricao && (
                    <p className="truncate text-[11px] text-tinta-500">
                      {d.descricao}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    d.concedidos > 0
                      ? 'bg-brasa-500/20 text-brasa-700'
                      : 'bg-preto/5 text-tinta-500'
                  }`}
                >
                  {d.concedidos > 0 ? `${d.concedidos} 👤` : 'ninguém'}
                </span>
                <span className="shrink-0 text-tinta-400">
                  {ativo ? '▾' : '›'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => setAberto((v) => !v)}
      >
        {aberto ? 'Fechar' : '+ Criar novo distintivo'}
      </button>

      {aberto && (
        <form onSubmit={criar} className="space-y-3 rounded-xl bg-fundo p-4">
          <div className="flex gap-2">
            <input
              className="input w-20 text-center text-lg"
              placeholder="🎖️"
              value={form.emoji}
              maxLength={4}
              onChange={(e) => setForm({ ...form, emoji: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder='Título (ex.: "Alma do Forró")'
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              required
            />
          </div>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Descrição — por que esse distintivo existe?"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
          <button className="btn-primary w-full" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Criar distintivo'}
          </button>
        </form>
      )}

      {selecionado && (
        <PainelEntrega
          distintivo={selecionado}
          perfis={perfis}
          desafios={desafios}
          turmas={turmas}
          onFechar={() => setSelecionadoId(null)}
          onConcedido={() => void carregar()}
          onRemoverDefinicao={() => void remover(selecionado.id)}
        />
      )}
    </section>
  )
}

function PainelEntrega({
  distintivo,
  perfis,
  desafios,
  turmas,
  onFechar,
  onConcedido,
  onRemoverDefinicao,
}: {
  distintivo: DistintivoDef
  perfis: Profile[]
  desafios: Challenge[]
  turmas: Turma[]
  onFechar: () => void
  /** Avisa a lista pra atualizar a contagem de recebedores. */
  onConcedido: () => void
  onRemoverDefinicao: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [recebedores, setRecebedores] = useState<DistintivoRecebedor[] | null>(
    null,
  )
  const [busca, setBusca] = useState('')
  const [desafioId, setDesafioId] = useState('')
  const [topN, setTopN] = useState<number>(3)
  const [turmaEscolhida, setTurmaEscolhida] = useState('')
  const [entregando, setEntregando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const carregarRecebedores = useCallback(async () => {
    setRecebedores(await api.listRecebedores(distintivo.id))
  }, [api, distintivo.id])

  useEffect(() => {
    setRecebedores(null)
    setConfirmandoExclusao(false)
    void carregarRecebedores()
  }, [carregarRecebedores])

  const jaTem = (userId: string) =>
    recebedores?.some((r) => r.user_id === userId) ?? false

  const entregarPara = async (userIds: string[], msgSucesso: string) => {
    setEntregando(true)
    try {
      await api.concederDistintivo(distintivo.id, userIds)
      await carregarRecebedores()
      onConcedido()
      toast(msgSucesso)
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setEntregando(false)
    }
  }

  const revogar = async (userId: string) => {
    try {
      await api.revogarDistintivo(distintivo.id, userId)
      await carregarRecebedores()
      onConcedido()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  // Alunos de uma turma — pra premiar quem se formou naquela turma
  // no semestre de uma vez só
  const alunosDaTurma = turmaEscolhida
    ? perfis.filter((p) => p.turmas.some((t) => t.turma === turmaEscolhida))
    : []
  const novosDaTurma = alunosDaTurma.filter((p) => !jaTem(p.id))

  const entregarTurma = async () => {
    if (novosDaTurma.length === 0) return
    await entregarPara(
      novosDaTurma.map((p) => p.id),
      `Turma ${turmaEscolhida}: ${novosDaTurma.length} ${
        novosDaTurma.length === 1 ? 'aluno recebeu' : 'alunos receberam'
      } o distintivo! 🎓`,
    )
    setTurmaEscolhida('')
  }

  const entregarTopN = async () => {
    const desafio = desafios.find((c) => c.id === desafioId)
    if (!desafio) {
      toast('Escolha um desafio', 'erro')
      return
    }
    setEntregando(true)
    try {
      const ranking = await api.getRanking(desafio)
      // Respeita empate: cortar no índice escolheria um dos empatados
      // por ordem alfabética, o que seria arbitrário e injusto.
      const premiados = ateAPosicao(ranking, topN)
      if (premiados.length === 0) {
        toast('Esse desafio ainda não tem ninguém no ranking', 'erro')
        return
      }
      await api.concederDistintivo(
        distintivo.id,
        premiados.map((r) => r.user_id),
      )
      await carregarRecebedores()
      onConcedido()
      toast(
        premiados.length > topN
          ? `Entregue para ${premiados.length} pessoas — o top ${topN} de "${desafio.titulo}" tem empate 🤝`
          : `Entregue para o top ${premiados.length} de "${desafio.titulo}"! 🏆`,
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setEntregando(false)
    }
  }

  const alunosFiltrados = busca
    ? perfis
        .filter((p) => !jaTem(p.id) && combinaBusca(busca, [p.nome, p.telefone]))
        .slice(0, 8)
    : []

  return (
    <div className="space-y-4 rounded-xl border border-brasa-500/20 bg-fundo p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">
            {distintivo.emoji} {distintivo.titulo}
          </p>
          {distintivo.descricao && (
            <p className="text-xs text-tinta-500">{distintivo.descricao}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="shrink-0 text-tinta-500 hover:text-tinta-900"
          aria-label="Fechar painel de entrega"
        >
          ✕
        </button>
      </div>

      {/* Entregar pra uma turma inteira (ex.: quem se formou no semestre) */}
      <div className="space-y-2">
        <span className="label">Entregar pra uma turma inteira</span>
        <select
          className="input"
          value={turmaEscolhida}
          onChange={(e) => setTurmaEscolhida(e.target.value)}
        >
          <option value="">Escolha a turma…</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.nome}>
              {t.nome}
            </option>
          ))}
        </select>
        {turmaEscolhida && (
          <p className="text-xs text-tinta-500">
            {alunosDaTurma.length === 0 ? (
              'Nenhum aluno com conta nessa turma ainda.'
            ) : novosDaTurma.length === 0 ? (
              alunosDaTurma.length === 1 ? (
                'O único aluno dessa turma já recebeu.'
              ) : (
                `Todos os ${alunosDaTurma.length} já receberam.`
              )
            ) : (
              <>
                <strong className="text-tinta-700">
                  {novosDaTurma.length}
                </strong>{' '}
                de {alunosDaTurma.length} vão receber
                {alunosDaTurma.length !== novosDaTurma.length &&
                  ` (${alunosDaTurma.length - novosDaTurma.length} já tinham)`}
              </>
            )}
          </p>
        )}
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={novosDaTurma.length === 0 || entregando}
          onClick={() => void entregarTurma()}
        >
          Entregar pra turma toda 🎓
        </button>
      </div>

      {/* Entregar pro topo de um desafio */}
      <div className="space-y-2">
        <span className="label">Entregar pro topo de um desafio</span>
        <div className="flex gap-2">
          <select
            className="input"
            value={desafioId}
            onChange={(e) => setDesafioId(e.target.value)}
          >
            <option value="">Escolha o desafio…</option>
            {desafios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titulo}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="input w-20"
            value={topN}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value))
              setTopN(n >= 1 ? n : 1)
            }}
          />
        </div>
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={!desafioId || entregando}
          onClick={() => void entregarTopN()}
        >
          Entregar para o Top {topN} 🏆
        </button>
      </div>

      {/* Entregar pra um aluno específico */}
      <div className="space-y-2">
        <span className="label">Entregar pra um aluno específico</span>
        <input
          type="search"
          className="input"
          placeholder="🔎 Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <div className="max-h-40 divide-y divide-preto/10 overflow-y-auto rounded-lg bg-papel">
            {alunosFiltrados.length === 0 ? (
              <p className="p-2 text-xs text-tinta-500">
                Ninguém encontrado (ou já recebeu esse distintivo).
              </p>
            ) : (
              alunosFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={entregando}
                  onClick={() => {
                    void entregarPara(
                      [p.id],
                      `${p.nome} recebeu o distintivo! 🎉`,
                    )
                    setBusca('')
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-preto/5"
                >
                  {p.nome}
                  <span className="shrink-0 text-xs text-brasa-700">
                    + entregar
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Quem já recebeu */}
      <div className="space-y-1">
        <span className="label">
          Quem já recebeu{' '}
          {recebedores && recebedores.length > 0 && `(${recebedores.length})`}
        </span>
        {recebedores === null ? (
          <Spinner />
        ) : recebedores.length === 0 ? (
          <p className="text-xs text-tinta-500">Ninguém ainda.</p>
        ) : (
          <div className="divide-y divide-preto/10">
            {recebedores.map((r) => (
              <div
                key={r.user_id}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className="truncate">{r.nome}</span>
                <button
                  type="button"
                  onClick={() => void revogar(r.user_id)}
                  className="shrink-0 text-xs font-bold text-tinta-500 hover:text-red-600"
                >
                  revogar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Apagar o distintivo do catálogo */}
      <div className="border-t border-preto/10 pt-3">
        {confirmandoExclusao ? (
          <button
            type="button"
            className="btn-danger w-full"
            onClick={onRemoverDefinicao}
          >
            ⚠️ Apagar distintivo e tirar de todo mundo?
          </button>
        ) : (
          <button
            type="button"
            className="text-xs font-bold text-tinta-500 hover:text-red-600"
            onClick={() => setConfirmandoExclusao(true)}
          >
            🗑️ Apagar este distintivo do catálogo
          </button>
        )}
      </div>
    </div>
  )
}

function SecaoTurmas({
  turmas,
  cargos,
  onTurmasChanged,
}: {
  turmas: Turma[]
  cargos: Cargo[]
  onTurmasChanged: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [alunos, setAlunos] = useState<AlunoCadastrado[] | null>(null)
  const [perfis, setPerfis] = useState<Profile[]>([])
  const [novaTurma, setNovaTurma] = useState('')
  const [novo, setNovo] = useState<{
    nome: string
    telefone: string
    turma: string
    papel_danca: PapelDanca | null
  }>({ nome: '', telefone: '', turma: '', papel_danca: null })
  const [aberto, setAberto] = useState(false)
  const [importacao, setImportacao] = useState<ResultadoParse | null>(null)
  const [importando, setImportando] = useState(false)
  const [buscaLista, setBuscaLista] = useState('')
  const [buscaApp, setBuscaApp] = useState('')
  const [turmaLista, setTurmaLista] = useState('')
  const [turmaApp, setTurmaApp] = useState('')
  const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(
    null,
  )
  const [limpandoChamada, setLimpandoChamada] = useState(false)
  const [encerrando, setEncerrando] = useState(false)

  const carregar = useCallback(async () => {
    const [a, p] = await Promise.all([
      api.listAlunosCadastrados(),
      api.listProfiles(),
    ])
    setAlunos(a)
    setPerfis(p)
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const addTurma = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.saveTurma(novaTurma)
      setNovaTurma('')
      onTurmasChanged()
      toast('Turma criada! 🎓')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const removerTurma = async (id: string) => {
    try {
      await api.deleteTurma(id)
      onTurmasChanged()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const adicionar = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.saveAlunoCadastrado({
        ...novo,
        // Vazio = veterano sem turma no semestre, não "escolhe a
        // primeira": inventar turma para quem não faz aula sujaria a
        // chamada e a agenda dessa turma.
        turma: novo.turma || null,
      })
      setNovo({ nome: '', telefone: '', turma: '', papel_danca: null })
      await carregar()
      toast(
        novo.turma
          ? 'Aluno adicionado à lista de chamada!'
          : 'Adicionado sem turma — já pode criar conta no app 👍',
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const remover = async (id: string) => {
    try {
      await api.deleteAlunoCadastrado(id)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  /**
   * Tira a pessoa inteira da chamada (todas as turmas dela). Pede
   * confirmação porque agora um clique pode apagar várias linhas — e
   * avisa que quem já tem conta continua entrando, que é a parte que
   * mais surpreende.
   */
  const removerPessoa = async (pessoa: PessoaNaChamada) => {
    try {
      for (const linha of pessoa.linhas) {
        await api.deleteAlunoCadastrado(linha.id)
      }
      await carregar()
      setConfirmandoRemocao(null)
      toast(
        pessoa.temConta
          ? 'Tirado da lista de chamada. A conta no app continua ativa — para tirar das turmas, use "Alunos no app" abaixo.'
          : 'Tirado da lista de chamada.',
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const escolherArquivo = async (file: File | undefined) => {
    if (!file) return
    const texto = await file.text()
    const resultado = parseAlunosCSV(
      texto,
      turmas.map((t) => t.nome),
    )
    setImportacao(resultado)
    if (arquivoRef.current) arquivoRef.current.value = ''
  }

  const confirmarImportacao = async () => {
    if (plano.length === 0) return
    setImportando(true)
    try {
      const { perfis: p, chamada } = await api.matricularAlunos(plano)
      toast(
        [
          p > 0 && `${p} já no app tiveram a turma atualizada`,
          chamada > 0 && `${chamada} entraram na lista de chamada`,
        ]
          .filter(Boolean)
          .join(' · ') + ' ✅',
      )
      setImportacao(null)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setImportando(false)
    }
  }

  const encerrar = async () => {
    try {
      const n = await api.encerrarSemestre()
      await carregar()
      setEncerrando(false)
      toast(
        n === 0
          ? 'Ninguém estava em turma nenhuma'
          : `${n} aluno(s) ficaram sem turma. Agora importe a matrícula nova.`,
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const limparChamada = async () => {
    try {
      const n = await api.limparChamadaComConta()
      await carregar()
      setLimpandoChamada(false)
      toast(
        n === 0
          ? 'Nada a limpar — ninguém na lista tem conta ainda'
          : `${n} linha(s) removidas. O acesso de quem já tem conta continua igual.`,
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const adicionarTurmaAluno = async (
    userId: string,
    turma: string,
    papel: PapelDanca | null,
  ) => {
    if (!turma) return
    try {
      await api.addTurmaAluno(userId, turma, papel)
      await carregar()
      toast('Turma adicionada ao aluno!')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const removerTurmaAluno = async (userId: string, turma: string) => {
    try {
      await api.removeTurmaAluno(userId, turma)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  // Uma linha por pessoa, não por (pessoa, turma): quem faz três turmas
  // ocupava três linhas e o mesmo nome se repetia pela tela toda.
  const pessoas = agruparChamada(alunos ?? [], perfis)
  const pessoasFiltradas = filtrarPorTurma(pessoas, turmaLista).filter((p) =>
    combinaBusca(buscaLista, [p.nome, p.telefone, ...p.turmas]),
  )
  const faltamConta = semConta(pessoas)
  const jaTemConta = pessoas.length - faltamConta

  // O plano só existe enquanto há um arquivo escolhido; é ele que a
  // tela mostra antes de confirmar e o que a API executa.
  const plano = importacao
    ? planejarMatricula(importacao.linhas, alunos ?? [], perfis)
    : []
  const comTurma = perfis.filter((p) => p.turmas.length > 0).length

  const perfisComTurmas = perfis.map((p) => ({
    perfil: p,
    turmas: p.turmas.map((t) => t.turma),
  }))
  const perfisFiltrados = filtrarPorTurma(perfisComTurmas, turmaApp)
    .map((x) => x.perfil)
    .filter((p) =>
      combinaBusca(buscaApp, [
        p.nome,
        p.telefone,
        ...p.cargos,
        ...p.turmas.map((t) => t.turma),
      ]),
    )

  const darCargo = async (userId: string, cargo: string) => {
    if (!cargo) return
    try {
      await api.addCargoAluno(userId, cargo)
      await carregar()
      toast('Cargo atribuído! 🎖️')
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const tirarCargo = async (userId: string, cargo: string) => {
    try {
      await api.removeCargoAluno(userId, cargo)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  return (
    <section className="card space-y-5 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
        🎓 Turmas
      </h2>

      {/* Turmas do semestre */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-tinta-600">
          Turmas do semestre
        </h3>
        <p className="text-xs text-tinta-500">
          Defina as turmas de cada semestre (ex.: Iniciante 01, Iniciante 02,
          Inter, AV). Elas aparecem em todos os cadastros e na agenda.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {turmas.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-preto/5 px-3 py-1.5 text-xs font-bold text-tinta-900"
            >
              {t.nome}
              <button
                onClick={() => void removerTurma(t.id)}
                className="text-tinta-500 hover:text-red-600"
                aria-label={`Remover turma ${t.nome}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addTurma} className="flex gap-2">
          <input
            className="input"
            placeholder='Nova turma (ex.: "Iniciante 03")'
            value={novaTurma}
            onChange={(e) => setNovaTurma(e.target.value)}
            required
          />
          <button className="btn-ghost shrink-0">+ Criar</button>
        </form>

        {/* Vira o semestre: zera as turmas de todo mundo para a
            matrícula nova entrar limpa. Quem terminou o curso e não
            voltar em nenhuma planilha fica sem turma — continua com
            conta, pontos e check-ins, só não pertence a uma turma. */}
        {encerrando ? (
          <div className="space-y-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700">
            <p>
              Tirar os <strong>{comTurma}</strong> alunos do app das turmas
              atuais? Contas, pontos, check-ins e distintivos{' '}
              <strong>não são tocados</strong> — só o vínculo com a turma.
            </p>
            <p>
              Faça isso ao virar o semestre, logo antes de importar a
              matrícula nova. Até importar, o feed "Minha turma" fica vazio
              para todo mundo.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-danger flex-1 py-1.5 text-xs"
                onClick={() => void encerrar()}
              >
                Encerrar o semestre
              </button>
              <button
                className="btn-ghost flex-1 py-1.5 text-xs"
                onClick={() => setEncerrando(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          comTurma > 0 && (
            <button
              className="btn-ghost w-full py-1.5 text-xs"
              onClick={() => setEncerrando(true)}
            >
              🎓 Encerrar semestre — tirar todos das turmas ({comTurma})
            </button>
          )
        )}
      </div>

      {/* Lista de chamada */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-tinta-600">
            Lista de chamada (telefone → turma)
          </h3>
          <div className="flex gap-1.5">
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => arquivoRef.current?.click()}
            >
              ⬆️ Importar CSV
            </button>
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setAberto((v) => !v)}
            >
              {aberto ? 'Fechar' : '+ Adicionar'}
            </button>
          </div>
        </div>
        <p className="text-xs text-tinta-500">
          É esta lista que libera o cadastro: o aluno cria a conta informando
          o telefone e já entra nas turmas certas.{' '}
          <strong className="text-tinta-600">
            Tirar alguém daqui não tira o acesso de quem já criou conta
          </strong>{' '}
          — a lista vale só na hora do cadastro, e por isso quem já entrou no
          app não precisa continuar nela. Ao virar o semestre: encerre o
          semestre ali em cima e importe as planilhas novas. Quem já tem conta
          tem a turma trocada direto no perfil; quem ainda não tem entra aqui.
          CSV com colunas{' '}
          <code>nome;telefone;turma;papel</code> (papel = Condutor/Conduzido,
          opcional; com ou sem cabeçalho). Aluno em várias turmas = uma linha
          por turma.
        </p>
        <input
          ref={arquivoRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void escolherArquivo(e.target.files?.[0])}
        />

        {importacao && (
          <div className="space-y-3 rounded-xl border border-brasa-500/30 bg-brasa-500/5 p-3">
            <div>
              <p className="text-sm font-bold">
                📄 Matrícula do semestre — {plano.length}{' '}
                {plano.length === 1 ? 'pessoa' : 'pessoas'}
              </p>
              <p className="mt-0.5 text-xs text-tinta-600">
                As turmas do arquivo <strong>substituem</strong> as de agora,
                pessoa por pessoa. Quem não está no arquivo não é tocado — dá
                para importar uma turma de cada vez.
              </p>
            </div>

            {plano.length > 0 && (
              <div className="max-h-64 divide-y divide-preto/10 overflow-y-auto rounded-lg bg-papel px-3">
                {plano.map((p) => (
                  <div
                    key={p.chave}
                    className="flex items-center gap-2 py-1.5 text-xs"
                  >
                    <p className="min-w-0 flex-1 truncate font-bold">
                      {p.nome ?? '—'}
                    </p>
                    <p className="shrink-0 text-tinta-500">
                      {turmasDaLinha(p)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {importacao.avisos.length > 0 && (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-amber-800">
                {importacao.avisos.map((a, i) => (
                  <li key={i}>⚠️ {a}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <button
                className="btn-primary flex-1 py-2 text-xs"
                disabled={importando || plano.length === 0}
                onClick={() => void confirmarImportacao()}
              >
                {importando ? 'Matriculando…' : 'Confirmar matrícula'}
              </button>
              <button
                className="btn-ghost flex-1 py-2 text-xs"
                onClick={() => setImportacao(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {aberto && (
          <form onSubmit={adicionar} className="space-y-2 rounded-xl bg-fundo p-3">
            <input
              className="input"
              placeholder="Nome"
              value={novo.nome}
              onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
            />
            <input
              className="input"
              type="tel"
              placeholder="Telefone com DDD"
              value={novo.telefone}
              onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
              required
            />
            <div className="flex gap-2">
              <select
                className="input"
                value={novo.turma}
                onChange={(e) => setNovo({ ...novo, turma: e.target.value })}
              >
                <option value="">Sem turma (veterano)</option>
                {turmas.map((t) => (
                  <option key={t.id} value={t.nome}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={novo.papel_danca ?? ''}
                aria-label="Papel na dança"
                onChange={(e) =>
                  setNovo({
                    ...novo,
                    papel_danca: (e.target.value || null) as PapelDanca | null,
                  })
                }
              >
                <option value="">Sem papel</option>
                {PAPEIS_DANCA.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-tinta-500">
              Para um aluno em mais de uma turma, adicione uma linha por turma
              (o mesmo telefone pode repetir).
            </p>
            <button className="btn-primary w-full">Adicionar</button>
          </form>
        )}

        {alunos && alunos.length > 6 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input"
              type="search"
              placeholder="🔎 Buscar por nome ou telefone…"
              value={buscaLista}
              onChange={(e) => setBuscaLista(e.target.value)}
            />
            <select
              className="input sm:w-52"
              aria-label="Filtrar a chamada por turma"
              value={turmaLista}
              onChange={(e) => setTurmaLista(e.target.value)}
            >
              <option value="">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.nome}>
                  {t.nome}
                </option>
              ))}
              <option value={SEM_TURMA}>Sem turma (veteranos)</option>
            </select>
          </div>
        )}

        {alunos === null ? (
          <Spinner />
        ) : alunos.length === 0 ? (
          <p className="text-sm text-tinta-500">Lista vazia.</p>
        ) : (
          <>
            <p className="text-xs text-tinta-500">
              <strong className="text-tinta-700">
                {pessoasFiltradas.length}
              </strong>
              {pessoasFiltradas.length !== pessoas.length && (
                <> de {pessoas.length}</>
              )}{' '}
              {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
              {faltamConta > 0 && (
                <> · {faltamConta} ainda sem conta no app</>
              )}
            </p>

            {/* Depois de alguns semestres a chamada acumula gente que já
                tem conta e não precisa mais estar ali. */}
            {jaTemConta > 0 &&
              (limpandoChamada ? (
                <div className="space-y-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700">
                  <p>
                    Tirar da lista as <strong>{jaTemConta}</strong> pessoas que
                    já criaram conta? Elas continuam com o mesmo acesso e as
                    mesmas turmas — a chamada só é lida na hora do cadastro.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="btn-danger flex-1 py-1.5 text-xs"
                      onClick={() => void limparChamada()}
                    >
                      Limpar {jaTemConta}
                    </button>
                    <button
                      className="btn-ghost flex-1 py-1.5 text-xs"
                      onClick={() => setLimpandoChamada(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-ghost w-full py-1.5 text-xs"
                  onClick={() => setLimpandoChamada(true)}
                >
                  🧹 Tirar da lista quem já tem conta ({jaTemConta})
                </button>
              ))}

            {pessoasFiltradas.length === 0 ? (
              <p className="py-3 text-center text-sm text-tinta-500">
                Ninguém encontrado
                {buscaLista && <> com "{buscaLista}"</>}
                {turmaLista && <> nesse filtro</>}.
              </p>
            ) : (
              <div className="max-h-[28rem] divide-y divide-preto/10 overflow-y-auto">
                {pessoasFiltradas.map((p) => (
                  <div key={p.chave} className="py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-bold">
                          {p.nome ?? '—'}
                          {/* Fundo em /10 e não /15: mais escuro que isso
                              o texto âmbar cai para 4,48:1, abaixo do
                              mínimo de 4,5:1 para texto pequeno. */}
                          {!p.temConta && (
                            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              sem conta
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-tinta-500">{p.telefone}</p>
                      </div>
                      <button
                        onClick={() => setConfirmandoRemocao(p.chave)}
                        className="p-1.5 text-tinta-400 hover:text-red-600"
                        aria-label={`Tirar ${p.nome ?? p.telefone} da chamada`}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Uma etiqueta por turma; o ✕ da etiqueta tira só
                        aquela turma, o ✕ da linha tira a pessoa toda */}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.linhas.map((linha) => (
                        <span
                          key={linha.id}
                          className="inline-flex items-center gap-1 rounded-full bg-preto/5 px-2 py-0.5 text-[11px] text-tinta-700"
                        >
                          {linha.turma ?? 'sem turma'}
                          {linha.papel_danca &&
                            ` · ${linha.papel_danca === 'Condutor(a)' ? 'cond.' : 'conduz.'}`}
                          <button
                            onClick={() => void remover(linha.id)}
                            className="text-tinta-500 hover:text-red-600"
                            aria-label={`Tirar ${p.nome ?? p.telefone} de ${linha.turma ?? 'sem turma'}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>

                    {confirmandoRemocao === p.chave && (
                      <div className="mt-2 space-y-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700">
                        <p>
                          Tirar <strong>{p.nome ?? p.telefone}</strong> da
                          chamada
                          {p.linhas.length > 1 && (
                            <> ({p.linhas.length} turmas)</>
                          )}
                          ?
                          {p.temConta && (
                            <>
                              {' '}
                              A conta no app <strong>continua ativa</strong> —
                              a chamada só libera o cadastro. Para tirar das
                              turmas, use "Alunos no app" abaixo.
                            </>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <button
                            className="btn-danger flex-1 py-1.5 text-xs"
                            onClick={() => void removerPessoa(p)}
                          >
                            Tirar da chamada
                          </button>
                          <button
                            className="btn-ghost flex-1 py-1.5 text-xs"
                            onClick={() => setConfirmandoRemocao(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Alunos com conta */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-tinta-600">Alunos no app</h3>
        <p className="text-xs text-tinta-500">
          Um aluno pode estar em várias turmas com papéis diferentes (ex.:
          Condutor no Avançado e Conduzido no Intermediário). O aluno não
          consegue mudar as próprias turmas.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            type="search"
            placeholder="🔎 Buscar por nome ou telefone…"
            value={buscaApp}
            onChange={(e) => setBuscaApp(e.target.value)}
          />
          <select
            className="input sm:w-52"
            aria-label="Filtrar os alunos do app por turma"
            value={turmaApp}
            onChange={(e) => setTurmaApp(e.target.value)}
          >
            <option value="">Todas as turmas</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.nome}>
                {t.nome}
              </option>
            ))}
            <option value={SEM_TURMA}>Sem turma (veteranos)</option>
          </select>
        </div>

        <p className="text-xs text-tinta-500">
          <strong className="text-tinta-700">{perfisFiltrados.length}</strong>
          {perfisFiltrados.length !== perfis.length && (
            <> de {perfis.length}</>
          )}{' '}
          {perfis.length === 1 ? 'aluno' : 'alunos'}
        </p>

        {perfisFiltrados.length === 0 ? (
          <p className="py-3 text-center text-sm text-tinta-500">
            Ninguém encontrado
            {buscaApp && <> com "{buscaApp}"</>}
            {turmaApp && <> nesse filtro</>}.
          </p>
        ) : (
        <div className="max-h-[28rem] divide-y divide-preto/10 overflow-y-auto">
          {perfisFiltrados.map((p) => (
            <LinhaAlunoApp
              key={p.id}
              perfil={p}
              turmas={turmas}
              cargos={cargos}
              onAdd={(turma, papel) =>
                void adicionarTurmaAluno(p.id, turma, papel)
              }
              onRemove={(turma) => void removerTurmaAluno(p.id, turma)}
              onAddCargo={(cargo) => void darCargo(p.id, cargo)}
              onRemoveCargo={(cargo) => void tirarCargo(p.id, cargo)}
            />
          ))}
        </div>
        )}
      </div>
    </section>
  )
}

function LinhaAlunoApp({
  perfil,
  turmas,
  cargos,
  onAdd,
  onRemove,
  onAddCargo,
  onRemoveCargo,
}: {
  perfil: Profile
  turmas: Turma[]
  cargos: Cargo[]
  onAdd: (turma: string, papel: PapelDanca | null) => void
  onRemove: (turma: string) => void
  onAddCargo: (cargo: string) => void
  onRemoveCargo: (cargo: string) => void
}) {
  const [turma, setTurma] = useState('')
  const [papel, setPapel] = useState<PapelDanca | null>(null)

  const disponiveis = turmas.filter(
    (t) => !perfil.turmas.some((m) => m.turma === t.nome),
  )
  const cargosDisponiveis = cargos.filter(
    (c) => !perfil.cargos.includes(c.nome),
  )

  return (
    <div className="space-y-2 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-bold">{perfil.nome}</p>
        {perfil.telefone && (
          <p className="text-xs text-tinta-500">{perfil.telefone}</p>
        )}
      </div>

      {/* Cargos no projeto */}
      <div className="flex flex-wrap items-center gap-1.5">
        {perfil.cargos.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-full bg-brasa-500/20 px-2.5 py-1 text-[11px] font-bold text-brasa-700"
          >
            {emojiCargo(c)} {c}
            <button
              onClick={() => onRemoveCargo(c)}
              className="text-brasa-700/60 hover:text-red-600"
              aria-label={`Tirar o cargo ${c} de ${perfil.nome}`}
            >
              ✕
            </button>
          </span>
        ))}
        {cargosDisponiveis.length > 0 && (
          <select
            className="input w-40 py-1"
            value=""
            aria-label={`Dar cargo para ${perfil.nome}`}
            onChange={(e) => {
              if (e.target.value) onAddCargo(e.target.value)
            }}
          >
            <option value="">+ Cargo…</option>
            {cargosDisponiveis.map((c) => (
              <option key={c.id} value={c.nome}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {perfil.turmas.length === 0 && (
          <span className="text-xs text-tinta-400">Sem turma</span>
        )}
        {perfil.turmas.map((m) => (
          <span
            key={m.turma}
            className="inline-flex items-center gap-1.5 rounded-full bg-verde-500/15 px-2.5 py-1 text-[11px] font-bold text-verde-800"
          >
            {m.papel_danca === 'Condutor(a)' && '🕺'}
            {m.papel_danca === 'Conduzido(a)' && '💃'}
            {m.turma}
            <button
              onClick={() => onRemove(m.turma)}
              className="text-verde-800/60 hover:text-red-600"
              aria-label={`Remover ${perfil.nome} da turma ${m.turma}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {disponiveis.length > 0 && (
        <div className="flex gap-1.5">
          <select
            className="input py-1.5"
            value={turma}
            aria-label={`Adicionar turma para ${perfil.nome}`}
            onChange={(e) => setTurma(e.target.value)}
          >
            <option value="">+ Turma…</option>
            {disponiveis.map((t) => (
              <option key={t.id} value={t.nome}>
                {t.nome}
              </option>
            ))}
          </select>
          <select
            className="input py-1.5"
            value={papel ?? ''}
            aria-label={`Papel de ${perfil.nome}`}
            onChange={(e) =>
              setPapel((e.target.value || null) as PapelDanca | null)
            }
          >
            <option value="">Sem papel</option>
            {PAPEIS_DANCA.map((pd) => (
              <option key={pd} value={pd}>
                {pd}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
            disabled={!turma}
            onClick={() => {
              onAdd(turma, papel)
              setTurma('')
              setPapel(null)
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminPage() {
  const { api, papel, carregando } = useAuth()
  const toast = useToast()

  const [aba, setAba] = useState<AbaPainel>('pessoas')
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [presencas, setPresencas] = useState<AttendanceRow[] | null>(null)
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [reports, setReports] = useState<Report[]>([])

  const carregarTurmas = useCallback(async () => {
    setTurmas(await api.listTurmas())
  }, [api])

  const carregarCargos = useCallback(async () => {
    setCargos(await api.listCargos())
  }, [api])

  const carregarFeriados = useCallback(async () => {
    setFeriados(await api.listFeriados())
  }, [api])

  const carregarPresencas = useCallback(
    async (m: string) => {
      const { inicio, fim } = limitesDoMes(m)
      setPresencas(await api.getAttendance(inicio, fim))
    },
    [api],
  )

  useEffect(() => {
    if (papel !== 'organizador') return
    const falhou = (o: string) => (e: unknown) => {
      console.error(`[painel] falha em ${o}`, e)
      toast(`Falha ao carregar ${o}: ${(e as Error).message}`, 'erro')
    }
    void carregarTurmas().catch(falhou('turmas'))
    void carregarCargos().catch(falhou('cargos'))
    void carregarFeriados().catch(falhou('feriados'))
    void api.listChallenges().then(setDesafios).catch(falhou('desafios'))
    void api.listReports().then(setReports).catch(falhou('denúncias'))
    void carregarPresencas(mes).catch(falhou('frequência'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, papel])

  if (carregando) return <Spinner />
  if (papel !== 'organizador') return <Navigate to="/" replace />

  const resolver = async (id: string, remover: boolean) => {
    try {
      await api.resolveReport(id, remover)
      setReports(await api.listReports())
      toast(remover ? 'Post removido' : 'Denúncia ignorada')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  // Só o primeiro check-in de cada janela marca ponto (1 por janela).
  // Usa a janela do desafio, não a data do calendário, para não
  // duplicar em desafios que cruzam a meia-noite (ex.: 21:00–02:00) —
  // um check-in às 23h e outro à 01h contam como a MESMA janela.
  // `presencas` vem do mais novo para o mais antigo, então percorre ao
  // contrário para marcar o mais antigo de cada janela.
  // Dia cancelado não tem janela: a foto entrou no feed, mas não vale
  // presença — a planilha precisa dizer o mesmo que o ranking.
  const suspensos = diasSuspensos(feriados)
  const chavesVistas = new Set<string>()
  const pontuados = new Set<string>()
  for (const p of [...(presencas ?? [])].reverse()) {
    const d = new Date(p.data)
    const chaves = desafios
      .map((c) => {
        const janela = janelaDoCheckin(d, c, suspensos)
        return janela ? `${p.nome}|${c.id}|${janela}` : null
      })
      .filter((k): k is string => k !== null)
    if (chaves.length === 0) continue
    if (!chaves.some((k) => !chavesVistas.has(k))) continue
    chaves.forEach((k) => chavesVistas.add(k))
    pontuados.add(p.data)
  }
  const contaPonto = (data: string) => pontuados.has(data)

  const exportarPresencas = () => {
    if (!presencas) return
    downloadCSV(
      `presencas-${mes}`,
      ['Data', 'Hora', 'Nome', 'Turma', 'ValeuPonto'],
      presencas.map((p) => {
        const d = new Date(p.data)
        return [
          d.toLocaleDateString('pt-BR'),
          d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          p.nome,
          p.turma,
          contaPonto(p.data) ? 'sim' : 'não',
        ]
      }),
    )
  }

  const alunosUnicos = new Set((presencas ?? []).map((p) => p.nome)).size

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Painel do organizador 🛠️</h1>

      <div className="grid grid-cols-5 gap-1 rounded-xl bg-fundo p-1">
        {ABAS_PAINEL.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            aria-pressed={aba === t.id}
            className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-bold transition ${
              aba === t.id ? 'bg-papel text-tinta-900 shadow-sm' : 'text-tinta-500'
            }`}
          >
            <span className="relative text-base leading-none">
              {t.emoji}
              {t.id === 'denuncias' && reports.length > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-extrabold text-white">
                  {reports.length}
                </span>
              )}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'pessoas' && (
        <>
          <SecaoCargos cargos={cargos} onChanged={() => void carregarCargos()} />
          <SecaoTurmas
            turmas={turmas}
            cargos={cargos}
            onTurmasChanged={() => void carregarTurmas()}
          />
        </>
      )}

      {aba === 'agenda' && (
        <>
          <SecaoAgenda turmas={turmas} feriados={feriados} />
          <SecaoFeriados
            feriados={feriados}
            turmas={turmas}
            onChanged={() => void carregarFeriados()}
          />
        </>
      )}

      {aba === 'distintivos' && (
        <SecaoDistintivos desafios={desafios} turmas={turmas} />
      )}

      {aba === 'frequencia' && (
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          📋 Frequência
        </h2>
        <p className="text-xs text-tinta-500">
          A coluna <strong>Ponto</strong> marca ✅ só no primeiro check-in
          válido de cada janela — vale 1 ponto por janela, mesmo com várias
          fotos ou se a janela virar a noite.
        </p>
        <div className="flex gap-2">
          <input
            type="month"
            className="input"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value)
              if (e.target.value) void carregarPresencas(e.target.value)
            }}
          />
          <button
            className="btn-ghost shrink-0"
            disabled={!presencas || presencas.length === 0}
            onClick={exportarPresencas}
          >
            ⬇️ CSV
          </button>
        </div>

        {presencas === null ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-fundo py-2.5">
                <p className="text-lg font-extrabold">{presencas.length}</p>
                <p className="text-[10px] font-bold uppercase text-tinta-500">
                  check-ins
                </p>
              </div>
              <div className="rounded-xl bg-fundo py-2.5">
                <p className="text-lg font-extrabold">{alunosUnicos}</p>
                <p className="text-[10px] font-bold uppercase text-tinta-500">
                  alunos
                </p>
              </div>
            </div>

            {presencas.length === 0 ? (
              <p className="py-4 text-center text-sm text-tinta-500">
                Nenhum check-in neste mês.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-preto/10">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-papel text-tinta-600">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Ponto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-preto/10">
                    {presencas.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-tinta-600">
                          {new Date(p.data).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2 font-bold">{p.nome}</td>
                        <td className="px-3 py-2 text-tinta-600">{p.turma}</td>
                        <td className="px-3 py-2">
                          {contaPonto(p.data) ? '✅' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      )}

      {aba === 'denuncias' && (
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          🚩 Denúncias {reports.length > 0 && `(${reports.length})`}
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-tinta-500">
            Nenhuma denúncia pendente. Tudo em paz por aqui 🕊️
          </p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-xl bg-fundo p-3">
              {r.foto_url && (
                <img
                  src={r.foto_url}
                  alt="Foto denunciada"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  Post de {r.autor_nome ?? 'alguém'}
                </p>
                <p className="text-xs text-tinta-600">
                  {r.motivo ?? 'Sem motivo informado'} · por{' '}
                  {r.denunciante_nome ?? 'alguém'} ·{' '}
                  {formatRelative(r.criado_em)}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn-danger px-3 py-1.5 text-xs"
                    onClick={() => void resolver(r.id, true)}
                  >
                    Remover post
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => void resolver(r.id, false)}
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
      )}
    </div>
  )
}
