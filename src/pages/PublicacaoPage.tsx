import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckinCard } from '../components/CheckinCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import type { FeedItem } from '../lib/types'

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
  const [item, setItem] = useState<FeedItem | null | undefined>()
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

  if (erro) return <ErrorState erro={erro} onRetry={() => void carregar()} />
  if (item === undefined) return <Spinner texto="Carregando publicação…" />
  if (item === null) {
    return (
      <EmptyState emoji="🤔" titulo="Publicação não encontrada">
        <p className="text-sm text-tinta-500">
          Ela pode ter sido removida.
        </p>
        <button className="btn-ghost" onClick={() => navigate('/')}>
          Voltar ao feed
        </button>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <button
        className="text-sm font-bold text-tinta-600"
        onClick={() => navigate(-1)}
      >
        ← Voltar
      </button>
      <CheckinCard item={item} onChanged={() => void carregar()} />
    </div>
  )
}
