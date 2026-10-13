import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Cabecalho } from '../components/ui'
import { CheckinCard } from '../components/CheckinCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import type { FeedItem } from '../lib/types'

/**
 * Os favoritos de alguém como um feed — é para onde a galeria do perfil
 * leva. Antes cada miniatura abria a publicação sozinha, e ver a próxima
 * era voltar ao perfil e tocar de novo, uma por uma. Agora a foto tocada
 * abre já posicionada (`?foto=<id>`) e as outras estão a uma rolagem.
 */
export function FavoritosPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const foto = params.get('foto')
  const { api } = useAuth()
  const navigate = useNavigate()
  const [itens, setItens] = useState<FeedItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** Só rola até a foto tocada na primeira carga, não a cada recarga. */
  const posicionou = useRef(false)

  const carregar = useCallback(async () => {
    if (!id) return
    try {
      setErro(null)
      setItens(await api.favoritosCompletosDe(id))
    } catch (e) {
      console.error('[favoritos] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    if (!itens || posicionou.current) return
    posicionou.current = true
    if (!foto) return
    document
      .getElementById(`favorito-${foto}`)
      ?.scrollIntoView({ block: 'start' })
  }, [itens, foto])

  if (erro) {
    return (
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => void carregar()} />
      </div>
    )
  }
  if (itens === null) return <Spinner texto="Carregando favoritos…" />

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Favoritos" fallback={`/perfil/${id ?? ''}`} />
      {itens.length === 0 ? (
        <div className="px-4">
          <EmptyState emoji="⭐" titulo="Nenhum favorito por aqui">
            <button className="btn-ghost" onClick={() => navigate(-1)}>
              Voltar
            </button>
          </EmptyState>
        </div>
      ) : (
        itens.map((item) => (
          <div key={item.id} id={`favorito-${item.id}`} className="scroll-mt-4">
            <CheckinCard item={item} onChanged={() => void carregar()} />
          </div>
        ))
      )}
    </div>
  )
}
