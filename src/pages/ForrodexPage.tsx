import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import {
  agruparPorTurma,
  montarForrodex,
  ordenarTurmas,
  type CartaForrodex,
} from '../lib/forrodex'
import type { ParceiroDanca, PerfilPublico } from '../lib/types'

function Carta({ carta }: { carta: CartaForrodex }) {
  const descoberto = carta.noites > 0
  const primeiroNome = carta.nome.split(/\s+/)[0]
  return (
    <Link
      to={`/perfil/${carta.user_id}`}
      className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition ${
        descoberto ? 'bg-papel shadow-sm' : 'bg-preto/5'
      }`}
    >
      {/* Não descoberto: a cara fica apagada, mas o nome continua —
          sem ele não dá para saber quem tirar para dançar. */}
      <div className={descoberto ? '' : 'opacity-40 grayscale'}>
        <Avatar nome={carta.nome} url={carta.avatar_url} tamanho={56} />
      </div>
      <p
        className={`w-full truncate text-xs font-bold ${
          descoberto ? '' : 'text-tinta-500'
        }`}
      >
        {primeiroNome}
      </p>
      {descoberto ? (
        <span className="rounded-full bg-brasa-500/20 px-2 py-0.5 text-[10px] font-extrabold text-brasa-700">
          ×{carta.noites} {carta.noites === 1 ? 'noite' : 'noites'}
        </span>
      ) : (
        <span className="rounded-full bg-preto/5 px-2 py-0.5 text-[10px] font-bold text-tinta-500">
          ???
        </span>
      )}
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
    turmas: string[]
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [turma, setTurma] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    void (async () => {
      try {
        const ultimoEncerramento = await api
          .inicioSemestreAtual()
          .catch(() => null)
        const desde =
          ultimoEncerramento ?? profile?.criado_em ?? new Date(0).toISOString()
        const [perfis, parceiros, turmas] = await Promise.all([
          api.listPerfisPublicos(),
          api.parceirosDe(userId, desde),
          api.listTurmas(),
        ])
        if (!cancelado) {
          setDados({ perfis, parceiros, turmas: turmas.map((t) => t.nome) })
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
        ? montarForrodex(dados.perfis, dados.parceiros, userId, turma)
        : null,
    [dados, userId, turma],
  )
  // Em "Todos", a grade vira uma seção por turma
  const secoes = useMemo(
    () =>
      dados && userId && !turma
        ? agruparPorTurma(dados.perfis, dados.parceiros, userId, turmas)
        : null,
    [dados, userId, turma, turmas],
  )

  if (erro) return <ErrorState erro={erro} onRetry={() => navigate(0)} />
  if (!dex) return <Spinner texto="Abrindo a Forródex…" />

  const pct = dex.total > 0 ? Math.round((dex.descobertos.length / dex.total) * 100) : 0

  return (
    <div className="space-y-4">
      <button
        className="text-sm font-bold text-tinta-600"
        onClick={() => navigate(-1)}
      >
        ← Voltar
      </button>

      <div className="card space-y-3 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-azul-700">
            Forródex · neste semestre
          </p>
          <h1 className="text-2xl font-extrabold">
            {dex.descobertos.length}{' '}
            <span className="text-base font-bold text-tinta-500">
              de {dex.total} {dex.total === 1 ? 'descoberto' : 'descobertos'}
            </span>
          </h1>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-preto/10"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da Forródex"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brasa-500 to-verde-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-tinta-500">
          Conta dupla confirmada pelos dois lados. Zera a cada semestre.
        </p>
      </div>

      {turmas.length > 0 && (
        <div className="rolagem-lateral -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
          {[null, ...turmas].map((t) => {
            const ativo = turma === t
            return (
              <button
                key={t ?? 'todos'}
                type="button"
                aria-pressed={ativo}
                onClick={() => setTurma(t)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  ativo
                    ? 'bg-brasa-500 text-white'
                    : 'bg-papel text-tinta-600 ring-1 ring-preto/10'
                }`}
              >
                {t ?? 'Todos'}
              </button>
            )
          })}
        </div>
      )}

      {dex.total === 0 ? (
        turma ? (
          <EmptyState
            emoji="🔍"
            titulo="Ninguém nessa turma ainda"
            texto="Quando a turma tiver gente, ela aparece aqui."
          />
        ) : (
          <EmptyState
            emoji="🪗"
            titulo="Semestre encerrado"
            texto="A Forródex volta com as turmas novas. Até lá, bom descanso!"
          />
        )
      ) : secoes ? (
        secoes.map((s) => (
          <section key={s.turma ?? 'sem-turma'} className="space-y-2">
            <h2 className="flex items-baseline justify-between px-1">
              <span className="text-sm font-extrabold">
                {s.turma ?? 'Sem turma'}
              </span>
              <span className="text-xs font-bold text-tinta-500">
                {s.descobertos.length} de {s.total}
              </span>
            </h2>
            <GradeCartas cartas={[...s.descobertos, ...s.faltam]} />
          </section>
        ))
      ) : (
        <GradeCartas cartas={[...dex.descobertos, ...dex.faltam]} />
      )}
    </div>
  )
}
