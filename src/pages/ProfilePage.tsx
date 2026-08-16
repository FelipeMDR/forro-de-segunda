import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
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
import { computeBadges } from '../lib/badges'
import { compressImage, LIMITE_AVATAR } from '../lib/image'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import type { Badge, CheckinFavorito } from '../lib/types'

export function ProfilePage() {
  const { api, userId, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const avatarInput = useRef<HTMLInputElement>(null)

  const [stats, setStats] = useState<PerfilStats | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [favoritos, setFavoritos] = useState<CheckinFavorito[] | null>(null)
  const [semestreEncerrado, setSemestreEncerrado] = useState(false)

  // O perfil da sessão é carregado no login e fica em cache. Se a
  // organização mudar sua turma ou seus cargos depois disso, a tela
  // mostraria dados velhos — então recarrega ao abrir o perfil.
  useEffect(() => {
    void refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!userId || !profile) return
    void carregarPerfilStats(api, userId, profile.turmas, profile.cargos)
      .then((r) => {
        setStats(r.stats)
        setBadges(r.badges)
      })
      .catch((e) => {
        console.error('[perfil] falha ao carregar estatísticas', e)
        // Sem estatísticas, mostra ao menos os distintivos de turma
        setStats({ streak: 0, presencas: 0, desafios: 0, parceiros: 0 })
        setBadges(
          computeBadges({
            userId,
            turmas: profile.turmas,
            cargos: profile.cargos,
            checkinDates: [],
          }),
        )
      })
    void api
      .favoritosDe(userId)
      .then(setFavoritos)
      .catch((e) => {
        // Sem a migração 005 a coluna não existe — o resto do perfil vale
        console.error('[perfil] falha ao carregar favoritos', e)
        setFavoritos([])
      })
    void api
      .semestreEncerrado()
      .then(setSemestreEncerrado)
      .catch(() => setSemestreEncerrado(false))
  }, [api, userId, profile])

  if (!profile) {
    // Perfil não carregou (sessão inválida?) — dá uma saída em vez de travar
    return (
      <div className="space-y-4">
        <Spinner texto="Carregando seu perfil…" />
        <button className="btn-ghost w-full" onClick={() => void api.signOut()}>
          Sair da conta
        </button>
      </div>
    )
  }

  const trocarAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      const blob = await compressImage(file, 256, 0.8, LIMITE_AVATAR)
      await api.updateProfile({ avatarBlob: blob })
      await refreshProfile()
      toast('Foto de perfil atualizada!')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card relative flex flex-col items-center gap-3 p-6">
        {/* A engrenagem leva para dados e acesso, que saiu daqui. No
            canto e discreta: é usada uma vez por semestre, enquanto o
            resto do cartão é o que a pessoa vem ver. */}
        <Link
          to="/perfil/conta"
          aria-label="Meus dados e acesso"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-preto/5 text-lg transition active:scale-90"
        >
          ⚙️
        </Link>
        <button
          onClick={() => avatarInput.current?.click()}
          className="relative"
          aria-label="Trocar foto de perfil"
        >
          <Avatar nome={profile.nome} url={profile.avatar_url} tamanho={88} />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-preto/10 text-sm ring-2 ring-papel">
            📷
          </span>
        </button>
        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void trocarAvatar(e.target.files?.[0])}
        />
        <div className="text-center">
          <h1 className="text-xl font-extrabold">{profile.nome}</h1>
          <CargoChips cargos={profile.cargos} />
          <TurmaChips turmas={profile.turmas} />
        </div>

        <StatsRow stats={stats} />

        {/* Só quando o semestre fecha. Durante o semestre a retrospectiva
            seria um balanço pela metade; ela some sozinha quando a
            matrícula nova devolve as turmas.
            Gradiente a partir do azul-600: sobre o 500 oficial o branco
            dá 3,49:1, e este texto é pequeno (precisa de 4,5:1). */}
        {semestreEncerrado && (
          <Link
            to="/retrospectiva"
            className="w-full rounded-xl bg-gradient-to-br from-azul-600 to-marinho-500 px-4 py-3 text-center text-sm font-bold text-white"
          >
            ✨ Ver retrospectiva do semestre
          </Link>
        )}
      </div>

      <BadgeGrid
        badges={badges}
        vazio="Faça seu primeiro check-in para começar a colecionar! 📸"
      />

      <FavoritosGrid
        favoritos={favoritos}
        mostrarLimite
        vazio="Toque na ☆ de um check-in seu no feed para guardar aqui. Favoritos ficam salvos para sempre — os outros são arquivados depois de 4 meses."
      />
    </div>
  )
}
