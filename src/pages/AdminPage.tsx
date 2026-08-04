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
  desafiosQueContam,
  formatDate,
  formatRelative,
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
  type PapelDanca,
  type Profile,
  type Report,
  type Turma,
} from '../lib/types'

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

function SecaoAgenda({ turmas }: { turmas: Turma[] }) {
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          📅 Agenda
        </h2>
        <button
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Fechar' : '+ Novo evento'}
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Aulas semanais por turma e eventos como o Forró na Rep. Cada aluno vê
        na tela inicial só o que é da turma dele (ou de todos).
      </p>

      {aberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-xl bg-noite-950 p-4">
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
        <p className="text-sm text-stone-500">Nenhum evento na agenda ainda.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {eventos.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-2.5">
              <span className="text-lg">{e.data ? '🎉' : '🎓'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{e.titulo}</p>
                <p className="text-xs text-stone-500">
                  {e.data
                    ? formatDate(e.data)
                    : `Toda ${DIAS_SEMANA[e.dia_semana ?? 0].toLowerCase()}`}
                  {e.hora && ` · ${e.hora}`} ·{' '}
                  {e.turma ? `turma ${e.turma}` : 'todas as turmas'}
                </p>
              </div>
              <button
                onClick={() => void excluir(e.id)}
                className="p-1.5 text-stone-600 hover:text-red-400"
                aria-label={`Remover ${e.titulo}`}
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
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
        🎖️ Cargos do projeto
      </h2>
      <p className="text-xs text-stone-500">
        Aparecem em destaque no perfil de quem ocupa. Ao trocar a gestão,
        basta remover o cargo de uma pessoa e dar para outra.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cargos.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-brasa-500/15 px-3 py-1.5 text-xs font-bold text-brasa-300"
          >
            {emojiCargo(c.nome)} {c.nome}
            <button
              onClick={() => void remover(c.id)}
              className="text-brasa-300/60 hover:text-red-400"
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
        turma: novo.turma || turmas[0]?.nome || '',
      })
      setNovo({ nome: '', telefone: '', turma: '', papel_danca: null })
      await carregar()
      toast('Aluno adicionado à lista de chamada!')
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
    if (!importacao) return
    setImportando(true)
    try {
      const { importados, ignorados } = await api.importAlunos(
        importacao.linhas,
      )
      toast(
        `${importados} aluno(s) importado(s)` +
          (ignorados > 0 ? `, ${ignorados} já estavam na lista` : '') +
          ' ✅',
      )
      setImportacao(null)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setImportando(false)
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

  const alunosFiltrados = (alunos ?? []).filter((a) =>
    combinaBusca(buscaLista, [a.nome, a.telefone, a.turma]),
  )
  const perfisFiltrados = perfis.filter((p) =>
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
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
        🎓 Turmas
      </h2>

      {/* Turmas do semestre */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-stone-400">
          Turmas do semestre
        </h3>
        <p className="text-xs text-stone-500">
          Defina as turmas de cada semestre (ex.: Iniciante 01, Iniciante 02,
          Inter, AV). Elas aparecem em todos os cadastros e na agenda.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {turmas.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-stone-200"
            >
              {t.nome}
              <button
                onClick={() => void removerTurma(t.id)}
                className="text-stone-500 hover:text-red-400"
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
      </div>

      {/* Lista de chamada */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-400">
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
        <p className="text-xs text-stone-500">
          É esta lista que libera o cadastro: o aluno cria a conta informando
          o telefone e já entra nas turmas certas. CSV com colunas{' '}
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
          <div className="space-y-2 rounded-xl border border-brasa-500/30 bg-brasa-500/5 p-3">
            <p className="text-sm font-bold">
              📄 {importacao.linhas.length} aluno(s) prontos para importar
            </p>
            {importacao.avisos.length > 0 && (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-amber-300">
                {importacao.avisos.map((a, i) => (
                  <li key={i}>⚠️ {a}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1 py-2 text-xs"
                disabled={importando || importacao.linhas.length === 0}
                onClick={() => void confirmarImportacao()}
              >
                {importando ? 'Importando…' : 'Confirmar importação'}
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
          <form onSubmit={adicionar} className="space-y-2 rounded-xl bg-noite-950 p-3">
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
                <option value="">Turma…</option>
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
            <p className="text-xs text-stone-500">
              Para um aluno em mais de uma turma, adicione uma linha por turma
              (o mesmo telefone pode repetir).
            </p>
            <button className="btn-primary w-full">Adicionar</button>
          </form>
        )}

        {alunos && alunos.length > 6 && (
          <input
            className="input"
            type="search"
            placeholder="🔎 Buscar por nome ou telefone…"
            value={buscaLista}
            onChange={(e) => setBuscaLista(e.target.value)}
          />
        )}

        {alunos === null ? (
          <Spinner />
        ) : alunos.length === 0 ? (
          <p className="text-sm text-stone-500">Lista vazia.</p>
        ) : alunosFiltrados.length === 0 ? (
          <p className="py-3 text-center text-sm text-stone-500">
            Ninguém encontrado com "{buscaLista}".
          </p>
        ) : (
          <div className="max-h-56 divide-y divide-white/5 overflow-y-auto">
            {alunosFiltrados.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{a.nome ?? '—'}</p>
                  <p className="text-xs text-stone-500">
                    {a.telefone} · {a.turma}
                    {a.papel_danca && ` · ${a.papel_danca}`}
                  </p>
                </div>
                <button
                  onClick={() => void remover(a.id)}
                  className="p-1.5 text-stone-600 hover:text-red-400"
                  aria-label={`Remover ${a.nome ?? a.telefone}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alunos com conta */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-stone-400">
          Alunos no app{' '}
          <span className="font-normal text-stone-600">
            ({perfis.length})
          </span>
        </h3>
        <p className="text-xs text-stone-500">
          Um aluno pode estar em várias turmas com papéis diferentes (ex.:
          Condutor no Avançado e Conduzido no Intermediário). O aluno não
          consegue mudar as próprias turmas.
        </p>

        <input
          className="input"
          type="search"
          placeholder="🔎 Buscar por nome ou telefone…"
          value={buscaApp}
          onChange={(e) => setBuscaApp(e.target.value)}
        />

        {perfisFiltrados.length === 0 ? (
          <p className="py-3 text-center text-sm text-stone-500">
            Ninguém encontrado com "{buscaApp}".
          </p>
        ) : (
        <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
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
          <p className="text-xs text-stone-500">{perfil.telefone}</p>
        )}
      </div>

      {/* Cargos no projeto */}
      <div className="flex flex-wrap items-center gap-1.5">
        {perfil.cargos.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-full bg-brasa-500/20 px-2.5 py-1 text-[11px] font-bold text-brasa-300"
          >
            {emojiCargo(c)} {c}
            <button
              onClick={() => onRemoveCargo(c)}
              className="text-brasa-300/60 hover:text-red-400"
              aria-label={`Tirar o cargo ${c} de ${perfil.nome}`}
            >
              ✕
            </button>
          </span>
        ))}
        {cargosDisponiveis.length > 0 && (
          <select
            className="input w-40 py-1 text-[11px]"
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
          <span className="text-xs text-stone-600">Sem turma</span>
        )}
        {perfil.turmas.map((m) => (
          <span
            key={m.turma}
            className="inline-flex items-center gap-1.5 rounded-full bg-verde-500/15 px-2.5 py-1 text-[11px] font-bold text-verde-400"
          >
            {m.papel_danca === 'Condutor(a)' && '🕺'}
            {m.papel_danca === 'Conduzido(a)' && '💃'}
            {m.turma}
            <button
              onClick={() => onRemove(m.turma)}
              className="text-verde-400/60 hover:text-red-400"
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
            className="input py-1.5 text-xs"
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
            className="input py-1.5 text-xs"
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

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])
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

  // Só o primeiro check-in do dia de cada aluno marca ponto (1 por dia).
  // `presencas` vem do mais novo para o mais antigo, então percorre ao
  // contrário para marcar o mais antigo do dia.
  const pontuados = new Set<string>()
  const diasVistos = new Set<string>()
  for (const p of [...(presencas ?? [])].reverse()) {
    if (desafiosQueContam(p.data, desafios).length === 0) continue
    const chave = `${p.nome}|${toISODate(new Date(p.data))}`
    if (diasVistos.has(chave)) continue
    diasVistos.add(chave)
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

      <SecaoCargos cargos={cargos} onChanged={() => void carregarCargos()} />
      <SecaoTurmas
        turmas={turmas}
        cargos={cargos}
        onTurmasChanged={() => void carregarTurmas()}
      />
      <SecaoAgenda turmas={turmas} />

      {/* Frequência */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          📋 Frequência
        </h2>
        <p className="text-xs text-stone-500">
          A coluna <strong>Ponto</strong> marca ✅ só no primeiro check-in
          válido de cada dia — vale 1 ponto por dia, mesmo com várias fotos.
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
              <div className="rounded-xl bg-noite-950 py-2.5">
                <p className="text-lg font-extrabold">{presencas.length}</p>
                <p className="text-[10px] font-bold uppercase text-stone-500">
                  check-ins
                </p>
              </div>
              <div className="rounded-xl bg-noite-950 py-2.5">
                <p className="text-lg font-extrabold">{alunosUnicos}</p>
                <p className="text-[10px] font-bold uppercase text-stone-500">
                  alunos
                </p>
              </div>
            </div>

            {presencas.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-500">
                Nenhum check-in neste mês.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-noite-800 text-stone-400">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Ponto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {presencas.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-stone-400">
                          {new Date(p.data).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2 font-bold">{p.nome}</td>
                        <td className="px-3 py-2 text-stone-400">{p.turma}</td>
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

      {/* Denúncias */}
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          🚩 Denúncias {reports.length > 0 && `(${reports.length})`}
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nenhuma denúncia pendente. Tudo em paz por aqui 🕊️
          </p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-xl bg-noite-950 p-3">
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
                <p className="text-xs text-stone-400">
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
    </div>
  )
}
