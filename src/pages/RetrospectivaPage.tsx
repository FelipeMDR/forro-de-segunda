import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Icone } from '../components/Icone'
import { CapaAlbum } from '../components/LinhaPedido'
import { LogoWordmark } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { diasSuspensos, mapaAberturas } from '../lib/dates'
import { nivelDupla } from '../lib/forrodex'
import { carregarPerfilStats } from '../lib/perfilStats'
import {
  inicioDoSemestreEncerrado,
  montarRetrospectiva,
  musicaMaisTocada,
  type MusicaDoSemestre,
  type Retrospectiva,
} from '../lib/retrospectiva'
import { codigoDoSemestre, desenharStory } from '../lib/storyRetrospectiva'
import { REACTION_TYPES, type Badge, type ParceiroDanca } from '../lib/types'

/** Quanto tempo cada slide fica na tela antes de passar sozinho. */
const DURACAO_MS = 5500

interface Slide {
  id: string
  bg: string
  fg: string
  conteudo: ReactNode
}

export function RetrospectivaPage() {
  const { api, userId, profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [r, setR] = useState<Retrospectiva | null>(null)
  const [parceiros, setParceiros] = useState<ParceiroDanca[]>([])
  const [musica, setMusica] = useState<MusicaDoSemestre | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [porEmoji, setPorEmoji] = useState<Record<string, number> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [t, setT] = useState(0)
  const [gerando, setGerando] = useState(false)
  const inicio = useRef(Date.now())

  useEffect(() => {
    if (!userId || !profile) return
    let cancelado = false
    void (async () => {
      try {
        // A retrospectiva só aparece com o semestre encerrado: o período
        // vai do penúltimo "Encerrar semestre" até o último. Sem
        // penúltimo, cai para quando a conta foi criada — melhor que
        // chutar pelo calendário civil.
        const encerramentos = await api
          .encerramentosDeSemestre()
          .catch(() => [] as string[])
        const desde = inicioDoSemestreEncerrado(encerramentos, profile.criado_em)
        const [checkins, ps, desafios, feriados, aberturas, tocadas, stats] = await Promise.all([
          api.checkinsComReacoes(userId, desde),
          // Até o encerramento: a dupla de depois já é do semestre novo
          api
            .parceirosDe(userId, desde, encerramentos.at(-1))
            .catch(() => [] as ParceiroDanca[]),
          api.listChallenges().catch(() => []),
          api.listFeriados().catch(() => []),
          api.listAberturas().catch(() => []),
          // Sem a migração 029 a tabela não existe — o slide some
          api.musicasTocadasDesde(userId, desde).catch(() => []),
          carregarPerfilStats(api, userId, profile.turmas, profile.cargos).catch(() => null),
        ])
        if (cancelado) return
        const retro = montarRetrospectiva(checkins, ps, new Date(desde), {
          desafios,
          suspensos: diasSuspensos(feriados),
          aberturas: mapaAberturas(aberturas),
        })
        setParceiros([...ps].sort((a, b) => b.noites - a.noites))
        setMusica(musicaMaisTocada(tocadas))
        setBadges(stats?.badges ?? [])
        setR(retro)
        inicio.current = Date.now()
        // As reações por emoji da foto destaque (o resumo só tem o total)
        if (retro.destaque) {
          const foto = await api.getCheckin(retro.destaque.id).catch(() => null)
          if (!cancelado && foto) {
            const conta: Record<string, number> = {}
            for (const x of foto.reacoes) conta[x.tipo] = (conta[x.tipo] ?? 0) + 1
            setPorEmoji(conta)
          }
        }
      } catch (e) {
        if (cancelado) return
        console.error('[retrospectiva] falha ao carregar', e)
        setErro((e as Error).message || 'Erro desconhecido')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [api, userId, profile])

  const codigo = r ? codigoDoSemestre(new Date(r.desde)) : ''
  const primeiroNome = profile?.nome.split(/\s+/)[0] ?? ''
  const top = parceiros.slice(0, 5)

  const compartilhar = async (postar: boolean) => {
    if (!r) return
    setGerando(true)
    try {
      const blob = await desenharStory({
        codigo,
        noites: r.presencas,
        pessoas: r.parceiros,
        topDuplas: top.map((p) => p.nome),
        musicas: musica?.total ?? 0,
        distintivos: badges.length,
        fotoUrl: r.destaque?.foto_url || null,
      })
      const arquivo = new File([blob], `retrospectiva-${codigo}.png`, { type: 'image/png' })
      // No celular, compartilhar manda direto para o Instagram; no
      // computador não existe, então baixa o arquivo.
      if (postar && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: 'Minha retrospectiva no Forró de Segunda' })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = arquivo.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(
        postar
          ? 'Imagem 1080×1920 salva. Abra o Instagram e poste no story.'
          : 'Imagem 1080×1920 salva no aparelho',
      )
    } catch (e) {
      // Cancelar o compartilhamento não é erro
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'erro')
    } finally {
      setGerando(false)
    }
  }

  const slides = useMemo<Slide[]>(() => {
    if (!r) return []
    const lista: Slide[] = []
    const dupla = parceiros[0]
    const nivel = dupla ? nivelDupla(dupla.noites) : null

    lista.push({
      id: 'abertura',
      bg: '#DE5300',
      fg: '#000507',
      conteudo: (
        <div className="flex flex-1 flex-col justify-center gap-3.5">
          <div
            aria-hidden
            className="absolute left-1/2 top-[42%] -ml-[450px] -mt-[450px] h-[900px] w-[900px] rounded-full"
            style={{
              background: 'repeating-conic-gradient(rgba(0,5,7,.09) 0 7deg,transparent 7deg 20deg)',
              animation: 'gira 40s linear infinite',
            }}
          />
          <div className="relative -rotate-[4deg] self-center">
            <div
              className="rounded-[26px] border-[3px] border-preto bg-branco px-[18px] py-4 shadow-[0_7px_0_#000507]"
              style={{ animation: 'estoura .8s cubic-bezier(.2,1.3,.4,1) .15s both' }}
            >
              <LogoWordmark largura={250} prioridade />
            </div>
          </div>
          <span className="relative mt-[26px] text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .6s ease .55s both' }}>
            Sua retrospectiva
          </span>
          <span className="relative text-[clamp(72px,26vw,104px)] font-extrabold leading-[.85] tracking-[-.05em]" style={{ animation: 'sobe .6s ease .7s both' }}>
            {codigo}
          </span>
          <span className="relative text-xl font-bold leading-tight" style={{ animation: 'sobe .6s ease .9s both' }}>
            {primeiroNome}, bora relembrar o seu semestre no salão?
          </span>
        </div>
      ),
    })

    lista.push({
      id: 'noites',
      bg: '#0391D5',
      fg: '#000507',
      conteudo: (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
            Você foi dançar em
          </span>
          <span className="text-[clamp(120px,45vw,200px)] font-extrabold leading-[.8] tracking-[-.06em]" style={{ animation: 'estoura .8s cubic-bezier(.2,1.3,.4,1) .25s both' }}>
            {r.presencas}
          </span>
          <span className="text-[32px] font-extrabold" style={{ animation: 'sobe .5s ease .5s both' }}>
            {r.presencas === 1 ? 'noite de forró' : 'noites de forró'}
          </span>
          {r.presencas > 0 && (
            <div className="mt-2 grid grid-cols-10 gap-[7px]">
              {Array.from({ length: Math.min(r.presencas, 40) }, (_, i) => (
                <span
                  key={i}
                  className="aspect-square rounded-full border-2 border-preto"
                  style={{
                    background: ['#DE5300', '#9BC22D', '#F5F4F2'][i % 3],
                    animation: `estoura .4s ease ${0.6 + i * 0.05}s both`,
                  }}
                />
              ))}
            </div>
          )}
          {r.streak > 1 && (
            <span className="text-lg font-bold leading-snug" style={{ animation: 'sobe .5s ease 1.6s both' }}>
              Sua maior sequência: {r.streak} semanas seguidas.
            </span>
          )}
        </div>
      ),
    })

    if (parceiros.length > 0) {
      lista.push({
        id: 'pessoas',
        bg: '#9BC22D',
        fg: '#000507',
        conteudo: (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
              Você dançou com
            </span>
            <div className="flex max-w-[330px] flex-wrap gap-1.5">
              {parceiros.slice(0, 24).map((p, i) => (
                <span key={p.user_id} style={{ animation: `estoura .45s cubic-bezier(.2,1.4,.4,1) ${0.2 + i * 0.05}s both` }}>
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={46} />
                </span>
              ))}
            </div>
            <span className="text-[clamp(96px,36vw,140px)] font-extrabold leading-[.85] tracking-[-.06em]" style={{ animation: 'estoura .7s cubic-bezier(.2,1.3,.4,1) 1.3s both' }}>
              {r.parceiros}
            </span>
            <span className="text-[26px] font-extrabold leading-tight" style={{ animation: 'sobe .5s ease 1.5s both' }}>
              {r.parceiros === 1 ? 'pessoa' : 'pessoas diferentes'}, com dupla confirmada.
            </span>
          </div>
        ),
      })
    }

    if (dupla && nivel) {
      lista.push({
        id: 'dupla',
        bg: '#024565',
        fg: '#F5F4F2',
        conteudo: (
          <div className="flex flex-1 flex-col items-center justify-center gap-[18px] text-center">
            <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
              Sua dupla do semestre
            </span>
            <div className="relative my-[18px] flex items-center">
              <span className="-mr-[22px] rounded-full shadow-[0_6px_0_#000507]" style={{ animation: 'entra-esq .7s cubic-bezier(.2,1.2,.4,1) .3s both' }}>
                <Avatar nome={profile?.nome ?? ''} url={profile?.avatar_url ?? null} tamanho={132} />
              </span>
              <span className="rounded-full shadow-[0_6px_0_#000507]" style={{ animation: 'entra-dir .7s cubic-bezier(.2,1.2,.4,1) .3s both' }}>
                <Avatar nome={dupla.nome} url={dupla.avatar_url} tamanho={132} />
              </span>
              <span
                className="absolute -top-[30px] left-1/2 -ml-7 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-preto text-[26px] text-preto"
                style={{
                  background: 'conic-gradient(from 210deg,#a8740f,#ffe08a,#d9a21b,#fff3c4,#a8740f)',
                  animation: 'estoura .6s cubic-bezier(.2,1.5,.4,1) 1s both',
                }}
              >
                ★
              </span>
            </div>
            <span className="text-[clamp(40px,14vw,58px)] font-extrabold leading-[.95] tracking-[-.04em]" style={{ animation: 'sobe .6s ease .8s both' }}>
              {dupla.nome}
            </span>
            <span
              className="rounded-full border-[2.5px] border-preto px-[18px] py-2.5 text-lg font-extrabold text-preto"
              style={{
                background: 'linear-gradient(135deg,#a8740f,#fff3c4,#d9a21b)',
                animation: 'estoura .5s ease 1.2s both',
              }}
            >
              {nivel.atual.nome} · {dupla.noites} {dupla.noites === 1 ? 'noite junto' : 'noites juntos'}
            </span>
          </div>
        ),
      })
    }

    if (top.length > 1) {
      lista.push({
        id: 'top',
        bg: '#000507',
        fg: '#F5F4F2',
        conteudo: (
          <div className="flex flex-1 flex-col justify-center gap-[18px]">
            <span className="text-xl font-extrabold uppercase tracking-[.08em] text-brasa-300" style={{ animation: 'sobe .5s ease .1s both' }}>
              Suas top duplas
            </span>
            {top.map((p, i) => (
              <div key={p.user_id} className="flex items-center gap-3.5" style={{ animation: `entra-esq .55s cubic-bezier(.2,1.1,.4,1) ${0.3 + i * 0.15}s both` }}>
                <span className="w-11 text-[44px] font-extrabold leading-none text-brasa-500">{i + 1}</span>
                <span className="rounded-full ring-[3px] ring-branco">
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={58} borda={false} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-2xl font-extrabold leading-tight">{p.nome}</span>
                  <span className="text-[15px] opacity-75">
                    {p.noites} {p.noites === 1 ? 'noite' : 'noites'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ),
      })
    }

    if (r.destaque) {
      const d = r.destaque
      lista.push({
        id: 'foto',
        bg: '#F5F4F2',
        fg: '#000507',
        conteudo: (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
              Sua foto mais reagida
            </span>
            <div className="relative">
              <div
                className="border-[3px] border-preto bg-white px-3 pb-11 pt-3 shadow-[0_8px_0_#000507]"
                style={{ animation: 'cai 1s cubic-bezier(.2,1,.4,1) .3s both' }}
              >
                {d.foto_url ? (
                  <img src={d.foto_url} alt={d.legenda ?? 'Sua foto mais reagida'} className="aspect-[4/5] w-[min(220px,55vw)] object-cover" />
                ) : (
                  <div className="listras aspect-[4/5] w-[min(220px,55vw)] bg-marinho-500" />
                )}
              </div>
              {REACTION_TYPES.map((e, i) => (
                <span
                  key={e}
                  aria-hidden
                  className="absolute text-[32px]"
                  style={{
                    left: i % 2 ? undefined : i === 0 ? -20 : 10,
                    right: i % 2 ? (i === 1 ? -18 : 6) : undefined,
                    bottom: [30, 60, -6, 0][i],
                    animation: `flutua 2.4s ease-out ${1.2 + i * 0.4}s infinite both`,
                  }}
                >
                  {e}
                </span>
              ))}
            </div>
            <span className="text-[clamp(44px,16vw,64px)] font-extrabold leading-[.9] tracking-[-.04em]" style={{ animation: 'estoura .6s ease 1.1s both' }}>
              {d.reacoes} {d.reacoes === 1 ? 'reação' : 'reações'}
            </span>
            {porEmoji && (
              <span className="text-lg font-extrabold" style={{ animation: 'sobe .5s ease 1.3s both' }}>
                {REACTION_TYPES.filter((e) => porEmoji[e]).map((e) => `${e} ${porEmoji[e]}`).join(' · ')}
              </span>
            )}
          </div>
        ),
      })
    }

    if (musica) {
      lista.push({
        id: 'musica',
        bg: '#FFB98C',
        fg: '#000507',
        conteudo: (
          <div className="flex flex-1 flex-col justify-center gap-[18px]">
            <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
              DJ do Espaço Livre
            </span>
            <div
              className="flex h-[min(230px,58vw)] w-[min(230px,58vw)] items-center justify-center self-center rounded-full border-[3px] border-preto shadow-[0_8px_0_rgba(0,5,7,.35)]"
              style={{
                background: 'repeating-radial-gradient(circle,#000507 0 3px,#1A2328 3px 5px)',
                animation: 'estoura .7s ease .2s both, gira 3.5s linear .9s infinite',
              }}
            >
              <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-branco bg-brasa-500 text-center text-[13px] font-extrabold leading-tight text-preto">
                FORRÓ
                <br />
                {codigo}
              </span>
            </div>
            <div className="flex items-baseline gap-3" style={{ animation: 'sobe .5s ease .8s both' }}>
              <span className="text-[clamp(80px,28vw,110px)] font-extrabold leading-[.85] tracking-[-.06em]">
                {musica.total}
              </span>
              <span className="text-2xl font-extrabold leading-tight">
                {musica.total === 1 ? 'pedido seu tocou no salão' : 'pedidos seus tocaram no salão'}
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-[18px] bg-preto px-4 py-3.5 text-branco" style={{ animation: 'sobe .5s ease 1.1s both' }}>
              <CapaAlbum url={musica.capa_url} tamanho={48} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-extrabold uppercase tracking-[.06em] text-brasa-300">
                  Sua mais pedida
                </span>
                <span className="truncate text-[22px] font-extrabold">{musica.titulo}</span>
                <span className="truncate text-[15px] opacity-80">{musica.artista}</span>
              </div>
            </div>
          </div>
        ),
      })
    }

    if (badges.length > 0) {
      lista.push({
        id: 'distintivos',
        bg: '#01344C',
        fg: '#F5F4F2',
        conteudo: (
          <div className="flex flex-1 flex-col justify-center gap-[18px]">
            <span className="text-xl font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
              Distintivos conquistados
            </span>
            <span className="text-[clamp(88px,30vw,120px)] font-extrabold leading-[.85] tracking-[-.06em]" style={{ animation: 'estoura .6s ease .2s both' }}>
              {badges.length}
            </span>
            <div className="grid grid-cols-2 gap-3">
              {badges.slice(0, 4).map((b, i) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 rounded-[20px] border-[3px] border-preto bg-branco p-3.5 text-preto shadow-[0_5px_0_#000507]"
                  style={{ animation: `estoura .5s cubic-bezier(.2,1.4,.4,1) ${0.5 + i * 0.15}s both` }}
                >
                  <span className="text-[40px] leading-none">{b.emoji}</span>
                  <span className="text-base font-extrabold leading-tight">{b.titulo}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      })
    }

    lista.push({
      id: 'story',
      bg: '#000507',
      fg: '#F5F4F2',
      conteudo: (
        <div className="flex flex-1 flex-col items-center gap-4 pt-1">
          <span className="text-[15px] font-extrabold uppercase tracking-[.08em]" style={{ animation: 'sobe .5s ease .1s both' }}>
            Seu resumo para o story
          </span>
          <PreviaStory
            codigo={codigo}
            noites={r.presencas}
            pessoas={r.parceiros}
            top={top.map((p) => p.nome)}
            musicas={musica?.total ?? 0}
            distintivos={badges.length}
            foto={r.destaque?.foto_url || null}
          />
          <div className="flex w-full gap-2.5" style={{ animation: 'sobe .5s ease .6s both' }}>
            <button
              type="button"
              disabled={gerando}
              onClick={(e) => {
                e.stopPropagation()
                void compartilhar(false)
              }}
              className="h-[54px] flex-1 rounded-2xl border-2 border-branco bg-transparent text-[15px] font-extrabold text-branco disabled:opacity-50"
            >
              Baixar imagem
            </button>
            <button
              type="button"
              disabled={gerando}
              onClick={(e) => {
                e.stopPropagation()
                void compartilhar(true)
              }}
              className="h-[54px] flex-[1.4] rounded-2xl border-2 border-preto bg-brasa-500 text-[15px] font-extrabold text-preto disabled:opacity-50"
            >
              {gerando ? 'Gerando…' : 'Postar no Instagram'}
            </button>
          </div>
        </div>
      ),
    })
    return lista
    // compartilhar muda a cada render, mas só lê estado que já está aqui
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, parceiros, musica, badges, porEmoji, profile, gerando, codigo])

  // Avança sozinho; o último slide fica parado (é onde estão os botões)
  useEffect(() => {
    if (slides.length === 0) return
    const timer = setInterval(() => {
      const passou = (Date.now() - inicio.current) / DURACAO_MS
      if (passou >= 1) {
        setIdx((i) => {
          if (i >= slides.length - 1) {
            setT(1)
            return i
          }
          inicio.current = Date.now()
          setT(0)
          return i + 1
        })
      } else setT(passou)
    }, 100)
    return () => clearInterval(timer)
  }, [slides.length])

  const irPara = (i: number) => {
    inicio.current = Date.now()
    setT(0)
    setIdx(Math.max(0, Math.min(slides.length - 1, i)))
  }

  const fechar = () => {
    const temHistorico = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
    if (temHistorico) navigate(-1)
    else navigate('/perfil', { replace: true })
  }

  if (erro) {
    return (
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => navigate(0)} />
      </div>
    )
  }
  if (!r || slides.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner texto="Somando sua temporada…" />
      </div>
    )
  }

  const atual = slides[Math.min(idx, slides.length - 1)]
  const escuro = atual.fg !== '#000507'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Retrospectiva: toque à direita para avançar, à esquerda para voltar"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        irPara(e.clientX - rect.left < rect.width / 3 ? idx - 1 : idx + 1)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') irPara(idx + 1)
        if (e.key === 'ArrowLeft') irPara(idx - 1)
        if (e.key === 'Escape') fechar()
      }}
      className="fixed inset-0 z-50 mx-auto max-w-md cursor-pointer select-none overflow-hidden outline-none transition-colors duration-[450ms]"
      style={{ background: atual.bg, color: atual.fg }}
    >
      <div
        className="absolute inset-x-4 z-10 flex flex-col gap-2.5"
        style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <div className="flex gap-1">
          {slides.map((s, i) => (
            <span
              key={s.id}
              className="h-1 flex-1 overflow-hidden rounded-sm"
              style={{ background: escuro ? 'rgba(245,244,242,.28)' : 'rgba(0,5,7,.22)' }}
            >
              <span
                className="block h-full"
                style={{
                  width: `${i < idx ? 100 : i === idx ? Math.round(t * 100) : 0}%`,
                  background: atual.fg,
                }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold">Retrospectiva {codigo}</span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation()
              fechar()
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-preto/15"
          >
            <Icone nome="fechar" tamanho={20} traco={2.6} />
          </button>
        </div>
      </div>
      <div
        key={atual.id}
        className="absolute inset-0 flex flex-col px-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 100px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
        }}
      >
        {atual.conteudo}
      </div>
    </div>
  )
}

/** O mesmo desenho da imagem do story, em tamanho de tela. */
function PreviaStory({
  codigo,
  noites,
  pessoas,
  top,
  musicas,
  distintivos,
  foto,
}: {
  codigo: string
  noites: number
  pessoas: number
  top: string[]
  musicas: number
  distintivos: number
  foto: string | null
}) {
  return (
    <div
      className="relative h-[512px] w-[288px] shrink-0 overflow-hidden rounded-[18px] bg-brasa-500 text-preto shadow-[0_20px_50px_rgba(0,0,0,.45)]"
      style={{ animation: 'estoura .7s cubic-bezier(.2,1.2,.4,1) .2s both', zoom: 'min(1, calc((100dvh - 260px) / 512))' } as CSSProperties}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-[40%] -ml-[350px] -mt-[350px] h-[700px] w-[700px] rounded-full"
        style={{ background: 'repeating-conic-gradient(rgba(0,5,7,.08) 0 7deg,transparent 7deg 20deg)' }}
      />
      <div className="absolute left-[22px] top-6 w-[164px] -rotate-[4deg] rounded-[14px] border-[3px] border-preto bg-branco px-2.5 py-2 shadow-[0_4px_0_#000507]">
        <img src="/logo.webp" alt="" className="block w-full" />
      </div>
      <div className="absolute left-6 top-[134px] whitespace-nowrap text-xs font-extrabold tracking-[.04em]">
        MEU SEMESTRE NO FORRÓ
      </div>
      <div className="absolute left-[22px] top-[148px] text-[46px] font-extrabold leading-none tracking-[-.04em]">
        {codigo}
      </div>
      <div className="absolute left-6 top-[212px] h-[148px] w-[118px] -rotate-3 overflow-hidden border-[3px] border-preto bg-marinho-500 shadow-[0_4px_0_#000507]">
        {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : <div className="listras h-full w-full" />}
      </div>
      <div className="absolute left-40 top-[212px] flex flex-col gap-2.5">
        <div className="flex flex-col">
          <span className="text-5xl font-extrabold leading-[.9] tracking-[-.04em]">{noites}</span>
          <span className="text-xs font-extrabold">{noites === 1 ? 'noite de forró' : 'noites de forró'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-5xl font-extrabold leading-[.9] tracking-[-.04em]">{pessoas}</span>
          <span className="whitespace-nowrap text-xs font-extrabold">
            {pessoas === 1 ? 'pessoa diferente' : 'pessoas diferentes'}
          </span>
        </div>
      </div>
      <div className="absolute inset-x-3.5 top-[380px] grid h-[104px] grid-cols-[1.25fr_1fr] gap-2 rounded-2xl bg-preto px-3.5 py-3 text-branco">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[9px] font-extrabold tracking-[.08em] text-brasa-300">TOP DUPLAS</span>
          {top.length === 0 && <span className="text-[11px] font-bold">—</span>}
          {top.slice(0, 5).map((n, i) => (
            <span key={n + i} className="truncate text-[11px] font-bold">
              {i + 1} {n}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-extrabold tracking-[.08em] text-brasa-300">MÚSICAS TOCADAS</span>
          <span className="text-[22px] font-extrabold leading-none">{musicas}</span>
          <span className="mt-1 text-[9px] font-extrabold tracking-[.08em] text-brasa-300">DISTINTIVOS</span>
          <span className="text-[22px] font-extrabold leading-none">{distintivos}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-2 text-center text-[10px] font-extrabold">@fds.itajuba</div>
    </div>
  )
}
