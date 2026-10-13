import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import type { Comment } from '../lib/types'
import { Avatar } from './Avatar'
import { Icone } from './Icone'
import { Spinner } from './Spinner'
import { BotaoAcao, Folha } from './ui'

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
    <Folha
      aberta
      onFechar={onClose}
      titulo="Comentários"
      rodape={
        <div className="flex gap-2">
          <input
            className="h-12 min-w-0 flex-1 rounded-[14px] border-[1.5px] border-linha bg-fundo px-3.5 text-base font-semibold text-ink outline-none focus:border-brasa-500"
            placeholder="Escreva um comentário"
            aria-label="Escreva um comentário"
            value={texto}
            maxLength={300}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enviar()
            }}
          />
          <BotaoAcao
            tamanho="p"
            sombra={false}
            className="h-12"
            disabled={enviando || !texto.trim()}
            onClick={() => void enviar()}
          >
            Enviar
          </BotaoAcao>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5 px-5 pb-4">
        {comments === null ? (
          <Spinner />
        ) : comments.length === 0 ? (
          <p className="py-6 text-[15px] text-ink3">Ninguém comentou ainda.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <Link to={`/perfil/${c.user_id}`} onClick={onClose} className="shrink-0">
                <Avatar nome={c.autor.nome} url={c.autor.avatar_url} tamanho={34} borda={false} />
              </Link>
              <div className="min-w-0 flex-1 text-[15px] leading-snug">
                <Link to={`/perfil/${c.user_id}`} onClick={onClose} className="font-extrabold">
                  {c.autor.nome}
                </Link>{' '}
                <span className="break-words text-ink">{c.texto}</span>
                <div className="text-xs text-ink3">{formatRelative(c.criado_em)}</div>
              </div>
              {(c.user_id === userId || papel === 'organizador') && (
                <button
                  type="button"
                  onClick={() => void excluir(c.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-ink3"
                  aria-label="Excluir comentário"
                >
                  <Icone nome="fechar" tamanho={16} traco={2.4} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </Folha>
  )
}
