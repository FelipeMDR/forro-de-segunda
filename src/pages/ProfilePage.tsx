import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { BadgeGrid, StatsRow, TurmaChips } from '../components/PerfilResumo'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { computeBadges } from '../lib/badges'
import { compressImage } from '../lib/image'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import { enablePush, isPushEnabled, pushSupported } from '../lib/push'
import type { Badge } from '../lib/types'

export function ProfilePage() {
  const { api, userId, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const avatarInput = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState(profile?.nome ?? '')
  const [salvando, setSalvando] = useState(false)
  const [stats, setStats] = useState<PerfilStats | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [pushAtivo, setPushAtivo] = useState(false)

  useEffect(() => {
    setNome(profile?.nome ?? '')
  }, [profile])

  useEffect(() => {
    if (!userId || !profile) return
    void carregarPerfilStats(api, userId, profile.turmas)
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
            checkinDates: [],
            challenges: [],
            rankings: new Map(),
            events: [],
          }),
        )
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

  const trocarAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      const blob = await compressImage(file, 256, 0.8)
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
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-noite-700 text-sm ring-2 ring-noite-900">
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
          <TurmaChips turmas={profile.turmas} />
        </div>

        <StatsRow stats={stats} />
      </div>

      <BadgeGrid
        badges={badges}
        vazio="Faça seu primeiro check-in para começar a colecionar! 📸"
      />

      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
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
          <p className="rounded-xl border border-white/5 bg-noite-950 px-3.5 py-2.5 text-sm text-stone-400">
            {profile.telefone ?? '—'}
          </p>
          <p className="mt-1.5 text-xs text-stone-500">
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
            <p className="text-xs text-stone-500">
              "Hoje tem forró!" direto no seu celular
            </p>
          </div>
          {pushAtivo ? (
            <span className="text-xs font-bold text-verde-400">ativado ✓</span>
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
