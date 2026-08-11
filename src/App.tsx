import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/Spinner'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AdminPage } from './pages/AdminPage'
import { BuscarPage } from './pages/BuscarPage'
import { ChallengeDetailPage } from './pages/ChallengeDetailPage'
import { ChallengesPage } from './pages/ChallengesPage'
import { CheckinPage } from './pages/CheckinPage'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { NotificacoesPage } from './pages/NotificacoesPage'
import { NovaSenhaPage } from './pages/NovaSenhaPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicacaoPage } from './pages/PublicacaoPage'
import { RetrospectivaPage } from './pages/RetrospectivaPage'
import { UserProfilePage } from './pages/UserProfilePage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { userId, carregando } = useAuth()
  if (carregando && !userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!userId) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Fora do RequireAuth: quem chega pelo link do e-mail pode
                cair aqui antes de o token virar sessão, e ser mandado
                para o login perderia o token que veio na URL. */}
            <Route path="/nova-senha" element={<NovaSenhaPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<FeedPage />} />
              <Route path="/checkin" element={<CheckinPage />} />
              <Route path="/desafios" element={<ChallengesPage />} />
              <Route path="/desafios/:id" element={<ChallengeDetailPage />} />
              <Route path="/buscar" element={<BuscarPage />} />
              <Route path="/notificacoes" element={<NotificacoesPage />} />
              <Route path="/publicacao/:id" element={<PublicacaoPage />} />
              <Route path="/retrospectiva" element={<RetrospectivaPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/perfil/:id" element={<UserProfilePage />} />
              <Route path="/organizador" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
