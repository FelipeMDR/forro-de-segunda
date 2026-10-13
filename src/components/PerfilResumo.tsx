import { Link } from 'react-router-dom'
import { Spinner } from './Spinner'
import { formatRelative } from '../lib/dates'
import type { PerfilStats } from '../lib/perfilStats'
import {
  LIMITE_FAVORITOS,
  type Badge,
  type CheckinFavorito,
  type TurmaMembro,
} from '../lib/types'

/** "Intermediário · Conduzido(a)" */
function rotuloTurma(m: TurmaMembro): string {
  return m.papel_danca ? `${m.turma} · ${m.papel_danca}` : m.turma
}

/**
 * Cargos (pêssego, com contorno: é o reconhecimento mais forte) e
 * turmas com o papel na dança, numa fileira só.
 */
export function ChipsPerfil({
  cargos,
  turmas,
}: {
  cargos: string[]
  turmas: TurmaMembro[]
}) {
  if (cargos.length === 0 && turmas.length === 0) {
    return <p className="text-[13px] text-ink3">Turma ainda não definida</p>
  }
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {cargos.map((c) => (
        <span
          key={c}
          className="rounded-full border-[1.5px] border-preto bg-brasa-300 px-2.5 py-1 text-[13px] font-extrabold text-preto"
        >
          {c}
        </span>
      ))}
      {turmas.map((m) => (
        <span key={m.turma} className="rounded-full bg-chip px-2.5 py-1 text-[13px] font-bold">
          {rotuloTurma(m)}
        </span>
      ))}
    </div>
  )
}

/** Números do perfil num cartão só, separados por fios. */
export function StatsRow({
  stats,
  duplasHref,
  semDesafios = false,
}: {
  stats: PerfilStats | null
  /** Só no próprio perfil: o número de duplas abre a Forródex. */
  duplasHref?: string
  /** Perfil de outra pessoa: três números, sem desafios. */
  semDesafios?: boolean
}) {
  const v = (n: number | undefined) => (stats && n !== undefined ? String(n) : '–')
  const itens: Array<{ valor: string; rotulo: string; destaque?: boolean; href?: string }> = [
    { valor: v(stats?.streak), rotulo: 'semanas seguidas', destaque: true },
    { valor: v(stats?.presencas), rotulo: 'presenças' },
    ...(semDesafios ? [] : [{ valor: v(stats?.desafios), rotulo: 'desafios' }]),
    // Rodízio: pessoas diferentes, não número de danças
    { valor: v(stats?.parceiros), rotulo: 'duplas', href: duplasHref },
  ]
  return (
    <div
      className="grid rounded-[20px] border border-linha bg-sf"
      style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
    >
      {itens.map((it, i) => {
        const conteudo = (
          <>
            <span className={`text-2xl font-extrabold ${it.destaque ? 'text-or-t' : ''}`}>
              {it.valor}
            </span>
            <span className="text-center text-xs leading-tight text-ink3">{it.rotulo}</span>
          </>
        )
        const classe = `flex flex-col items-center gap-0.5 px-1 py-3.5 ${
          i > 0 ? 'border-l border-linha' : ''
        }`
        return it.href ? (
          <Link key={it.rotulo} to={it.href} className={classe} aria-label="Abrir a Forródex">
            {conteudo}
          </Link>
        ) : (
          <div key={it.rotulo} className={classe}>
            {conteudo}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Galeria dos check-ins favoritos, em 4:5 como no feed. Tocar numa abre
 * os favoritos como um feed (`FavoritosPage`), já na foto tocada.
 */
export function FavoritosGrid({
  userId,
  favoritos,
  vazio,
  mostrarLimite = false,
}: {
  /** Dono dos favoritos — para onde a miniatura leva. */
  userId: string
  favoritos: CheckinFavorito[] | null
  vazio: string
  /** Só no próprio perfil: lembra quantos ainda dá pra guardar. */
  mostrarLimite?: boolean
}) {
  return (
    <section className="flex flex-col gap-3 px-4 pt-6">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[19px] font-extrabold">Favoritos</span>
        {mostrarLimite && favoritos && (
          <span className="text-[13px] text-ink3">
            {favoritos.length} de {LIMITE_FAVORITOS} · não são apagados
          </span>
        )}
      </div>
      {favoritos === null ? (
        <Spinner />
      ) : favoritos.length === 0 ? (
        <p className="px-1 text-sm leading-snug text-ink3">{vazio}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
          {favoritos.map((f) => (
            <Link
              key={f.id}
              to={`/perfil/${userId}/favoritos?foto=${f.id}`}
              aria-label={f.legenda ?? `Favorito de ${formatRelative(f.criado_em)}`}
            >
              {f.foto_url ? (
                <img
                  src={f.foto_url}
                  alt={f.legenda ?? ''}
                  loading="lazy"
                  className="aspect-[4/5] w-full bg-sf2 object-cover"
                />
              ) : (
                <span className="listras block aspect-[4/5] w-full bg-marinho-600" />
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/** Distintivos em duas colunas; os de marco mostram quanto falta. */
export function BadgeGrid({
  badges,
  vazio,
  contagem = false,
}: {
  badges: Badge[] | null
  vazio: string
  /** Mostra "N conquistados" ao lado do título. */
  contagem?: boolean
}) {
  return (
    <section className="flex flex-col gap-2.5 pt-6">
      <div className="flex items-baseline justify-between px-5">
        <span className="text-[19px] font-extrabold">Distintivos</span>
        {contagem && badges && badges.length > 0 && (
          <span className="whitespace-nowrap text-[13px] text-ink3">
            {badges.length} {badges.length === 1 ? 'conquistado' : 'conquistados'}
          </span>
        )}
      </div>
      {badges === null ? (
        <Spinner />
      ) : badges.length === 0 ? (
        <p className="px-5 text-sm leading-snug text-ink3">{vazio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-4">
          {badges.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-sf p-3"
              title={b.descricao}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-chip text-[26px] leading-none">
                  {b.emoji}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span lang="pt" className="text-sm font-extrabold leading-tight [hyphens:auto] [overflow-wrap:anywhere]">
                    {b.titulo}
                  </span>
                  <span className="line-clamp-2 text-xs leading-tight text-ink3">{b.descricao}</span>
                </div>
              </div>
              {b.progresso && (
                <div className="flex flex-col gap-[5px]">
                  <div className="h-1.5 overflow-hidden rounded-full bg-chip">
                    <div
                      className="h-full rounded-full bg-brasa-500"
                      style={{
                        width: `${Math.round((b.progresso.atual / b.progresso.meta) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-ink3">{b.progresso.rotulo}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
