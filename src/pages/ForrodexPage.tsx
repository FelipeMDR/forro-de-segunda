import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { Cabecalho, ChipEscolha } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  agruparPorTurma,
  carregarParceiros,
  contarPorNivel,
  montarForrodex,
  nivelDupla,
  NIVEIS_DUPLA,
  ordenarTurmas,
  type CartaForrodex,
} from '../lib/forrodex'
import { useEstiloNivel, type EstiloNivel } from '../lib/metais'
import type { ParceiroDanca, PerfilPublico } from '../lib/types'

/** Bolinha com o metal do nível, para a contagem e a explicação. */
function Metal({ estilo }: { estilo: EstiloNivel }) {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
      style={{ background: estilo.anel }}
      aria-hidden
    />
  )
}

/**
 * Pontinhos até o próximo nível: um por noite que o nível pede, cheios
 * os que já foram. No topo, uma estrela no lugar.
 */
function Pontos({ noites, estilo }: { noites: number; estilo: EstiloNivel }) {
  const p = nivelDupla(noites)
  if (!p) return null
  if (!p.proximo) {
    return (
      <span className="text-[13px] leading-none" style={{ color: estilo.texto }} aria-label="Nível máximo">
        ★
      </span>
    )
  }
  const passos = p.proximo.minimo - p.atual.minimo
  const feitos = passos - p.faltam
  return (
    <span
      className="flex justify-center gap-1 pt-[3px]"
      role="img"
      aria-label={`Faltam ${p.faltam} ${p.faltam === 1 ? 'noite' : 'noites'} para ${p.proximo.nome}`}
    >
      {Array.from({ length: passos }, (_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i < feitos ? estilo.texto : 'var(--line)' }}
        />
      ))}
    </span>
  )
}

function Carta({ carta }: { carta: CartaForrodex }) {
  const estiloDe = useEstiloNivel()
  const progresso = nivelDupla(carta.noites)
  const primeiroNome = carta.nome.split(/\s+/)[0]

  if (!progresso) {
    // Não descoberto: a cara fica apagada, mas o nome continua — sem
    // ele não dá para saber quem tirar para dançar.
    return (
      <Link
        to={`/perfil/${carta.user_id}`}
        className="flex flex-col items-center gap-1.5 rounded-[18px] bg-chip px-1.5 pb-3 pt-3.5 text-center"
      >
        <span className="opacity-60 grayscale">
          <Avatar nome={carta.nome} url={carta.avatar_url} tamanho={58} borda={false} />
        </span>
        <span className="w-full truncate text-sm font-bold text-ink3">{primeiroNome}</span>
        <span className="rounded-full bg-chip px-[9px] py-0.5 text-[11px] font-extrabold text-ink3">
          ???
        </span>
      </Link>
    )
  }

  const e = estiloDe(progresso.atual.nivel)
  // Moldura de metal: o link pinta o degradê e o miolo cobre tudo menos
  // uma faixa — borda com degradê não existe em CSS puro.
  return (
    <Link
      to={`/perfil/${carta.user_id}`}
      className="block rounded-[18px] shadow-[0_2px_6px_rgba(0,5,7,.12)]"
      style={{ padding: e.moldura ? 3 : 1, background: e.moldura ?? 'var(--line)' }}
    >
      <div
        className="flex h-full flex-col items-center gap-[3px] rounded-[15px] px-1.5 pb-2.5 pt-3.5 text-center"
        style={{ background: e.miolo }}
      >
        <span className="flex rounded-full p-1" style={{ background: e.anel }}>
          <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${e.miolo}` }}>
            <Avatar nome={carta.nome} url={carta.avatar_url} tamanho={50} borda={false} />
          </span>
        </span>
        <span className="mt-[5px] w-full truncate text-sm font-extrabold">{primeiroNome}</span>
        <span className="w-full truncate text-[11px] font-extrabold" style={{ color: e.texto }}>
          {progresso.atual.nome}
        </span>
        <span className="text-[11px] text-ink3">
          ×{carta.noites} {carta.noites === 1 ? 'noite' : 'noites'}
        </span>
        <Pontos noites={carta.noites} estilo={e} />
      </div>
    </Link>
  )
}

function GradeCartas({ cartas }: { cartas: CartaForrodex[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {cartas.map((c) => (
        <Carta key={c.user_id} carta={c} />
      ))}
    </div>
  )
}

/**
 * Forródex: a coleção de gente com quem dancei neste semestre.
 *
 * Zera a cada "Encerrar semestre" (mesmo corte da retrospectiva), ao
 * contrário do contador "duplas" do perfil, que é histórico completo.
 */
export function ForrodexPage() {
  const { api, userId, profile } = useAuth()
  const navigate = useNavigate()
  const [dados, setDados] = useState<{
    perfis: PerfilPublico[]
    parceiros: ParceiroDanca[]
    universo: Set<string> | null
    turmas: string[]
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [turma, setTurma] = useState<string | null>(null)
  const [explicacao, setExplicacao] = useState(false)
  const estiloDe = useEstiloNivel()

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    void (async () => {
      try {
        const [perfis, { parceiros, universo }, turmas] = await Promise.all([
          api.listPerfisPublicos(),
          carregarParceiros(api, userId, profile?.criado_em ?? new Date(0).toISOString()),
          api.listTurmas(),
        ])
        if (!cancelado) {
          setDados({ perfis, parceiros, universo, turmas: turmas.map((t) => t.nome) })
        }
      } catch (e) {
        if (cancelado) return
        console.error('[forrodex] falha ao carregar', e)
        setErro((e as Error).message || 'Erro desconhecido')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [api, userId, profile?.criado_em])

  const turmas = useMemo(
    () => (dados ? ordenarTurmas(dados.turmas) : []),
    [dados],
  )
  const dex = useMemo(
    () =>
      dados && userId
        ? montarForrodex(dados.perfis, dados.parceiros, userId, turma, dados.universo)
        : null,
    [dados, userId, turma],
  )
  // Em "Todos", a grade vira uma seção por turma
  const secoes = useMemo(
    () =>
      dados && userId && !turma
        ? agruparPorTurma(dados.perfis, dados.parceiros, userId, turmas, dados.universo)
        : null,
    [dados, userId, turma, turmas],
  )

  if (erro) {
    return (
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => navigate(0)} />
      </div>
    )
  }
  if (!dex) return <Spinner texto="Abrindo a Forródex…" />

  const pct = dex.total > 0 ? Math.round((dex.descobertos.length / dex.total) * 100) : 0
  const porNivel = contarPorNivel(dex.descobertos)

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Forródex" fallback="/perfil" />

      <div className="mx-4 mb-3.5 mt-2 flex flex-col gap-3 rounded-[22px] border border-linha bg-sf p-[18px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-extrabold uppercase tracking-[.06em] text-bl-t">
            Forródex · neste semestre
          </span>
          <span className="text-[30px] font-extrabold leading-[1.05]">
            {dex.descobertos.length}{' '}
            <span className="text-base font-bold text-ink3">
              de {dex.total} {dex.total === 1 ? 'descoberto' : 'descobertos'}
            </span>
          </span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-chip"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da Forródex"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brasa-500 to-verde-500 transition-[width] duration-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[13px] text-ink3">
          Conta dupla confirmada pelos dois lados. Zera a cada semestre.
        </span>

        {/* Quantas duplas em cada nível; tocar explica a regra */}
        <button
          type="button"
          aria-expanded={explicacao}
          onClick={() => setExplicacao((v) => !v)}
          className="flex h-11 items-center justify-between rounded-[14px] bg-chip px-3 text-[15px] font-extrabold text-ink"
        >
          <span className="flex gap-3.5">
            {NIVEIS_DUPLA.map((n, i) => (
              <span key={n.nivel} title={n.nome} className="flex items-center gap-1.5">
                <Metal estilo={estiloDe(n.nivel)} />
                {porNivel[i]}
              </span>
            ))}
          </span>
          <span className="text-[13px] font-bold text-ink3">níveis {explicacao ? '▴' : '▾'}</span>
        </button>
        {explicacao && (
          <div className="anima-aparece flex flex-col gap-2 rounded-[14px] bg-chip p-3 text-sm">
            <span className="text-ink2">
              Quanto mais noites vocês dançam juntos, mais a carta evolui:
            </span>
            {NIVEIS_DUPLA.map((n) => (
              <div key={n.nivel} className="flex justify-between">
                <span className="flex items-center gap-2 font-extrabold">
                  <Metal estilo={estiloDe(n.nivel)} />
                  {n.nome}
                </span>
                <span className="text-ink3">
                  {n.minimo} {n.minimo === 1 ? 'noite' : 'noites'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {turmas.length > 0 && (
        <div className="sem-barra flex gap-2 overflow-x-auto px-4 pb-4">
          {[null, ...turmas].map((t) => (
            <ChipEscolha
              key={t ?? 'todas'}
              ativo={turma === t}
              onClick={() => setTurma(t)}
              className="h-10"
            >
              {t ?? 'Todas'}
            </ChipEscolha>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5 px-4">
        {dex.total === 0 ? (
          <p className="rounded-[20px] border border-linha bg-sf px-5 py-8 text-center text-[15px] leading-snug text-ink3">
            {turma
              ? 'Ninguém nessa turma ainda. Quando a turma tiver gente, ela aparece aqui.'
              : dados?.universo
                ? 'Ninguém por aqui ainda. Quando a galera chegar, a Forródex enche.'
                : 'Semestre encerrado. A Forródex volta com as turmas novas — até lá, bom descanso!'}
          </p>
        ) : secoes ? (
          secoes.map((s) => (
            <section key={s.turma ?? 'sem-turma'} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[15px] font-extrabold">{s.turma ?? 'Sem turma'}</span>
                <span className="text-[13px] font-bold text-ink3">
                  {s.descobertos.length} de {s.total}
                </span>
              </div>
              <GradeCartas cartas={[...s.descobertos, ...s.faltam]} />
            </section>
          ))
        ) : (
          <GradeCartas cartas={[...dex.descobertos, ...dex.faltam]} />
        )}
      </div>
    </div>
  )
}
