import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NoiteProvider, useNoite } from '../context/NoiteContext'
import { Icone, type NomeIcone } from './Icone'

/**
 * Quatro abas: Hoje, Feed, Avisos e Eu.
 *
 * O check-in não tem mais botão próprio na barra: ele mora no topo da
 * tela Hoje, que é a primeira coisa que abre — e lá ele responde "já
 * registrei?" por extenso, coisa que um ícone redondo não fazia. A aba
 * Hoje ganha uma bolinha laranja enquanto ainda vale ponto e a foto não
 * saiu.
 */
function Aba({
  to,
  icone,
  rotulo,
  ativa,
  marca,
}: {
  to: string
  icone: NomeIcone
  rotulo: string
  ativa: boolean
  /** Bolinha (true) ou contagem (número > 0) no ícone. */
  marca?: boolean | number
}) {
  return (
    <NavLink
      to={to}
      aria-current={ativa ? 'page' : undefined}
      className={`relative flex h-[50px] flex-col items-center justify-center gap-[3px] text-[11px] font-extrabold ${
        ativa ? 'text-ink' : 'text-ink3'
      }`}
    >
      <Icone nome={icone} tamanho={24} />
      {rotulo}
      {marca === true && (
        <span
          className="absolute left-[calc(50%+8px)] top-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-preto bg-brasa-500"
          aria-label="Check-in valendo ponto agora"
        />
      )}
      {typeof marca === 'number' && marca > 0 && (
        <span
          className="absolute left-[calc(50%+4px)] top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-preto bg-brasa-500 px-1 text-[11px] font-extrabold text-preto"
          aria-label={`${marca} não lidas`}
        >
          {marca > 9 ? '9+' : marca}
        </span>
      )}
    </NavLink>
  )
}

/** Intervalo mínimo entre duas recontagens da bolinha de avisos. */
const ESPERA_CONTAGEM_MS = 60_000

/** Telas de tela cheia, sem a barra de baixo. */
const IMERSIVAS = ['/checkin', '/retrospectiva']

/** Qual aba acende em cada tela. */
function abaDe(pathname: string): 'hoje' | 'feed' | 'avisos' | 'eu' {
  if (pathname.startsWith('/feed') || pathname.startsWith('/publicacao')) return 'feed'
  if (pathname.startsWith('/notificacoes')) return 'avisos'
  if (pathname.startsWith('/perfil') || pathname.startsWith('/organizador')) {
    // O perfil de OUTRA pessoa é navegação, não "Eu"
    return /^\/perfil\/(?!conta|duplas)[^/]+/.test(pathname) ? 'hoje' : 'eu'
  }
  return 'hoje'
}

function Casca() {
  const { api } = useAuth()
  const { pathname } = useLocation()
  const { situacao } = useNoite()
  const [naoLidas, setNaoLidas] = useState(0)
  /** Quando a bolinha foi recontada pela última vez — ver o efeito abaixo. */
  const ultimaContagem = useRef(0)
  const telaAnterior = useRef(pathname)

  // Recontagem ao trocar de tela, com freio.
  //
  // Contar não-lidas não é barato como parecia: são cinco consultas
  // (perfil + as quatro origens de aviso), e trocar de aba é o gesto
  // mais comum do app — de uma noite de forró saíam milhares de
  // consultas só para redesenhar uma bolinha. Uma vez por minuto
  // chega: aviso é coisa que pode esperar um minuto.
  //
  // A exceção é sair do painel de avisos: ali eles acabaram de ser
  // marcados como vistos, e a bolinha PRECISA zerar na hora, senão
  // continuaria anunciando o que a pessoa acabou de ler.
  useEffect(() => {
    const saindoDosAvisos = telaAnterior.current === '/notificacoes'
    telaAnterior.current = pathname
    const agora = Date.now()
    if (!saindoDosAvisos && agora - ultimaContagem.current < ESPERA_CONTAGEM_MS) {
      return
    }
    ultimaContagem.current = agora
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

  // Cada tela nova começa do topo, como num app nativo
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const imersiva = IMERSIVAS.some((p) => pathname.startsWith(p))
  const aba = abaDe(pathname)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* pt = safe area: no iPhone o app roda sob a barra de status */}
      <main
        className={`flex-1 ${imersiva ? '' : 'pb-28'}`}
        style={{
          paddingTop: imersiva ? undefined : 'calc(env(safe-area-inset-top) + 8px)',
        }}
      >
        <Outlet />
      </main>

      {!imersiva && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-barra backdrop-blur-[18px]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4px)' }}
        >
          <div className="mx-auto grid w-full max-w-md grid-cols-4 pt-1.5">
            <Aba
              to="/"
              icone="hoje"
              rotulo="Hoje"
              ativa={aba === 'hoje'}
              marca={situacao === 'valendo'}
            />
            <Aba to="/feed" icone="feed" rotulo="Feed" ativa={aba === 'feed'} />
            <Aba
              to="/notificacoes"
              icone="sino"
              rotulo="Avisos"
              ativa={aba === 'avisos'}
              marca={naoLidas}
            />
            <Aba to="/perfil" icone="pessoa" rotulo="Eu" ativa={aba === 'eu'} />
          </div>
        </nav>
      )}
    </div>
  )
}

export function Layout() {
  return (
    <NoiteProvider>
      <Casca />
    </NoiteProvider>
  )
}
