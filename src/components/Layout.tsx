import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'
import { Logo } from './Logo'

function Item({
  to,
  emoji,
  rotulo,
}: {
  to: string
  emoji: string
  rotulo: string
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
      <span className="text-xl leading-none">{emoji}</span>
      {rotulo}
    </NavLink>
  )
}

export function Layout() {
  const { profile, papel } = useAuth()

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
        <NavLink
          to="/buscar"
          aria-label="Buscar pessoas"
          className={({ isActive }) =>
            `ml-auto flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
              isActive ? 'bg-brasa-500/20 text-brasa-700' : 'hover:bg-preto/5'
            }`
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
            aria-label="Fazer check-in"
            className="mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brasa-500 to-brasa-700 text-2xl shadow-lg shadow-brasa-700/30 ring-4 ring-fundo transition active:scale-95"
          >
            📸
          </NavLink>
          <Item to="/perfil" emoji="👤" rotulo="Perfil" />
          {papel === 'organizador' ? (
            <Item to="/organizador" emoji="🛠️" rotulo="Painel" />
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </nav>
    </div>
  )
}
