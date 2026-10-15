import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/Spinner'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { BuscarPage } from './pages/BuscarPage'
import { PassoPage } from './pages/PassoPage'
import { CronogramaPage } from './pages/painel/CronogramaPage'
import { EditarPassoPage } from './pages/painel/EditarPassoPage'
import { GerenciarTrilhaPage } from './pages/painel/GerenciarTrilhaPage'
import { TrilhaPage } from './pages/TrilhaPage'
import { ChallengeDetailPage } from './pages/ChallengeDetailPage'
import { ChallengesPage } from './pages/ChallengesPage'
import { DJPage } from './pages/DJPage'
import { CheckinPage } from './pages/CheckinPage'
import { ConfirmadoPage } from './pages/ConfirmadoPage'
import { ContaPage } from './pages/ContaPage'
import { FavoritosPage } from './pages/FavoritosPage'
import { AgendaPage } from './pages/AgendaPage'
import { FeedPage } from './pages/FeedPage'
import { HojePage } from './pages/HojePage'
import { SalaoPage } from './pages/SalaoPage'
import { ForrodexPage } from './pages/ForrodexPage'
import { LoginPage } from './pages/LoginPage'
import { NotificacoesPage } from './pages/NotificacoesPage'
import { NovaSenhaPage } from './pages/NovaSenhaPage'
import { MusicaPage } from './pages/MusicaPage'
import { PrivacidadePage } from './pages/PrivacidadePage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicacaoPage } from './pages/PublicacaoPage'
import { RetrospectivaPage } from './pages/RetrospectivaPage'
import { SpotifyConectadoPage } from './pages/SpotifyConectadoPage'
import { UserProfilePage } from './pages/UserProfilePage'
import { AgendaPainelPage, NovoEventoPage } from './pages/painel/AgendaPainelPage'
import { AlunoPage, AlunosPage, NovoAlunoPage } from './pages/painel/AlunosPage'
import { PainelLayout } from './pages/painel/contexto'
import { DenunciasPage } from './pages/painel/DenunciasPage'
import { DistintivosPage, NovoDistintivoPage } from './pages/painel/DistintivosPage'
import { FrequenciaPage } from './pages/painel/FrequenciaPage'
import { PainelHome, PessoasHub } from './pages/painel/HubPage'
import { ImportarPage } from './pages/painel/ImportarPage'
import { CargosPage, SemestrePage, TurmasPage } from './pages/painel/TurmasCargosPage'

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
            <Route path="/confirmado" element={<ConfirmadoPage />} />
            {/* Fora do RequireAuth: precisa ser lido ANTES de criar a
                conta, quando ainda não há sessão. */}
            <Route path="/privacidade" element={<PrivacidadePage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<HojePage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/salao" element={<SalaoPage />} />
              <Route path="/trilha" element={<TrilhaPage />} />
              <Route path="/trilha/:id" element={<PassoPage />} />
              <Route path="/checkin" element={<CheckinPage />} />
              <Route path="/desafios" element={<ChallengesPage />} />
              <Route path="/desafios/:id" element={<ChallengeDetailPage />} />
              <Route path="/buscar" element={<BuscarPage />} />
              <Route path="/notificacoes" element={<NotificacoesPage />} />
              <Route path="/publicacao/:id" element={<PublicacaoPage />} />
              <Route path="/retrospectiva" element={<RetrospectivaPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              {/* Antes de /perfil/:id, senão "conta" viraria um id */}
              <Route path="/perfil/conta" element={<ContaPage />} />
              <Route path="/perfil/duplas" element={<ForrodexPage />} />
              <Route path="/perfil/:id" element={<UserProfilePage />} />
              <Route path="/perfil/:id/favoritos" element={<FavoritosPage />} />
              <Route path="/organizador" element={<PainelLayout />}>
                <Route index element={<PainelHome />} />
                <Route path="pessoas" element={<PessoasHub />} />
                <Route path="alunos" element={<AlunosPage />} />
                <Route path="alunos/novo" element={<NovoAlunoPage />} />
                <Route path="alunos/:id" element={<AlunoPage />} />
                <Route path="importar" element={<ImportarPage />} />
                <Route path="turmas" element={<TurmasPage />} />
                <Route path="cargos" element={<CargosPage />} />
                <Route path="semestre" element={<SemestrePage />} />
                <Route path="agenda" element={<AgendaPainelPage />} />
                <Route path="agenda/evento" element={<NovoEventoPage />} />
                <Route path="distintivos" element={<DistintivosPage />} />
                <Route path="distintivos/novo" element={<NovoDistintivoPage />} />
                <Route path="frequencia" element={<FrequenciaPage />} />
                <Route path="denuncias" element={<DenunciasPage />} />
                <Route path="videoaulas" element={<GerenciarTrilhaPage />} />
                <Route path="videoaulas/passo/:id" element={<EditarPassoPage />} />
                <Route path="videoaulas/cronograma" element={<CronogramaPage />} />
              </Route>
              <Route path="/dj" element={<DJPage />} />
              <Route path="/musica" element={<MusicaPage />} />
              <Route path="/spotify/conectado" element={<SpotifyConectadoPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
