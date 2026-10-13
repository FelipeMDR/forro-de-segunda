import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cabecalho } from '../components/ui'
import { CheckinCard } from '../components/CheckinCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import type { FeedItem } from '../lib/types'
import { useLembrado } from '../lib/memoriaTelas'

/**
 * Uma publicação isolada, fora da lista do feed — é para onde uma
 * notificação leva ("Fulana reagiu à sua foto"). Sem isso, a única
 * forma de achar a foto era rolar o feed até topar com ela, o que
 * piorou depois da paginação (ela pode já ter saído da primeira
 * página, ou até ter sido arquivada pela retenção).
 */
export function PublicacaoPage() {
  const { id } = useParams<{ id: string }>()
  const { api } = useAuth()
  const navigate = useNavigate()
  const [item, setItem] = useLembrado<FeedItem | null | undefined>(
    `publicacao:${id}`,
    undefined,
  )
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    try {
      setErro(null)
      setItem(await api.getCheckin(id))
    } catch (e) {
      console.error('[publicação] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Publicação" fallback="/feed" />
      {erro ? (
        <div className="px-4">
          <ErrorState erro={erro} onRetry={() => void carregar()} />
        </div>
      ) : item === undefined ? (
        <Spinner texto="Carregando publicação…" />
      ) : item === null ? (
        <div className="px-4">
          <EmptyState
            emoji="🤔"
            titulo="Publicação não encontrada"
            texto="Ela pode ter sido removida."
          >
            <button className="btn-ghost" onClick={() => navigate('/feed')}>
              Ir para o feed
            </button>
          </EmptyState>
        </div>
      ) : (
        <CheckinCard item={item} onChanged={() => void carregar()} />
      )}
    </div>
  )
}
