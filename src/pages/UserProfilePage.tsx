import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import {
  BadgeGrid,
  CargoChips,
  StatsRow,
  TurmaChips,
} from '../components/PerfilResumo'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import type { Badge, Profile } from '../lib/types'

/**
 * Perfil público de outro aluno: mesmas informações do próprio perfil,
 * porém sem telefone e sem nenhuma opção de edição.
 */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { api, userId } = useAuth()
  const navigate = useNavigate()

  const [perfil, setPerfil] = useState<Profile | null | undefined>()
  const [stats, setStats] = useState<PerfilStats | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    setPerfil(undefined)
    setStats(null)
    setBadges(null)
    setErro(null)
    void (async () => {
      try {
        const p = await api.getProfile(id)
        if (cancelado) return
        setPerfil(p)
        if (!p) return
        const r = await carregarPerfilStats(api, id, p.turmas, p.cargos)
        if (cancelado) return
        setStats(r.stats)
        setBadges(r.badges)
      } catch (e) {
        if (cancelado) return
        console.error('[perfil público] falha ao carregar', e)
        setErro((e as Error).message || 'Erro desconhecido')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [api, id])

  // O próprio perfil tem a versão completa (com dados e configurações)
  if (id && id === userId) return <Navigate to="/perfil" replace />

  if (erro) {
    return <ErrorState erro={erro} onRetry={() => navigate(0)} />
  }
  if (perfil === undefined) return <Spinner texto="Carregando perfil…" />
  if (perfil === null) {
    return (
      <EmptyState emoji="🤔" titulo="Perfil não encontrado">
        <button className="btn-ghost" onClick={() => navigate('/')}>
          Voltar ao feed
        </button>
      </EmptyState>
    )
  }

  const primeiroNome = perfil.nome.split(/\s+/)[0]

  return (
    <div className="space-y-4">
      <button
        className="text-sm font-bold text-stone-400"
        onClick={() => navigate(-1)}
      >
        ← Voltar
      </button>

      <div className="card flex flex-col items-center gap-3 p-6">
        <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho={88} />
        <div className="text-center">
          <h1 className="text-xl font-extrabold">{perfil.nome}</h1>
          <CargoChips cargos={perfil.cargos} />
          <TurmaChips turmas={perfil.turmas} />
        </div>
        <StatsRow stats={stats} />
      </div>

      <BadgeGrid
        badges={badges}
        vazio={`${primeiroNome} ainda não tem distintivos. Chama pra dançar! 💃`}
      />
    </div>
  )
}
