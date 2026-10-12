import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import {
  agruparPorTurma,
  contarPorNivel,
  montarForrodex,
  nivelDupla,
  NIVEIS_DUPLA,
  ordenarTurmas,
  type CartaForrodex,
} from '../lib/forrodex'
import type { ParceiroDanca, PerfilPublico } from '../lib/types'

/**
 * Visual de cada nível, como medalha de jogo: a Primeira dança é neutra,
 * e daí em diante bronze, prata e ouro — no anel da foto e na moldura
 * da carta. O degradê cônico imita o reflexo do metal.
 */
const ESTILO_NIVEL: Record<
  number,
  { metal: string | null; anel: string; fundo: string; cor: string; texto: string }
> = {
  1: {
    metal: null,
    anel: '#d6d3cc',
    fundo: '#ffffff',
    cor: '#8a857c',
    texto: 'text-tinta-500',
  },
  2: {
    metal: 'linear-gradient(135deg, #7a4a24, #f3c79a, #a8673a)',
    anel: 'conic-gradient(from 210deg, #7a4a24, #e0a370, #a8673a, #f3c79a, #7a4a24)',
    fundo: '#fbf3ec',
    cor: '#a8673a',
    texto: 'text-[#7a4a24]',
  },
  3: {
    metal: 'linear-gradient(135deg, #7d8590, #ffffff, #a7aeb7)',
    anel: 'conic-gradient(from 210deg, #7d8590, #f4f6f8, #a7aeb7, #ffffff, #7d8590)',
    fundo: '#f3f5f7',
    cor: '#7d8590',
    texto: 'text-[#4f5761]',
  },
  4: {
    metal: 'linear-gradient(135deg, #a8740f, #fff3c4, #d9a21b)',
    anel: 'conic-gradient(from 210deg, #a8740f, #ffe08a, #d9a21b, #fff3c4, #a8740f)',
    fundo: '#fdf6e3',
    cor: '#d9a21b',
    texto: 'text-[#855c08]',
  },
}

/**
 * Pontinhos até o próximo nível: um por noite que o nível pede, cheios
 * os que já foram. No topo, uma estrela no lugar.
 */
function Pontos({ noites }: { noites: number }) {
  const p = nivelDupla(noites)
  if (!p) return null
  const { cor } = ESTILO_NIVEL[p.atual.nivel]
  if (!p.proximo) {
    return (
      <span className="text-xs" style={{ color: cor }} aria-label="Nível máximo">
        ★
      </span>
    )
  }
  const passos = p.proximo.minimo - p.atual.minimo
  const feitos = passos - p.faltam
  return (
    <span
      className="flex justify-center gap-1"
      role="img"
      aria-label={`Faltam ${p.faltam} ${p.faltam === 1 ? 'noite' : 'noites'} para ${p.proximo.nome}`}
      title={`Faltam ${p.faltam} para ${p.proximo.nome}`}
    >
      {Array.from({ length: passos }, (_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i < feitos ? cor : 'rgb(0 5 7 / 0.15)' }}
        />
      ))}
    </span>
  )
}

function Carta({ carta }: { carta: CartaForrodex }) {
  const progresso = nivelDupla(carta.noites)
  const estilo = progresso ? ESTILO_NIVEL[progresso.atual.nivel] : null
  const primeiroNome = carta.nome.split(/\s+/)[0]

  if (!progresso || !estilo) {
    // Não descoberto: a cara fica apagada, mas o nome continua — sem
    // ele não dá para saber quem tirar para dançar.
    return (
      <Link
        to={`/perfil/${carta.user_id}`}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-preto/5 px-2 py-3 text-center"
      >
        <div className="opacity-40 grayscale">
          <Avatar nome={carta.nome} url={carta.avatar_url} tamanho={56} />
        </div>
        <p className="w-full truncate text-xs font-bold text-tinta-500">
          {primeiroNome}
        </p>
        <span className="rounded-full bg-preto/5 px-2 py-0.5 text-[10px] font-bold text-tinta-500">
          ???
        </span>
      </Link>
    )
  }

  // Moldura de metal: o Link pinta o degradê e o miolo cobre tudo
  // menos uma faixa de 3px — borda com degradê não existe em CSS puro.
  return (
    <Link
      to={`/perfil/${carta.user_id}`}
      className={`block rounded-2xl shadow-sm ${estilo.metal ? 'p-[3px]' : 'ring-1 ring-preto/10'}`}
      style={estilo.metal ? { background: estilo.metal } : undefined}
    >
      <div
        className="flex h-full flex-col items-center gap-1 rounded-[13px] px-2 pb-2.5 pt-3.5 text-center"
        style={{ background: estilo.fundo }}
      >
        <div
          className="rounded-full p-1"
          style={{ background: estilo.anel }}
        >
          <div className="rounded-full ring-2 ring-white">
            <Avatar nome={carta.nome} url={carta.avatar_url} tamanho={48} />
          </div>
        </div>
        <p className="mt-1.5 w-full truncate text-xs font-bold">{primeiroNome}</p>
        <p className={`w-full truncate text-[10px] font-extrabold ${estilo.texto}`}>
          {progresso.atual.emoji} {progresso.atual.nome}
        </p>
        <p className="text-[10px] text-tinta-500">
          ×{carta.noites} {carta.noites === 1 ? 'noite' : 'noites'}
        </p>
        <Pontos noites={carta.noites} />
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
    turmas: string[]
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [turma, setTurma] = useState<string | null>(null)
  const [explicacao, setExplicacao] = useState(false)

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
  const porNivel = contarPorNivel(dex.descobertos)

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

        {/* Quantas duplas em cada nível; tocar explica a regra */}
        <button
          type="button"
          aria-expanded={explicacao}
          onClick={() => setExplicacao((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl bg-fundo px-3 py-2 text-sm font-bold"
        >
          <span className="flex gap-3">
            {NIVEIS_DUPLA.map((n, i) => (
              <span key={n.nivel} title={n.nome}>
                {n.emoji} {porNivel[i]}
              </span>
            ))}
          </span>
          <span className="text-xs text-tinta-500">
            níveis {explicacao ? '▴' : '▾'}
          </span>
        </button>
        {explicacao && (
          <div className="space-y-1.5 rounded-xl bg-fundo px-3 py-2.5 text-xs">
            <p className="text-tinta-600">
              Quanto mais noites vocês dançam juntos, mais a carta evolui:
            </p>
            <ul className="space-y-1">
              {NIVEIS_DUPLA.map((n) => (
                <li key={n.nivel} className="flex justify-between">
                  <span className="font-bold">
                    {n.emoji} {n.nome}
                  </span>
                  <span className="text-tinta-500">
                    {n.minimo} {n.minimo === 1 ? 'noite' : 'noites'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-tinta-500">Os níveis zeram a cada semestre.</p>
          </div>
        )}
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
