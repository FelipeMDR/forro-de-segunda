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
          isActive ? 'text-brasa-400' : 'text-stone-500'
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
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/5 bg-noite-950/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <Logo tamanho={30} />
        <h1 className="text-lg font-extrabold tracking-tight">
          <span className="text-[#8cc63f]">Forró</span>{' '}
          <span className="text-sm font-bold text-stone-400">de</span>{' '}
          <span className="text-[#3fa9f5]">Segunda</span>
        </h1>
        <NavLink to="/perfil" className="ml-auto" aria-label="Meu perfil">
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-noite-900/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-1 px-3 py-1.5">
          <Item to="/" emoji="🎉" rotulo="Feed" />
          <Item to="/desafios" emoji="🏆" rotulo="Desafios" />
          <NavLink
            to="/checkin"
            aria-label="Fazer check-in"
            className="mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brasa-400 to-brasa-600 text-2xl shadow-lg shadow-brasa-600/40 ring-4 ring-noite-950 transition active:scale-95"
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
