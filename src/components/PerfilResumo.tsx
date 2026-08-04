import { Spinner } from './Spinner'
import type { PerfilStats } from '../lib/perfilStats'
import { emojiCargo, type Badge, type TurmaMembro } from '../lib/types'

/** Turmas + papel na dança, em chips. */
export function TurmaChips({ turmas }: { turmas: TurmaMembro[] }) {
  if (turmas.length === 0) {
    return <p className="mt-1 text-xs text-stone-500">Turma ainda não definida</p>
  }
  return (
    <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
      {turmas.map((m) => (
        <span
          key={m.turma}
          className="inline-block rounded-full bg-verde-500/15 px-3 py-1 text-xs font-bold text-verde-400"
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
          className="inline-block rounded-full bg-brasa-500/20 px-3 py-1 text-xs font-extrabold text-brasa-300 ring-1 ring-brasa-500/30"
        >
          {emojiCargo(c)} {c}
        </span>
      ))}
    </div>
  )
}

export function StatsRow({ stats }: { stats: PerfilStats | null }) {
  const itens: Array<[string, string, string]> = [
    ['🔥 ' + (stats ? String(stats.streak) : '–'), 'semanas seguidas', 'text-brasa-400'],
    [stats ? String(stats.presencas) : '–', 'presenças', ''],
    [stats ? String(stats.desafios) : '–', 'desafios', ''],
  ]
  return (
    <div className="grid w-full grid-cols-3 gap-2 pt-2">
      {itens.map(([valor, rotulo, cor]) => (
        <div key={rotulo} className="rounded-2xl bg-noite-950 px-2 py-3 text-center">
          <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
          <p className="text-[10px] font-bold uppercase text-stone-500">
            {rotulo}
          </p>
        </div>
      ))}
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
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
        🎖️ Distintivos {badges && badges.length > 0 && `(${badges.length})`}
      </h2>
      {badges === null ? (
        <Spinner />
      ) : badges.length === 0 ? (
        <p className="text-sm text-stone-500">{vazio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2.5 rounded-xl bg-noite-950 px-3 py-2.5"
              title={b.descricao}
            >
              <span className="shrink-0 text-2xl">{b.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold leading-tight">{b.titulo}</p>
                <p className="line-clamp-2 text-[10px] leading-tight text-stone-500">
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
