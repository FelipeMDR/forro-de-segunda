import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import type { Comment } from '../lib/types'
import { Avatar } from './Avatar'
import { Spinner } from './Spinner'

export function CommentsSheet({
  checkinId,
  onClose,
  onChanged,
}: {
  checkinId: string
  onClose: () => void
  onChanged: () => void
}) {
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = async () => {
    setComments(await api.getComments(checkinId))
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinId])

  const enviar = async () => {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await api.addComment(checkinId, texto)
      setTexto('')
      await carregar()
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setEnviando(false)
    }
  }

  const excluir = async (id: string) => {
    try {
      await api.deleteComment(id)
      await carregar()
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-preto/10 bg-papel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-preto/10" />
        <h2 className="px-5 py-3 text-base font-extrabold">Comentários</h2>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          {comments === null ? (
            <Spinner />
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-tinta-500">
              Seja a primeira pessoa a comentar 💬
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Link to={`/perfil/${c.user_id}`} onClick={onClose}>
                  <Avatar
                    nome={c.autor.nome}
                    url={c.autor.avatar_url}
                    tamanho={32}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link
                      to={`/perfil/${c.user_id}`}
                      onClick={onClose}
                      className="font-bold"
                    >
                      {c.autor.nome}
                    </Link>{' '}
                    <span className="text-tinta-500 text-xs">
                      {formatRelative(c.criado_em)}
                    </span>
                  </p>
                  <p className="break-words text-sm text-tinta-700">{c.texto}</p>
                </div>
                {(c.user_id === userId || papel === 'organizador') && (
                  <button
                    onClick={() => void excluir(c.id)}
                    className="p-1 text-tinta-400 hover:text-red-600"
                    aria-label="Excluir comentário"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div
          className="flex gap-2 border-t border-preto/10 p-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <input
            className="input"
            placeholder="Escreva um comentário…"
            value={texto}
            maxLength={300}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enviar()
            }}
          />
          <button
            className="btn-primary shrink-0"
            disabled={enviando || !texto.trim()}
            onClick={() => void enviar()}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
