import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { BadgeGrid, ChipsPerfil, FavoritosGrid, StatsRow } from '../components/PerfilResumo'
import { Spinner } from '../components/Spinner'
import { BotaoIcone, BotaoSuave, useVoltar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { diaDaNoite } from '../lib/dates'
import { carregarParceiros, nivelDupla } from '../lib/forrodex'
import { useEstiloNivel } from '../lib/metais'
import { carregarPerfilStats, type PerfilStats } from '../lib/perfilStats'
import type { Badge, CheckinFavorito, ParceiroPossivel, Profile } from '../lib/types'

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
  // Noite de forró, não dia do calendário — quem dançou junto à 1h da
  // manhã ainda está na noite que começou ontem.
  const hoje = diaDaNoite(new Date())

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
    <div className="flex flex-col gap-1.5 px-4 pt-3.5">
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void alternar()}
        className={`h-[52px] w-full rounded-2xl border-2 border-preto text-base font-extrabold text-preto disabled:opacity-60 ${
          estado.marcado ? 'bg-verde-500' : 'bg-brasa-500 shadow-[0_4px_0_#000507]'
        }`}
      >
        {estado.marcado ? 'Dupla marcada ✓' : `Dancei com ${nome} hoje`}
      </button>
      {estado.marcado && (
        <p className="text-center text-[13px] text-ink3">
          {estado.confirmada ? 'Confirmada pelos dois' : `Esperando ${nome} confirmar`}
        </p>
      )}
    </div>
  )
}

/** "Vocês dois": o nível da dupla no semestre, na moldura de metal dele. */
function VocesDois({ noites }: { noites: number | null }) {
  const estilo = useEstiloNivel()
  const p = noites !== null ? nivelDupla(noites) : null
  const e = estilo(p?.atual.nivel ?? 1)
  return (
    <div
      className="mx-4 mt-3.5 rounded-[20px]"
      style={{
        padding: e.moldura && p ? 3 : 1,
        background: e.moldura && p ? e.moldura : 'var(--line)',
      }}
    >
      <div
        className="flex items-center gap-3 rounded-[17px] px-4 py-3.5"
        style={{ background: p ? e.miolo : 'var(--sf)' }}
      >
        <span className="shrink-0 text-[13px] font-extrabold uppercase tracking-[.06em] text-bl-t">
          Vocês dois
        </span>
        <span
          className="flex-1 text-right text-[15px] font-extrabold"
          style={{ color: p ? e.texto : 'var(--ink3)' }}
        >
          {noites === null
            ? '…'
            : p
              ? `${p.atual.nome} · ×${noites} ${noites === 1 ? 'noite' : 'noites'}`
              : 'Ainda não dançaram neste semestre'}
        </span>
      </div>
    </div>
  )
}

/**
 * Perfil público de outra pessoa: as mesmas informações do próprio
 * perfil, sem telefone e sem nenhuma opção de edição — e com o que
 * importa entre as duas pessoas (o nível da dupla e o "dancei com").
 */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { api, userId, profile: eu } = useAuth()
  const navigate = useNavigate()
  const voltar = useVoltar('/')

  const [perfil, setPerfil] = useState<Profile | null | undefined>()
  const [stats, setStats] = useState<PerfilStats | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [favoritos, setFavoritos] = useState<CheckinFavorito[] | null>(null)
  const [noitesJuntos, setNoitesJuntos] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    setPerfil(undefined)
    setStats(null)
    setBadges(null)
    setFavoritos(null)
    setNoitesJuntos(null)
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
    // Noites juntos neste semestre (mesmo corte da Forródex)
    if (userId) {
      void carregarParceiros(api, userId, eu?.criado_em ?? undefined)
        .then(({ parceiros }) => {
          if (!cancelado) setNoitesJuntos(parceiros.find((x) => x.user_id === id)?.noites ?? 0)
        })
        .catch(() => !cancelado && setNoitesJuntos(0))
    }
    return () => {
      cancelado = true
    }
  }, [api, id, userId, eu?.criado_em])

  // O próprio perfil tem a versão completa (com dados e configurações)
  if (id && id === userId) return <Navigate to="/perfil" replace />

  if (erro) {
    return (
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => navigate(0)} />
      </div>
    )
  }
  if (perfil === undefined) return <Spinner texto="Carregando perfil…" />
  if (perfil === null) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-24 text-center">
        <p className="text-lg font-extrabold">Perfil não encontrado</p>
        <BotaoSuave onClick={voltar}>Voltar</BotaoSuave>
      </div>
    )
  }

  const primeiroNome = perfil.nome.split(/\s+/)[0]

  return (
    <div className="anima-tela">
      <div className="px-3 pt-1">
        <BotaoIcone icone="voltar" rotulo="Voltar" onClick={voltar} />
      </div>
      <div className="flex flex-col items-center gap-2.5 px-5 pb-[18px] text-center">
        <span className="rounded-full shadow-[0_5px_0_#000507]">
          <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho={96} />
        </span>
        <h1 className="m-0 mt-1.5 text-[30px] font-extrabold leading-none tracking-[-.02em]">
          {perfil.nome}
        </h1>
        <ChipsPerfil cargos={perfil.cargos} turmas={perfil.turmas} />
      </div>

      <div className="px-4">
        <StatsRow stats={stats} semDesafios />
      </div>
      <VocesDois noites={noitesJuntos} />
      <DanceiCom perfilId={perfil.id} nome={primeiroNome} />

      <BadgeGrid
        badges={badges}
        vazio={`${primeiroNome} ainda não tem distintivos. Chama pra dançar!`}
      />

      <FavoritosGrid
        userId={perfil.id}
        favoritos={favoritos}
        vazio={`${primeiroNome} ainda não guardou nenhum check-in nos favoritos.`}
      />
    </div>
  )
}
