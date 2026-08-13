import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { aoPublicarCheckin } from '../lib/eventos'
import {
  challengePhase,
  desafiosQueContam,
  diaDaNoite,
  diasSuspensos,
} from '../lib/dates'
import type { Challenge, Feriado } from '../lib/types'
import { Avatar } from './Avatar'
import { Logo } from './Logo'

function Item({
  to,
  emoji,
  rotulo,
  distintivo = 0,
}: {
  to: string
  emoji: string
  rotulo: string
  /** Bolinha com a contagem — 0 não mostra nada. */
  distintivo?: number
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition ${
          isActive ? 'text-brasa-700' : 'text-tinta-500'
        }`
      }
    >
      <span className="relative text-xl leading-none">
        {emoji}
        {distintivo > 0 && (
          <span
            className="absolute -right-2.5 -top-1 min-w-[18px] rounded-full bg-brasa-700 px-1 text-[10px] font-bold leading-[18px] text-white"
            aria-label={`${distintivo} não lidas`}
          >
            {distintivo > 9 ? '9+' : distintivo}
          </span>
        )}
      </span>
      {rotulo}
    </NavLink>
  )
}

/**
 * Em que pé está o check-in desta noite.
 *
 * `feito` ganha de `fechado`: quem já registrou a presença não precisa
 * saber que a janela fechou depois.
 */
type EstadoCheckin = 'pode' | 'feito' | 'fechado'

/**
 * O botão de check-in era idêntico tendo a pessoa postado ou não naquela
 * noite — e "eu já registrei minha presença?" é a primeira pergunta de
 * quem abre o app depois da aula. Agora ele responde sozinho, sem que
 * ninguém precise entrar na tela.
 */
function useEstadoCheckin(): EstadoCheckin {
  const { api, userId } = useAuth()
  const { pathname } = useLocation()
  const [postouNestaNoite, setPostouNestaNoite] = useState(false)
  // Começa aberto: um piscar de "apagado" enquanto carrega seria pior
  // que a espera, porque diz o contrário do que costuma ser verdade.
  const [janelaAberta, setJanelaAberta] = useState(true)
  /** Sobe a cada check-in publicado, para refazer a busca na hora. */
  const [versao, setVersao] = useState(0)

  useEffect(() => aoPublicarCheckin(() => setVersao((v) => v + 1)), [])

  // Desafios e feriados mudam raramente — uma busca por sessão basta.
  useEffect(() => {
    let cancelado = false
    void Promise.all([
      api.listChallenges().catch(() => [] as Challenge[]),
      api.listFeriados().catch(() => [] as Feriado[]),
    ]).then(([desafios, feriados]) => {
      if (cancelado) return
      const ativos = desafios.filter((c) => challengePhase(c) === 'ativo')
      const suspensos = diasSuspensos(feriados)
      // Conta qualquer janela aberta, inclusive de desafio que eu não
      // participo: a foto vale retroativamente se eu entrar depois.
      setJanelaAberta(
        desafiosQueContam(new Date(), ativos, suspensos).length > 0,
      )
    })
    return () => {
      cancelado = true
    }
  }, [api])

  // Meus check-ins mudam durante a noite: ao publicar (pelo aviso) e ao
  // trocar de tela, que cobre o caso de a foto ter saído de outro lugar.
  useEffect(() => {
    if (!userId) return
    let cancelado = false
    void api
      .checkinsDe(userId)
      .then((cs) => {
        if (cancelado) return
        const noite = diaDaNoite(new Date())
        setPostouNestaNoite(
          cs.some((c) => diaDaNoite(new Date(c.criado_em)) === noite),
        )
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [api, userId, pathname, versao])

  if (postouNestaNoite) return 'feito'
  return janelaAberta ? 'pode' : 'fechado'
}

/** Aparência e rótulo do botão em cada estado. */
const BOTAO_CHECKIN: Record<
  EstadoCheckin,
  { classe: string; conteudo: ReactNode; rotulo: string }
> = {
  pode: {
    classe:
      'bg-gradient-to-br from-brasa-500 to-brasa-700 shadow-lg shadow-brasa-700/30',
    conteudo: <span className="text-2xl">📸</span>,
    rotulo: 'Fazer check-in',
  },
  feito: {
    // Contorno em vez de preenchido: o botão sai da posição de "faça
    // isto" e vira o comprovante de que já foi feito.
    classe: 'border-[3px] border-brasa-600 bg-papel',
    conteudo: (
      <span className="text-2xl font-extrabold leading-none text-brasa-700">
        ✓
      </span>
    ),
    rotulo: 'Check-in feito nesta noite — tocar para tirar outra foto',
  },
  fechado: {
    // Apagado, mas clicável: sem janela aberta a foto não marca ponto,
    // e ainda assim entra no feed.
    //
    // A borda não é enfeite. Só o preenchimento pálido dá 1,4:1 contra a
    // barra — abaixo do mínimo de 3:1 para um controle, e o botão sumia
    // como forma. Nenhum tom claro o bastante para parecer apagado
    // chega a 3:1 sozinho (o mais forte fica em 2,8), então o limite vem
    // da borda, que mede 3,9:1.
    classe: 'border-2 border-brasa-500 bg-brasa-500/25',
    conteudo: <span className="text-2xl opacity-60">📸</span>,
    rotulo: 'Fazer check-in — nenhum desafio com janela aberta agora',
  },
}

export function Layout() {
  const { api, profile, papel } = useAuth()
  const { pathname } = useLocation()
  const [naoLidas, setNaoLidas] = useState(0)
  const estadoCheckin = useEstadoCheckin()

  // Recontagem ao trocar de tela: barato o bastante e evita um item
  // ficar marcado como novo depois de a pessoa já ter aberto o painel.
  useEffect(() => {
    let cancelado = false
    void api
      .contarNaoLidas()
      .then((n) => !cancelado && setNaoLidas(n))
      // Sem a migração 016 a consulta falha — o app segue sem o contador
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [api, pathname])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* pt = safe area: no iPhone o app roda sob a barra de status
          (viewport-fit=cover + status bar translúcida) */}
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-preto/10 bg-fundo/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {/* A marca oficial já traz o nome escrito, então não há texto
            ao lado: duas grafias do nome brigariam entre si. */}
        <Logo altura={38} />
        {papel === 'organizador' && (
          <NavLink
            to="/organizador"
            aria-label="Painel do organizador"
            className={({ isActive }) =>
              `ml-auto flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
                isActive ? 'bg-brasa-500/20 text-brasa-700' : 'hover:bg-preto/5'
              }`
            }
          >
            🛠️
          </NavLink>
        )}
        <NavLink
          to="/buscar"
          aria-label="Buscar pessoas"
          className={({ isActive }) =>
            `flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
              papel === 'organizador' ? '' : 'ml-auto'
            } ${isActive ? 'bg-brasa-500/20 text-brasa-700' : 'hover:bg-preto/5'}`
          }
        >
          🔎
        </NavLink>
        <NavLink to="/perfil" aria-label="Meu perfil">
          <Avatar
            nome={profile?.nome ?? '?'}
            url={profile?.avatar_url ?? null}
            tamanho={32}
          />
        </NavLink>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-preto/10 bg-papel/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-1 px-3 py-1.5">
          <Item to="/" emoji="🎉" rotulo="Feed" />
          <Item to="/desafios" emoji="🏆" rotulo="Desafios" />
          <NavLink
            to="/checkin"
            aria-label={BOTAO_CHECKIN[estadoCheckin].rotulo}
            className={`mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full ring-4 ring-fundo transition active:scale-95 ${BOTAO_CHECKIN[estadoCheckin].classe}`}
          >
            {BOTAO_CHECKIN[estadoCheckin].conteudo}
          </NavLink>
          <Item to="/perfil" emoji="👤" rotulo="Perfil" />
          {/* O painel do organizador saiu daqui para o topo: é usado
              por umas dez pessoas, e as notificações por trezentas. */}
          <Item
            to="/notificacoes"
            emoji="🔔"
            rotulo="Avisos"
            distintivo={naoLidas}
          />
        </div>
      </nav>
    </div>
  )
}
