import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Spinner } from '../../components/Spinner'
import { CampoBusca, Folha } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { combinaBusca } from '../../lib/busca'
import {
  turmaLabel,
  type AberturaAntecipada,
  type AlunoCadastrado,
  type Cargo,
  type Challenge,
  type Feriado,
  type Profile,
  type Report,
  type Turma,
} from '../../lib/types'
import { useLembrado } from '../../lib/memoriaTelas'

/**
 * O que as telas do painel compartilham. Carregado uma vez ao entrar no
 * painel (é usado por umas dez pessoas, com tempo, muitas vezes em tela
 * grande) e recarregado por pedaço depois de cada mudança.
 */
interface DadosPainel {
  turmas: Turma[]
  cargos: Cargo[]
  feriados: Feriado[]
  aberturas: AberturaAntecipada[]
  desafios: Challenge[]
  reports: Report[]
  perfis: Profile[]
  alunos: AlunoCadastrado[] | null
  recarregar: {
    turmas: () => Promise<void>
    cargos: () => Promise<void>
    feriados: () => Promise<void>
    aberturas: () => Promise<void>
    desafios: () => Promise<void>
    reports: () => Promise<void>
    /** Perfis e lista de chamada, que mudam juntos. */
    pessoas: () => Promise<void>
  }
}

const Ctx = createContext<DadosPainel | null>(null)

export function usePainel(): DadosPainel {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePainel fora do painel')
  return v
}

function Provider({ children }: { children: ReactNode }) {
  const { api } = useAuth()
  const toast = useToast()
  const [turmas, setTurmas] = useLembrado<Turma[]>('painel:turmas', [])
  const [cargos, setCargos] = useLembrado<Cargo[]>('painel:cargos', [])
  const [feriados, setFeriados] = useLembrado<Feriado[]>('feriados', [])
  const [aberturas, setAberturas] = useLembrado<AberturaAntecipada[]>('aberturas', [])
  const [desafios, setDesafios] = useLembrado<Challenge[]>('desafios', [])
  const [reports, setReports] = useLembrado<Report[]>('painel:reports', [])
  const [perfis, setPerfis] = useLembrado<Profile[]>('painel:perfis', [])
  const [alunos, setAlunos] = useLembrado<AlunoCadastrado[] | null>(
    'painel:alunos',
    null,
  )

  const recarregar = useMemo(
    () => ({
      turmas: async () => setTurmas(await api.listTurmas()),
      cargos: async () => setCargos(await api.listCargos()),
      feriados: async () => setFeriados(await api.listFeriados()),
      aberturas: async () => setAberturas(await api.listAberturas()),
      desafios: async () => setDesafios(await api.listChallenges()),
      reports: async () => setReports(await api.listReports()),
      pessoas: async () => {
        const [a, p] = await Promise.all([api.listAlunosCadastrados(), api.listProfiles()])
        setAlunos(a)
        setPerfis(p)
      },
    }),
    [api],
  )

  useEffect(() => {
    const falhou = (o: string) => (e: unknown) => {
      console.error(`[painel] falha em ${o}`, e)
      toast(`Falha ao carregar ${o}: ${(e as Error).message}`, 'erro')
    }
    void recarregar.turmas().catch(falhou('turmas'))
    void recarregar.cargos().catch(falhou('cargos'))
    void recarregar.feriados().catch(falhou('feriados'))
    void recarregar.aberturas().catch(falhou('aberturas'))
    void recarregar.desafios().catch(falhou('desafios'))
    void recarregar.reports().catch(falhou('denúncias'))
    void recarregar.pessoas().catch(falhou('pessoas'))
  }, [recarregar, toast])

  const valor = useMemo(
    () => ({ turmas, cargos, feriados, aberturas, desafios, reports, perfis, alunos, recarregar }),
    [turmas, cargos, feriados, aberturas, desafios, reports, perfis, alunos, recarregar],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Casca das rotas /organizador/*: só para a organização. */
export function PainelLayout() {
  const { papel, carregando } = useAuth()
  if (carregando) return <Spinner />
  if (papel !== 'organizador') return <Navigate to="/" replace />
  return (
    <Provider>
      <Outlet />
    </Provider>
  )
}

/** Escolher uma pessoa do app (dar aula, dar cargo, entregar distintivo). */
export function EscolherPessoa({
  aberta,
  titulo,
  excluir = [],
  onEscolher,
  onFechar,
}: {
  aberta: boolean
  titulo: ReactNode
  /** Quem não aparece (já tem o cargo, já dá aula…). */
  excluir?: string[]
  onEscolher: (p: Profile) => void
  onFechar: () => void
}) {
  const { perfis } = usePainel()
  const [busca, setBusca] = useState('')
  const fechar = useCallback(() => {
    setBusca('')
    onFechar()
  }, [onFechar])
  const fora = new Set(excluir)
  const lista = perfis
    .filter((p) => !fora.has(p.id) && combinaBusca(busca, [p.nome, p.telefone, ...p.cargos]))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 60)
  return (
    <Folha aberta={aberta} onFechar={fechar} titulo={titulo} alta>
      <div className="sticky top-0 z-10 bg-sf px-4 pb-2">
        <CampoBusca
          placeholder="Buscar pessoa"
          aria-label="Buscar pessoa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="px-3 pb-8">
        {lista.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onEscolher(p)
              setBusca('')
            }}
            className="flex min-h-[58px] w-full items-center gap-3 border-b border-linha p-2 text-left text-ink"
          >
            <Avatar nome={p.nome} url={p.avatar_url} tamanho={42} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-extrabold">{p.nome}</span>
              <span className="truncate text-[13px] text-ink3">
                {[p.cargos[0], turmaLabel(p.turmas)].filter(Boolean).join(' · ') || 'Sem turma'}
              </span>
            </span>
          </button>
        ))}
        {lista.length === 0 && (
          <p className="px-2 py-6 text-center text-[15px] text-ink3">Ninguém encontrado.</p>
        )}
      </div>
    </Folha>
  )
}

/** Rótulo de campo nos formulários do painel. */
export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="px-1 text-sm font-extrabold text-ink2">{rotulo}</span>
      {children}
      {dica && <span className="-mt-0.5 px-1 text-[13px] leading-snug text-ink3">{dica}</span>}
    </div>
  )
}

/** Texto de apoio debaixo do cabeçalho de uma tela do painel. */
export function Dica({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[13px] leading-relaxed text-ink3">{children}</p>
}
