import { useCallback, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Icone } from './Icone'
import { Spinner } from './Spinner'
import { BotaoIcone, Folha } from './ui'
import { EMOJI_CACA, type ProfessorCaca } from '../lib/caca'
import { formatRelative } from '../lib/dates'
import type { PerfilStats } from '../lib/perfilStats'
import { colecao, conquistado, escolherDestaques } from '../lib/destaques'
import {
  LIMITE_FAVORITOS,
  type Badge,
  type CheckinFavorito,
  type PapelDanca,
  type TurmaMembro,
} from '../lib/types'

/** "Intermediário · Conduzido(a)" */
function rotuloTurma(m: TurmaMembro): string {
  return m.papel_danca ? `${m.turma} · ${m.papel_danca}` : m.turma
}

/**
 * Cargos (pêssego, com contorno: é o reconhecimento mais forte, num chip
 * só) e turmas com o papel na dança. Sem turma, a função escolhida faz
 * as vezes da turma. É por estarem aqui que cargo, turma e função não
 * se repetem como distintivo nos destaques.
 */
export function ChipsPerfil({
  cargos,
  turmas,
  papelPrincipal,
}: {
  cargos: string[]
  turmas: TurmaMembro[]
  papelPrincipal?: PapelDanca | null
}) {
  const funcao = turmas.length === 0 ? papelPrincipal : null
  if (cargos.length === 0 && turmas.length === 0 && !funcao) {
    return <p className="text-[13px] text-ink3">Turma ainda não definida</p>
  }
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {cargos.length > 0 && (
        <span className="rounded-full border-[1.5px] border-preto bg-brasa-300 px-2.5 py-1 text-[13px] font-extrabold text-preto">
          {cargos.join(' · ')}
        </span>
      )}
      {turmas.map((m) => (
        <span key={m.turma} className="rounded-full bg-chip px-2.5 py-1 text-[13px] font-bold">
          {rotuloTurma(m)}
        </span>
      ))}
      {funcao && (
        <span className="rounded-full bg-chip px-2.5 py-1 text-[13px] font-bold">{funcao}</span>
      )}
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

/** Distintivos em duas colunas; os de marco mostram quanto falta. Tocar abre o detalhe. */
export function BadgeGrid({
  badges,
  vazio,
  contagem = false,
  semTitulo = false,
  onAbrirFuncao,
}: {
  badges: Badge[] | null
  vazio: string
  /** Mostra "N conquistados" ao lado do título. */
  contagem?: boolean
  /** Na tela "Todos os distintivos" o título já está no cabeçalho. */
  semTitulo?: boolean
  /** Cartão da caça sem função escolhida: abre a escolha em vez do detalhe. */
  onAbrirFuncao?: () => void
}) {
  const [aberto, setAberto] = useState<Badge | null>(null)
  const fechar = useCallback(() => setAberto(null), [])
  // A caça no nível 0 e o convite à função aparecem, mas não são conquista
  const conquistados = badges?.filter((b) => !b.caca?.pendente).length ?? 0
  return (
    <section className={`flex flex-col gap-2.5 ${semTitulo ? 'pt-1' : 'pt-6'}`}>
      {!semTitulo && (
        <div className="flex items-baseline justify-between px-5">
          <span className="text-[19px] font-extrabold">Distintivos</span>
          {contagem && conquistados > 0 && (
            <span className="whitespace-nowrap text-[13px] text-ink3">
              {conquistados} {conquistados === 1 ? 'conquistado' : 'conquistados'}
            </span>
          )}
        </div>
      )}
      {badges === null ? (
        <Spinner />
      ) : badges.length === 0 ? (
        <p className="px-5 text-sm leading-snug text-ink3">{vazio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-4">
          {badges.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() =>
                b.caca?.abrirFuncao && onAbrirFuncao ? onAbrirFuncao() : setAberto(b)
              }
              aria-haspopup="dialog"
              className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-sf p-3 text-left transition-transform active:scale-[0.97]"
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
                <div className="flex w-full flex-col gap-[5px]">
                  <div className="h-1.5 overflow-hidden rounded-full bg-chip">
                    <div
                      className="h-full rounded-full bg-brasa-500"
                      style={{ width: `${pctProgresso(b.progresso)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-ink3">{b.progresso.rotulo}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <Folha aberta={aberto !== null} onFechar={fechar}>
        {aberto && <DetalheDistintivo b={aberto} onFechar={fechar} />}
      </Folha>
    </section>
  )
}

/**
 * Até 3 distintivos em destaque e, embaixo, a entrada para todos. Os
 * destaques são os que a pessoa escolheu ou, sem escolha, os mais raros
 * (ver `lib/destaques.ts`). Tocar num destaque abre o detalhe.
 */
export function DestaquesPerfil({
  badges,
  salvos,
  vazio,
  todosHref,
  onEditar,
}: {
  badges: Badge[] | null
  salvos: string[] | null | undefined
  vazio: string
  /** Tela "Todos os distintivos" dessa pessoa. */
  todosHref: string
  /** Só no próprio perfil (e com a migração 042): abre a escolha. */
  onEditar?: () => void
}) {
  const [aberto, setAberto] = useState<Badge | null>(null)
  const fechar = useCallback(() => setAberto(null), [])
  const todos = badges ? colecao(badges) : []
  const destaques = badges ? escolherDestaques(badges, salvos) : []
  const nTodos = todos.filter(conquistado).length
  // Prévia do que está em "Todos": primeiro o que não está em destaque
  const previa = [
    ...todos.filter((b) => !destaques.includes(b)),
    ...destaques,
  ].slice(0, 3)

  return (
    <section className="flex flex-col gap-2.5 pt-6">
      <div className="flex items-baseline justify-between px-5">
        <span className="text-[19px] font-extrabold">Destaques</span>
        {onEditar && destaques.length > 0 && (
          <button
            type="button"
            onClick={onEditar}
            aria-haspopup="dialog"
            className="-my-2 -mr-2 flex items-center gap-1 p-2 text-[13px] font-extrabold text-or-t"
          >
            <Icone nome="editar" tamanho={15} traco={2.4} />
            Editar
          </button>
        )}
      </div>
      {badges === null ? (
        <Spinner />
      ) : todos.length === 0 ? (
        <p className="px-5 text-sm leading-snug text-ink3">{vazio}</p>
      ) : (
        <div className="flex flex-col gap-2.5 px-4">
          {destaques.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5">
              {destaques.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setAberto(b)}
                  aria-haspopup="dialog"
                  className="flex flex-col items-center gap-2 rounded-[18px] border border-linha bg-sf px-1.5 pb-3 pt-3.5 text-center transition-transform active:scale-[0.97]"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-chip text-[30px] leading-none">
                    {b.emoji}
                  </span>
                  <span
                    lang="pt"
                    className="line-clamp-2 text-[13px] font-extrabold leading-tight [hyphens:auto] [overflow-wrap:anywhere]"
                  >
                    {b.titulo}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Link
            to={todosHref}
            className="flex items-center gap-3 rounded-[18px] border border-linha bg-sf py-2.5 pl-3 pr-2.5 transition-transform active:scale-[0.98]"
          >
            <span aria-hidden="true" className="flex shrink-0">
              {previa.map((b, i) => (
                <span
                  key={b.id}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-sf bg-chip text-[17px] leading-none ${
                    i > 0 ? '-ml-2.5' : ''
                  }`}
                >
                  {b.emoji}
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-bold">Todos os distintivos</span>
            <span className="text-[15px] font-extrabold text-ink3">{nTodos}</span>
            <Icone nome="avancar" tamanho={18} className="shrink-0 text-ink3" />
          </Link>
        </div>
      )}
      <Folha aberta={aberto !== null} onFechar={fechar}>
        {aberto && <DetalheDistintivo b={aberto} onFechar={fechar} />}
      </Folha>
    </section>
  )
}

function pctProgresso(p: NonNullable<Badge['progresso']>): number {
  return Math.round((p.atual / p.meta) * 100)
}

/** "15 de set. de 2026" — com ano: um marco pode ser de outro semestre. */
function formatarDia(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Atraso de entrada em sequência — cada bloco chega um pouco depois. */
const atraso = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

/**
 * Detalhe de um distintivo, dentro da folha. A animação é curta (menos
 * de 1 s no todo): o emoji estoura, um halo se espalha uma vez, os
 * blocos entram em sequência e a barra se enche. Com "reduzir
 * movimento", tudo já aparece pronto (ver `index.css`).
 */
function DetalheDistintivo({ b, onFechar }: { b: Badge; onFechar: () => void }) {
  const t = b.trilha
  const idxAtual = t ? t.marcos.reduce((acc, m, i) => (t.valor >= m.minimo ? i : acc), -1) : -1
  const proximo = t?.marcos[idxAtual + 1]

  const linhas: Array<{ rotulo: string; valor: string }> = []
  if (b.alcancadoEm) {
    linhas.push({
      rotulo: t ? 'Alcançado em' : 'Concedido em',
      valor: formatarDia(b.alcancadoEm),
    })
  }
  // Semestre encerrado não anda mais: sem próximo marco nem total "até agora"
  if (!b.congelado) {
    if (proximo) linhas.push({ rotulo: 'Próximo marco', valor: `${proximo.emoji} ${proximo.titulo}` })
    if (t) linhas.push({ rotulo: 'Total até agora', valor: `${t.valor} ${t.unidade}` })
  }

  return (
    <div
      className="flex flex-col px-5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <div className="flex justify-end">
        <BotaoIcone icone="fechar" rotulo="Fechar" variante="chip" tamanhoIcone={18} onClick={onFechar} />
      </div>

      <div className="-mt-2 flex flex-col items-center gap-1.5 text-center">
        <div className="relative mb-2.5 flex h-28 w-28 items-center justify-center">
          <span aria-hidden="true" className="distintivo-halo absolute inset-0 rounded-[34px] bg-brasa-500/15" />
          <span className="distintivo-pop relative flex h-[104px] w-[104px] items-center justify-center rounded-[30px] border border-linha bg-chip text-[58px] leading-none">
            {b.emoji}
          </span>
        </div>
        {b.tipo && (
          <span
            className="distintivo-entra text-xs font-extrabold uppercase tracking-[0.08em] text-or-t"
            style={atraso(0.22)}
          >
            {b.tipo}
          </span>
        )}
        <h2
          lang="pt"
          className="distintivo-entra text-[28px] font-extrabold leading-[1.1] tracking-[-0.015em] [hyphens:auto]"
          style={atraso(0.26)}
        >
          {b.titulo}
        </h2>
        <p className="distintivo-entra text-[15px] text-ink2" style={atraso(0.3)}>
          {b.descricao}
        </p>
      </div>

      {t && b.progresso && (
        <div
          className="distintivo-entra mt-[22px] flex flex-col gap-2.5 rounded-[18px] bg-fundo p-4"
          style={atraso(0.34)}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[32px] font-extrabold leading-none">{t.valor}</span>
              <span className="text-sm text-ink3">{t.unidade}</span>
            </span>
            <span className="text-right text-[13px] font-bold text-or-t">{b.progresso.rotulo}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-chip">
            <div
              className="distintivo-enche h-full rounded-full bg-brasa-500"
              style={{ width: `${pctProgresso(b.progresso)}%` }}
            />
          </div>
        </div>
      )}

      {t && idxAtual >= 0 && (
        <div className="distintivo-entra mt-[22px] flex flex-col gap-3" style={atraso(0.4)}>
          <span className="text-[15px] font-extrabold">
            Trilha · nível {idxAtual + 1} de {t.marcos.length}
          </span>
          <div className="relative">
            <span aria-hidden="true" className="absolute inset-x-[22px] top-[21px] h-[3px] rounded-full bg-chip" />
            <span
              aria-hidden="true"
              className="distintivo-enche absolute left-[22px] top-[21px] h-[3px] rounded-full bg-brasa-500"
              style={{ width: `calc((100% - 44px) * ${idxAtual / (t.marcos.length - 1)})` }}
            />
            <ol className="relative flex justify-between">
              {t.marcos.map((m, i) => {
                const estado =
                  i < idxAtual ? 'feito' : i === idxAtual ? 'atual' : i === idxAtual + 1 ? 'proximo' : 'futuro'
                return (
                  <li
                    key={m.minimo}
                    className="distintivo-entra flex w-11 flex-col items-center gap-1.5"
                    style={atraso(0.42 + i * 0.07)}
                    aria-label={`${m.titulo}${i <= idxAtual ? ', alcançado' : ''}`}
                  >
                    {/* Fundo sólido por baixo: o trilho não aparece através da bolinha */}
                    <span aria-hidden="true" className="rounded-full bg-sf">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-[22px] leading-none ${
                          estado === 'feito'
                            ? 'bg-brasa-500/15'
                            : estado === 'atual'
                              ? 'bg-brasa-500/15 shadow-[0_0_0_4px_rgb(222_83_0/0.15)] ring-2 ring-brasa-500'
                              : estado === 'proximo'
                                ? 'border-2 border-dashed border-ink3/70'
                                : 'bg-chip'
                        }`}
                      >
                        <span className={estado === 'futuro' ? 'opacity-45' : ''}>{m.emoji}</span>
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-xs font-extrabold ${estado === 'atual' ? 'text-or-t' : 'text-ink3'}`}
                    >
                      {m.minimo}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {/* No nível 4 (🏆) a equipe toda já foi: as listas não dizem mais nada */}
      {b.caca && !b.caca.abrirFuncao && b.emoji !== EMOJI_CACA.equipe && (
        <div className="distintivo-entra mt-[22px] flex flex-col gap-4" style={atraso(0.44)}>
          {b.caca.pegos.length > 0 && (
            <ListaProfessores titulo="Já dançou com" pessoas={b.caca.pegos} onFechar={onFechar} />
          )}
          {b.caca.faltam.length > 0 && (
            <ListaProfessores titulo="Faltam" pessoas={b.caca.faltam} faltando onFechar={onFechar} />
          )}
        </div>
      )}

      {linhas.length > 0 && (
        <dl className="distintivo-entra mt-[22px] flex flex-col border-t border-linha" style={atraso(0.48)}>
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex items-baseline justify-between gap-4 border-b border-linha py-3">
              <dt className="text-sm text-ink3">{l.rotulo}</dt>
              <dd className="text-right text-sm font-bold">{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {b.regra && (
        <p
          className="distintivo-entra mt-4 flex items-start gap-2.5 text-[13px] leading-[1.45] text-ink2"
          style={atraso(0.54)}
        >
          <Icone nome="info" tamanho={18} traco={2} className="mt-px shrink-0 text-ink3" />
          {b.regra}
        </p>
      )}
    </div>
  )
}

/** Professores da caça no detalhe: quem já foi (avatar cheio) e quem falta (tracejado). */
function ListaProfessores({
  titulo,
  pessoas,
  faltando = false,
  onFechar,
}: {
  titulo: string
  pessoas: ProfessorCaca[]
  faltando?: boolean
  onFechar: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[15px] font-extrabold">
        {titulo} · {pessoas.length}
      </span>
      <ul className="flex flex-wrap gap-x-2 gap-y-3">
        {pessoas.map((p) => (
          <li key={p.user_id}>
            <Link
              to={`/perfil/${p.user_id}`}
              onClick={onFechar}
              className="flex w-14 flex-col items-center gap-1.5"
            >
              {faltando ? (
                <span className="rounded-full border-2 border-dashed border-ink3/70 p-[3px]">
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={42} borda={false} className="opacity-60" />
                </span>
              ) : (
                <span className="p-[5px]">
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={42} />
                </span>
              )}
              <span
                className={`w-full truncate text-center text-xs font-bold ${faltando ? 'text-ink3' : ''}`}
              >
                {p.nome.split(' ')[0]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
