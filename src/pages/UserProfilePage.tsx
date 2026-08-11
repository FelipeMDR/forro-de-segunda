import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import {
  BadgeGrid,
  CargoChips,
  FavoritosGrid,
  StatsRow,
  TurmaChips,
} from '../components/PerfilResumo'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toISODate } from '../lib/dates'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import type {
  Badge,
  CheckinFavorito,
  ParceiroPossivel,
  Profile,
} from '../lib/types'

/**
 * "Dancei com" no perfil de alguém.
 *
 * Só aparece quando os DOIS fizeram check-in hoje — sem esse contexto
 * o botão viraria uma forma de marcar qualquer pessoa em qualquer dia.
 * A checagem também é feita no banco; aqui é só para não mostrar um
 * botão que daria erro.
 */
function DanceiCom({ perfilId, nome }: { perfilId: string; nome: string }) {
  const { api } = useAuth()
  const toast = useToast()
  const [estado, setEstado] = useState<ParceiroPossivel | null | undefined>()
  const [ocupado, setOcupado] = useState(false)
  const hoje = toISODate(new Date())

  const carregar = useCallback(async () => {
    try {
      const lista = await api.parceirosPossiveis(hoje)
      setEstado(lista.find((p) => p.user_id === perfilId) ?? null)
    } catch {
      setEstado(null)
    }
  }, [api, hoje, perfilId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // undefined = carregando; null = sem co-presença hoje
  if (!estado) return null

  const alternar = async () => {
    setOcupado(true)
    try {
      if (estado.marcado) await api.desmarcarDupla(perfilId, hoje)
      else await api.marcarDupla(perfilId, hoje)
      await carregar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="w-full space-y-1.5 text-center">
      <button
        className={`w-full rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-60 ${
          estado.marcado
            ? 'bg-verde-700 text-white'
            : 'bg-preto/5 text-tinta-700'
        }`}
        disabled={ocupado}
        onClick={() => void alternar()}
      >
        {estado.marcado ? '✓ Dupla marcada' : `Marcar dupla com ${nome} 💃`}
      </button>
      {estado.marcado && (
        <p className="text-xs text-tinta-500">
          {estado.confirmada
            ? 'Confirmado pelos dois 🤝'
            : `Esperando ${nome} confirmar`}
        </p>
      )}
    </div>
  )
}

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
  const [favoritos, setFavoritos] = useState<CheckinFavorito[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    setPerfil(undefined)
    setStats(null)
    setBadges(null)
    setFavoritos(null)
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
        const favs = await api.favoritosDe(id).catch((e) => {
          // Sem a migração 005 a coluna não existe — o resto do perfil vale
          console.error('[perfil público] falha ao carregar favoritos', e)
          return []
        })
        if (cancelado) return
        setFavoritos(favs)
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
        className="text-sm font-bold text-tinta-600"
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
        <DanceiCom perfilId={perfil.id} nome={primeiroNome} />
      </div>

      <BadgeGrid
        badges={badges}
        vazio={`${primeiroNome} ainda não tem distintivos. Chama pra dançar! 💃`}
      />

      <FavoritosGrid
        favoritos={favoritos}
        onMudou={() => {
          if (id) void api.favoritosDe(id).then(setFavoritos)
        }}
        vazio={`${primeiroNome} ainda não guardou nenhum check-in nos favoritos.`}
      />
    </div>
  )
}
