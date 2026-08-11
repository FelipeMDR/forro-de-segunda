import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import type { Notificacao } from '../lib/types'

/** Linha de "Fulana marcou que dançou com você" — a única acionável. */
function LinhaDupla({
  n,
  ocupado,
  onConfirmar,
  onRecusar,
}: {
  n: Notificacao
  ocupado: boolean
  onConfirmar: () => void
  onRecusar: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong>{n.autor.nome}</strong>{' '}
        {n.pendente ? (
          <>marcou que dançou com você 💃</>
        ) : (
          <>dançou com você 💃</>
        )}
      </p>
      {n.pendente && (
        <div className="flex gap-2">
          <button
            className="rounded-full bg-verde-700 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
            disabled={ocupado}
            onClick={onConfirmar}
          >
            Confirmar
          </button>
          <button
            className="rounded-full bg-preto/5 px-3 py-1 text-xs font-bold text-tinta-700 disabled:opacity-60"
            disabled={ocupado}
            onClick={onRecusar}
          >
            Não rolou
          </button>
        </div>
      )}
    </div>
  )
}

export function NotificacoesPage() {
  const { api } = useAuth()
  const toast = useToast()
  const [itens, setItens] = useState<Notificacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setErro(null)
      setItens(await api.listNotificacoes())
    } catch (e) {
      console.error('[notificações] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  useEffect(() => {
    void carregar()
    // Abriu o painel = viu tudo. O contador zera na próxima leitura.
    void api.marcarNotificacoesVistas().catch(() => {})
  }, [api, carregar])

  const responder = async (n: Notificacao, aceitar: boolean) => {
    if (!n.data) return
    setOcupado(n.id)
    try {
      if (aceitar) await api.marcarDupla(n.autor.id, n.data)
      else await api.desmarcarDupla(n.autor.id, n.data)
      await carregar()
      toast(aceitar ? 'Dupla confirmada! 💃' : 'Marcação removida')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  if (erro) return <ErrorState erro={erro} onRetry={() => void carregar()} />
  if (itens === null) return <Spinner texto="Carregando…" />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Notificações 🔔</h1>

      {itens.length === 0 ? (
        <EmptyState emoji="🌵" titulo="Nada por aqui ainda">
          <p className="text-sm text-tinta-500">
            Curtidas, comentários e marcações de dança aparecem aqui.
          </p>
        </EmptyState>
      ) : (
        <div className="card divide-y divide-preto/10">
          {itens.map((n) => (
            <div key={n.id} className="flex items-start gap-3 p-4">
              <Link to={`/perfil/${n.autor.id}`} className="shrink-0">
                <Avatar
                  nome={n.autor.nome}
                  url={n.autor.avatar_url}
                  tamanho={40}
                />
              </Link>
              <div className="min-w-0 flex-1">
                {n.tipo === 'dupla' ? (
                  <LinhaDupla
                    n={n}
                    ocupado={ocupado === n.id}
                    onConfirmar={() => void responder(n, true)}
                    onRecusar={() => void responder(n, false)}
                  />
                ) : n.tipo === 'reacao' ? (
                  <p className="text-sm">
                    <strong>{n.autor.nome}</strong> reagiu à sua foto{' '}
                    <span className="text-base">{n.detalhe}</span>
                  </p>
                ) : (
                  <p className="text-sm">
                    <strong>{n.autor.nome}</strong> comentou:{' '}
                    <span className="text-tinta-600">"{n.detalhe}"</span>
                  </p>
                )}
                <p className="mt-0.5 text-xs text-tinta-500">
                  {formatRelative(n.criado_em)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
