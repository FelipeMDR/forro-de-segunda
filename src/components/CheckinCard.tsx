import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import { REACTION_TYPES, type FeedItem } from '../lib/types'
import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'

export function CheckinCard({
  item,
  contaPontos,
  onChanged,
}: {
  item: FeedItem
  /** Se o check-in cai na janela de algum desafio (selo informativo). */
  contaPontos: boolean
  onChanged: () => void
}) {
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const [menuAberto, setMenuAberto] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [comentariosAbertos, setComentariosAbertos] = useState(false)

  const minhaReacao = item.reacoes.find((r) => r.user_id === userId)?.tipo
  const contagem = (tipo: string) =>
    item.reacoes.filter((r) => r.tipo === tipo).length

  const reagir = async (tipo: string) => {
    try {
      await api.toggleReaction(item.id, tipo)
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const denunciar = async () => {
    setMenuAberto(false)
    try {
      await api.reportCheckin(item.id, 'Conteúdo inadequado')
      toast('Denúncia enviada. Obrigado por avisar! 🚩')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const excluir = async () => {
    try {
      await api.deleteCheckin(item.id)
      setMenuAberto(false)
      toast('Check-in removido')
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const podeExcluir = item.user_id === userId || papel === 'organizador'

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <Avatar nome={item.autor.nome} url={item.autor.avatar_url} tamanho={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{item.autor.nome}</p>
          <p className="text-xs text-stone-500">
            {item.autor.turma ? `${item.autor.turma} · ` : ''}
            {formatRelative(item.criado_em)}
          </p>
        </div>
        {!contaPontos && (
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-stone-500">
            fora da janela
          </span>
        )}
        <div className="relative">
          <button
            className="rounded-lg px-2 py-1 text-stone-500 hover:bg-white/5"
            aria-label="Mais opções"
            onClick={() => {
              setMenuAberto((v) => !v)
              setConfirmandoExclusao(false)
            }}
          >
            ⋯
          </button>
          {menuAberto && (
            <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-white/10 bg-noite-800 shadow-xl">
              <button
                className="block w-full px-4 py-3 text-left text-sm font-bold hover:bg-white/5"
                onClick={() => void denunciar()}
              >
                🚩 Denunciar foto
              </button>
              {podeExcluir &&
                (confirmandoExclusao ? (
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-white/5"
                    onClick={() => void excluir()}
                  >
                    ⚠️ Confirmar exclusão?
                  </button>
                ) : (
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-bold hover:bg-white/5"
                    onClick={() => setConfirmandoExclusao(true)}
                  >
                    🗑️ Excluir check-in
                  </button>
                ))}
            </div>
          )}
        </div>
      </header>

      {item.foto_url ? (
        <img
          src={item.foto_url}
          alt={item.legenda ?? `Check-in de ${item.autor.nome}`}
          loading="lazy"
          className="aspect-[4/5] w-full bg-noite-950 object-cover"
        />
      ) : (
        // Fotos antigas são apagadas pela política de retenção (6 meses);
        // o registro da presença continua valendo.
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-noite-950 text-stone-600">
          <span className="text-4xl">🎞️</span>
          <span className="text-xs">Foto arquivada — presença registrada</span>
        </div>
      )}

      {item.legenda && (
        <p className="px-4 pt-3 text-sm text-stone-200">{item.legenda}</p>
      )}

      <footer className="flex items-center gap-1.5 px-3 py-2.5">
        {REACTION_TYPES.map((tipo) => {
          const n = contagem(tipo)
          const minha = minhaReacao === tipo
          return (
            <button
              key={tipo}
              onClick={() => void reagir(tipo)}
              aria-pressed={minha}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm transition active:scale-90 ${
                minha
                  ? 'bg-brasa-500/20 ring-1 ring-brasa-400'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span>{tipo}</span>
              {n > 0 && <span className="text-xs font-bold">{n}</span>}
            </button>
          )
        })}
        <button
          onClick={() => setComentariosAbertos(true)}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          💬
          <span className="text-xs font-bold">{item.comentarios}</span>
        </button>
      </footer>

      {comentariosAbertos && (
        <CommentsSheet
          checkinId={item.id}
          onClose={() => setComentariosAbertos(false)}
          onChanged={onChanged}
        />
      )}
    </article>
  )
}
