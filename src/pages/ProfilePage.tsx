import { useEffect, useRef, useState } from 'react'
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
import { enablePush, isPushEnabled, pushSupported } from '../lib/push'
import type { Badge, CheckinFavorito } from '../lib/types'

export function ProfilePage() {
  const { api, userId, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const avatarInput = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState(profile?.nome ?? '')
  const [salvando, setSalvando] = useState(false)
  const [stats, setStats] = useState<PerfilStats | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [favoritos, setFavoritos] = useState<CheckinFavorito[] | null>(null)
  const [pushAtivo, setPushAtivo] = useState(false)

  useEffect(() => {
    setNome(profile?.nome ?? '')
  }, [profile])

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
        setStats({ streak: 0, presencas: 0, desafios: 0 })
        setBadges(
          computeBadges({
            userId,
            turmas: profile.turmas,
            cargos: profile.cargos,
            checkinDates: [],
            events: [],
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
    void isPushEnabled().then(setPushAtivo)
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

  const salvar = async () => {
    setSalvando(true)
    try {
      await api.updateProfile({ nome: nome.trim() })
      await refreshProfile()
      toast('Perfil atualizado! ✨')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const desfavoritar = async (id: string) => {
    try {
      await api.setFavorito(id, false)
      setFavoritos((atual) => (atual ?? []).filter((f) => f.id !== id))
      toast('Tirado dos favoritos')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
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

  const ativarPush = async () => {
    const ok = await enablePush(api)
    setPushAtivo(ok)
    toast(
      ok
        ? 'Lembretes ativados! Te avisamos quando tiver forró 🎶'
        : 'Não foi possível ativar as notificações',
      ok ? 'ok' : 'erro',
    )
  }

  const reiniciarDemo = () => {
    localStorage.removeItem('fds-demo-db-v4')
    localStorage.removeItem('fds-demo-uid')
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-col items-center gap-3 p-6">
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
      </div>

      <BadgeGrid
        badges={badges}
        vazio="Faça seu primeiro check-in para começar a colecionar! 📸"
      />

      <FavoritosGrid
        favoritos={favoritos}
        mostrarLimite
        onDesfavoritar={desfavoritar}
        vazio="Toque na ☆ de um check-in seu no feed para guardar aqui. Favoritos ficam salvos para sempre — os outros são arquivados depois de 4 meses."
      />

      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
          Meus dados
        </h2>
        <div>
          <label className="label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div>
          <span className="label">Telefone (seu login)</span>
          <p className="rounded-xl border border-preto/10 bg-fundo px-3.5 py-2.5 text-sm text-tinta-600">
            {profile.telefone ?? '—'}
          </p>
          <p className="mt-1.5 text-xs text-tinta-500">
            Telefone e turmas são gerenciados pela organização — fale com eles
            se algo mudou.
          </p>
        </div>
        <button
          className="btn-primary w-full"
          disabled={salvando || !nome.trim()}
          onClick={() => void salvar()}
        >
          Salvar alterações
        </button>
      </div>

      {pushSupported() && (
        <div className="card flex items-center gap-3 p-5">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <p className="text-sm font-bold">Lembrete de aula</p>
            <p className="text-xs text-tinta-500">
              "Hoje tem forró!" direto no seu celular
            </p>
          </div>
          {pushAtivo ? (
            <span className="text-xs font-bold text-verde-800">ativado ✓</span>
          ) : (
            <button className="btn-ghost" onClick={() => void ativarPush()}>
              Ativar
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <button className="btn-ghost w-full" onClick={() => void api.signOut()}>
          Sair da conta
        </button>
        {api.mode === 'demo' && (
          <button className="btn-danger w-full" onClick={reiniciarDemo}>
            Reiniciar demonstração (apaga os dados locais)
          </button>
        )}
      </div>
    </div>
  )
}
