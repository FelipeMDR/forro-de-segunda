import { useState } from 'react'
import { Spinner } from './Spinner'
import { formatRelative } from '../lib/dates'
import type { PerfilStats } from '../lib/perfilStats'
import {
  emojiCargo,
  LIMITE_FAVORITOS,
  type Badge,
  type CheckinFavorito,
  type TurmaMembro,
} from '../lib/types'

/** Turmas + papel na dança, em chips. */
export function TurmaChips({ turmas }: { turmas: TurmaMembro[] }) {
  if (turmas.length === 0) {
    return <p className="mt-1 text-xs text-tinta-500">Turma ainda não definida</p>
  }
  return (
    <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
      {turmas.map((m) => (
        <span
          key={m.turma}
          className="inline-block rounded-full bg-verde-500/15 px-3 py-1 text-xs font-bold text-verde-800"
        >
          {m.papel_danca === 'Condutor(a)' && '🕺 '}
          {m.papel_danca === 'Conduzido(a)' && '💃 '}
          {m.papel_danca ? `${m.papel_danca} ` : ''}
          {m.turma}
        </span>
      ))}
    </div>
  )
}

/** Cargos no projeto — destaque em laranja, acima das turmas. */
export function CargoChips({ cargos }: { cargos: string[] }) {
  if (cargos.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
      {cargos.map((c) => (
        <span
          key={c}
          className="inline-block rounded-full bg-brasa-500/20 px-3 py-1 text-xs font-extrabold text-brasa-700 ring-1 ring-brasa-500/30"
        >
          {emojiCargo(c)} {c}
        </span>
      ))}
    </div>
  )
}

export function StatsRow({ stats }: { stats: PerfilStats | null }) {
  const itens: Array<[string, string, string]> = [
    ['🔥 ' + (stats ? String(stats.streak) : '–'), 'semanas seguidas', 'text-brasa-700'],
    [stats ? String(stats.presencas) : '–', 'presenças', ''],
    [stats ? String(stats.desafios) : '–', 'desafios', ''],
  ]
  return (
    <div className="grid w-full grid-cols-3 gap-2 pt-2">
      {itens.map(([valor, rotulo, cor]) => (
        <div key={rotulo} className="rounded-2xl bg-fundo px-2 py-3 text-center">
          <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
          <p className="text-[10px] font-bold uppercase text-tinta-500">
            {rotulo}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * Galeria dos check-ins favoritos. Miniaturas em grade; tocar numa
 * abre a foto grande com a legenda, a data e — no próprio perfil — a
 * opção de tirar dos favoritos. Sem isso, desfavoritar exigiria achar
 * a publicação lá atrás no feed.
 */
export function FavoritosGrid({
  favoritos,
  vazio,
  mostrarLimite = false,
  onDesfavoritar,
}: {
  favoritos: CheckinFavorito[] | null
  vazio: string
  /** Só no próprio perfil: lembra quantos ainda dá pra guardar. */
  mostrarLimite?: boolean
  /** Só no próprio perfil: sem isso, a galeria é somente leitura. */
  onDesfavoritar?: (id: string) => Promise<void>
}) {
  const [aberto, setAberto] = useState<CheckinFavorito | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  const fechar = () => {
    setAberto(null)
    setConfirmando(false)
  }

  const desfavoritar = async () => {
    if (!aberto || !onDesfavoritar) return
    setRemovendo(true)
    try {
      await onDesfavoritar(aberto.id)
      fechar()
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          ⭐ Favoritos{' '}
          {favoritos && favoritos.length > 0 && `(${favoritos.length})`}
        </h2>
        {mostrarLimite && favoritos && (
          <span className="text-[10px] font-bold text-tinta-400">
            {favoritos.length}/{LIMITE_FAVORITOS}
          </span>
        )}
      </div>

      {favoritos === null ? (
        <Spinner />
      ) : favoritos.length === 0 ? (
        <p className="text-sm text-tinta-500">{vazio}</p>
      ) : (
        <>
          {onDesfavoritar && (
            <p className="text-xs text-tinta-500">
              Toque numa foto para ver de perto ou tirar dos favoritos.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {favoritos.map((f) => (
              <button
                key={f.id}
                onClick={() => setAberto(f)}
                className="overflow-hidden rounded-xl bg-fundo"
                aria-label={
                  f.legenda ?? `Favorito de ${formatRelative(f.criado_em)}`
                }
              >
                {f.foto_url ? (
                  <img
                    src={f.foto_url}
                    alt={f.legenda ?? ''}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center text-2xl">
                    🎞️
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 p-5"
          onClick={fechar}
          role="dialog"
        >
          {aberto.foto_url && (
            <img
              src={aberto.foto_url}
              alt={aberto.legenda ?? ''}
              className="max-h-[60vh] w-auto max-w-full rounded-2xl object-contain"
            />
          )}
          <div className="text-center">
            {aberto.legenda && (
              <p className="text-sm font-bold text-tinta-900">
                {aberto.legenda}
              </p>
            )}
            <p className="text-xs text-tinta-600">
              {formatRelative(aberto.criado_em)}
            </p>
          </div>

          {/* stopPropagation: o clique no fundo fecha, nos botões não */}
          <div
            className="flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {onDesfavoritar &&
              (confirmando ? (
                <>
                  <p className="max-w-xs text-center text-xs text-tinta-600">
                    A foto sai da galeria e volta a ser arquivada com as
                    outras depois de 4 meses.
                  </p>
                  <button
                    className="btn-danger"
                    disabled={removendo}
                    onClick={() => void desfavoritar()}
                  >
                    {removendo ? 'Tirando…' : '⚠️ Confirmar, tirar dos favoritos'}
                  </button>
                </>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => setConfirmando(true)}
                >
                  ⭐ Tirar dos favoritos
                </button>
              ))}
            <button className="btn-ghost" onClick={fechar}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function BadgeGrid({
  badges,
  vazio,
}: {
  badges: Badge[] | null
  vazio: string
}) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
        🎖️ Distintivos {badges && badges.length > 0 && `(${badges.length})`}
      </h2>
      {badges === null ? (
        <Spinner />
      ) : badges.length === 0 ? (
        <p className="text-sm text-tinta-500">{vazio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2.5 rounded-xl bg-fundo px-3 py-2.5"
              title={b.descricao}
            >
              <span className="shrink-0 text-2xl">{b.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold leading-tight">{b.titulo}</p>
                <p className="line-clamp-2 text-[10px] leading-tight text-tinta-500">
                  {b.descricao}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
