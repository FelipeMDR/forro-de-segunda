import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Icone } from '../components/Icone'
import {
  BadgeGrid,
  ChipsPerfil,
  FavoritosGrid,
  StatsRow,
} from '../components/PerfilResumo'
import { Spinner } from '../components/Spinner'
import { BotaoSuave, Confirmar, Contador, Interruptor } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { computeBadges } from '../lib/badges'
import { carregarParceiros } from '../lib/forrodex'
import { compressImage, LIMITE_AVATAR } from '../lib/image'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import { useTema } from '../lib/tema'
import type { Badge, CheckinFavorito } from '../lib/types'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'
import { useLembrado } from '../lib/memoriaTelas'

export function ProfilePage() {
  const { api, userId, profile, papel, refreshProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const avatarInput = useRef<HTMLInputElement>(null)
  const [tema, setTema] = useTema()
  const podeSerDJ = usePodeSerDJ() === true

  const [stats, setStats] = useLembrado<PerfilStats | null>('perfil:stats', null)
  const [badges, setBadges] = useLembrado<Badge[] | null>('perfil:badges', null)
  const [favoritos, setFavoritos] = useLembrado<CheckinFavorito[] | null>(
    'perfil:favoritos',
    null,
  )
  const [semestreEncerrado, setSemestreEncerrado] = useLembrado(
    'semestreEncerrado',
    false,
  )
  const [dexSemestre, setDexSemestre] = useLembrado<number | null>('perfil:dex', null)
  const [denuncias, setDenuncias] = useLembrado('perfil:denuncias', 0)
  const [djLigado, setDjLigado] = useLembrado('perfil:djLigado', false)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [saindo, setSaindo] = useState(false)

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
    // Forródex do semestre: pessoas com dupla confirmada desde o corte
    void carregarParceiros(api, userId, profile.criado_em ?? undefined)
      .then((parceiros) => setDexSemestre(parceiros.length))
      .catch(() => setDexSemestre(null))
  }, [api, userId, profile])

  useEffect(() => {
    if (papel !== 'organizador') return
    void api
      .listReports()
      .then((r) => setDenuncias(r.length))
      .catch(() => {})
  }, [api, papel])

  useEffect(() => {
    if (!podeSerDJ) return
    void api
      .sessaoDJAberta()
      .then((s) => setDjLigado(!!s && s.dj_user_id === userId))
      .catch(() => {})
  }, [api, podeSerDJ, userId])

  if (!profile) {
    // Perfil não carregou (sessão inválida?) — dá uma saída em vez de travar
    return (
      <div className="flex flex-col gap-4 px-4">
        <Spinner texto="Carregando seu perfil…" />
        <BotaoSuave bloco onClick={() => void api.signOut()}>
          Sair da conta
        </BotaoSuave>
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

  const sair = async () => {
    setSaindo(true)
    try {
      await api.signOut()
    } catch (e) {
      toast((e as Error).message, 'erro')
      setSaindo(false)
    }
  }

  const linha =
    'flex h-14 w-full items-center justify-between gap-3 border-b border-linha bg-transparent px-4 text-left text-base font-bold text-ink'

  return (
    <div className="anima-tela">
      <div className="flex flex-col items-center gap-2.5 px-5 pb-[18px] pt-3 text-center">
        <button
          type="button"
          onClick={() => avatarInput.current?.click()}
          className="relative rounded-full shadow-[0_5px_0_#000507]"
          aria-label="Trocar foto de perfil"
        >
          <Avatar nome={profile.nome} url={profile.avatar_url} tamanho={96} />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-preto bg-branco text-preto">
            <Icone nome="camera" tamanho={16} traco={2.4} />
          </span>
        </button>
        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void trocarAvatar(e.target.files?.[0])}
        />
        <h1 className="m-0 mt-1.5 text-[30px] font-extrabold leading-none tracking-[-.02em]">
          {profile.nome}
        </h1>
        <ChipsPerfil cargos={profile.cargos} turmas={profile.turmas} />
      </div>

      <div className="px-4">
        <StatsRow stats={stats} duplasHref="/perfil/duplas" />
      </div>

      <BadgeGrid
        badges={badges}
        contagem
        vazio="Faça seu primeiro check-in para começar a colecionar!"
      />

      <div className={`grid gap-3 px-4 pt-2.5 ${semestreEncerrado ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Link
          to="/perfil/duplas"
          className="flex min-h-[130px] flex-col gap-2 rounded-[22px] border-2 border-preto bg-verde-500 p-4 text-preto shadow-[0_4px_0_#000507]"
        >
          <span className="text-[13px] font-extrabold uppercase tracking-[.06em]">Forródex</span>
          <span className="text-[28px] font-extrabold leading-none">{dexSemestre ?? '–'}</span>
          <span className="text-[13px] font-bold">
            {dexSemestre === 1 ? 'pessoa descoberta' : 'pessoas descobertas'} no semestre
          </span>
        </Link>
        {/* Só quando o semestre fecha: durante o semestre a retrospectiva
            seria um balanço pela metade. */}
        {semestreEncerrado && (
          <Link
            to="/retrospectiva"
            className="flex min-h-[130px] flex-col gap-2 rounded-[22px] border-2 border-preto bg-azul-500 p-4 text-preto shadow-[0_4px_0_#000507]"
          >
            <span className="text-[13px] font-extrabold uppercase tracking-[.06em]">
              Retrospectiva
            </span>
            <span className="text-[28px] font-extrabold leading-none">Semestre</span>
            <span className="text-[13px] font-bold">seu semestre em stories</span>
          </Link>
        )}
      </div>

      <FavoritosGrid
        userId={profile.id}
        favoritos={favoritos}
        mostrarLimite
        vazio="Toque no marcador de um check-in seu no feed para guardar aqui. Favoritos ficam salvos para sempre — os outros são arquivados depois de 4 meses."
      />

      <div className="mx-4 mt-6 flex flex-col overflow-hidden rounded-[20px] border border-linha bg-sf">
        <button
          type="button"
          role="switch"
          aria-checked={tema === 'dark'}
          onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
          className={linha}
        >
          Tema escuro
          <Interruptor ligado={tema === 'dark'} />
        </button>
        {papel === 'organizador' && (
          <button type="button" onClick={() => navigate('/organizador')} className={linha}>
            Painel da organização
            <span className="flex items-center gap-2">
              <Contador n={denuncias} />
              <Icone nome="avancar" tamanho={18} className="text-ink3" />
            </span>
          </button>
        )}
        {podeSerDJ && (
          <button type="button" onClick={() => navigate('/dj')} className={linha}>
            Modo DJ · Spotify
            <span className="text-sm font-bold text-ink3">
              {djLigado ? 'LIGADO' : 'DESLIGADO'}
            </span>
          </button>
        )}
        <button type="button" onClick={() => navigate('/trilha')} className={linha}>
          Trilha de passos
          <Icone nome="avancar" tamanho={20} className="text-ink3" />
        </button>
        <button type="button" onClick={() => navigate('/perfil/conta')} className={linha}>
          Minha conta
          <Icone nome="avancar" tamanho={20} className="text-ink3" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmarSaida(true)}
          className="flex h-14 items-center px-4 text-base font-extrabold text-or-t"
        >
          Sair
        </button>
      </div>

      <Confirmar
        aberto={confirmarSaida}
        titulo="Sair da conta?"
        texto="Para entrar de novo você vai precisar do e-mail e da senha."
        ok="Sair"
        alerta={false}
        ocupado={saindo}
        onOk={() => void sair()}
        onVoltar={() => setConfirmarSaida(false)}
      />
    </div>
  )
}
