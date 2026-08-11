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
import { CartaoInstalar } from '../components/BotaoInstalar'
import { compressImage, LIMITE_AVATAR } from '../lib/image'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import { enablePush, isPushEnabled, pushSupported } from '../lib/push'
import type { Badge, CheckinFavorito } from '../lib/types'

/**
 * E-mail de recuperação e troca de senha.
 *
 * O e-mail é o que torna possível recuperar a senha sozinho: sem ele o
 * link do "esqueci minha senha" não teria para onde ir. Contas criadas
 * antes da migração 013 nasceram sem e-mail, então o cartão cobra o
 * cadastro em vez de só oferecer.
 */
function SegurancaCard() {
  const { api, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState(profile?.email ?? '')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvandoEmail, setSalvandoEmail] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  useEffect(() => {
    setEmail(profile?.email ?? '')
  }, [profile])

  if (!profile) return null
  const semEmail = !profile.email

  const salvarEmail = async () => {
    setSalvandoEmail(true)
    try {
      await api.trocarEmail(email)
      await refreshProfile()
      toast('E-mail salvo! Agora dá para recuperar a senha por ele 📬')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvandoEmail(false)
    }
  }

  const salvarSenha = async () => {
    if (senha !== confirmar) {
      toast('As senhas não conferem', 'erro')
      return
    }
    setSalvandoSenha(true)
    try {
      await api.trocarSenha(senha)
      setSenha('')
      setConfirmar('')
      toast('Senha alterada! 🔑')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvandoSenha(false)
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-500">
        Acesso e senha
      </h2>

      {semEmail && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-3 text-xs text-amber-800">
          <strong>Cadastre seu e-mail.</strong> Sua conta é anterior a essa
          novidade, então hoje, se você esquecer a senha, só a organização
          consegue te destravar. Com um e-mail aqui, você resolve sozinho.
          Se der erro ao salvar, fale com a organização: contas bem antigas
          precisam de um ajuste que só ela faz.
        </p>
      )}

      <div>
        <label className="label" htmlFor="perfil-email">
          E-mail para recuperar a senha
        </label>
        <input
          id="perfil-email"
          type="email"
          className="input"
          placeholder="voce@email.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-tinta-500">
          Atenção: depois de cadastrar, é <strong>com o e-mail</strong> que
          você entra no app — o telefone deixa de valer no login.
        </p>
        <button
          className="btn-ghost mt-2 w-full"
          disabled={salvandoEmail || !email.trim() || email === profile.email}
          onClick={() => void salvarEmail()}
        >
          {salvandoEmail ? 'Salvando…' : 'Salvar e-mail'}
        </button>
      </div>

      <div className="border-t border-preto/10 pt-4">
        <label className="label" htmlFor="perfil-senha">
          Nova senha (mín. 6 caracteres)
        </label>
        <input
          id="perfil-senha"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <label className="label mt-3" htmlFor="perfil-senha-2">
          Confirmar nova senha
        </label>
        <input
          id="perfil-senha-2"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={6}
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
        <button
          className="btn-ghost mt-2 w-full"
          disabled={salvandoSenha || senha.length < 6}
          onClick={() => void salvarSenha()}
        >
          {salvandoSenha ? 'Salvando…' : 'Trocar senha'}
        </button>
      </div>
    </div>
  )
}

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
        setStats({ streak: 0, presencas: 0, desafios: 0, parceiros: 0 })
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
        onMudou={() => {
          if (userId) void api.favoritosDe(userId).then(setFavoritos)
        }}
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

      <SegurancaCard />

      {/* Lugar fixo para instalar: o convite do feed é dispensável, e
          quem dispensou não tinha mais como voltar atrás. */}
      <CartaoInstalar />

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
