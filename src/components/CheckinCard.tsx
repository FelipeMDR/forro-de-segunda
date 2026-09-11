import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import {
  REACTION_TYPES,
  cargoPrincipal,
  emojiCargo,
  type FeedItem,
} from '../lib/types'
import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'

export function CheckinCard({
  item,
  onChanged,
}: {
  item: FeedItem
  onChanged: () => void
}) {
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const [menuAberto, setMenuAberto] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [comentariosAbertos, setComentariosAbertos] = useState(false)

  // Só o cargo mais alto vai para o feed — a lista completa fica no perfil
  const cargo = cargoPrincipal(item.autor.cargos)

  /**
   * As reações vivem em estado local, e não direto na prop.
   *
   * Reagir era: mandar para o servidor, ESPERAR, recarregar o feed
   * inteiro, e só então o coração acendia. No 4G isso levava segundos
   * sem nenhum sinal na tela — a pessoa tocava de novo achando que não
   * pegou, e o segundo toque DESFAZIA o primeiro. Somado à corrida de
   * recargas do feed (ver `FeedPage.carregar`), a reação "parava de
   * funcionar" justamente para quem mais reagia.
   *
   * Agora o toque muda a tela na hora e o servidor confirma depois. Se
   * falhar, volta ao que era e avisa. O feed sincroniza a cópia local
   * quando a prop muda (tempo real, recarga), então quem reagiu de outro
   * aparelho também aparece — só não é ele que faz o coração acender.
   */
  const [reacoes, setReacoes] = useState(item.reacoes)
  useEffect(() => {
    setReacoes(item.reacoes)
  }, [item.reacoes])
  // Um toque por vez por cartão: dois pedidos em voo podem chegar ao
  // servidor fora de ordem e deixar o oposto do que a pessoa queria.
  const [reagindo, setReagindo] = useState(false)

  const minhaReacao = reacoes.find((r) => r.user_id === userId)?.tipo
  const contagem = (tipo: string) =>
    reacoes.filter((r) => r.tipo === tipo).length

  const reagir = async (tipo: string) => {
    if (reagindo || !userId) return
    const antes = reacoes
    // Mesma regra do servidor (`toggleReaction`): tocar no que já está
    // marcado tira; tocar noutro troca; tocar em nada põe.
    const semAMinha = reacoes.filter((r) => r.user_id !== userId)
    setReacoes(
      minhaReacao === tipo ? semAMinha : [...semAMinha, { tipo, user_id: userId }],
    )
    setReagindo(true)
    try {
      await api.toggleReaction(item.id, tipo)
      // Sem `onChanged()` de propósito: a tela já está certa, e uma
      // recarga inteira do feed aqui era a principal fonte da corrida.
      // O tempo real cuida de trazer as reações dos outros.
    } catch (e) {
      setReacoes(antes)
      toast((e as Error).message, 'erro')
    } finally {
      setReagindo(false)
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
  // Só o dono favorita: é o arquivo pessoal dele, não uma curtida
  const meuCheckin = item.user_id === userId

  const favoritar = async () => {
    try {
      await api.setFavorito(item.id, !item.favorito)
      toast(
        item.favorito
          ? 'Tirado dos favoritos'
          : 'Guardado nos favoritos! ⭐ Essa foto não será arquivada.',
      )
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <Link
          to={`/perfil/${item.user_id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar
            nome={item.autor.nome}
            url={item.autor.avatar_url}
            tamanho={38}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-extrabold">
                {item.autor.nome}
              </p>
              {cargo && (
                // Cargo em destaque: é o reconhecimento mais visível do app
                <span className="shrink-0 rounded-full bg-brasa-500/20 px-2 py-0.5 text-[10px] font-extrabold text-brasa-700 ring-1 ring-brasa-500/30">
                  {emojiCargo(cargo)} {cargo}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-tinta-500">
              {item.autor.turma ? `${item.autor.turma} · ` : ''}
              {formatRelative(item.criado_em)}
            </p>
          </div>
        </Link>
        <div className="relative">
          <button
            className="rounded-lg px-2 py-1 text-tinta-500 hover:bg-preto/5"
            aria-label="Mais opções"
            onClick={() => {
              setMenuAberto((v) => !v)
              setConfirmandoExclusao(false)
            }}
          >
            ⋯
          </button>
          {menuAberto && (
            <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-preto/10 bg-papel shadow-xl">
              <button
                className="block w-full px-4 py-3 text-left text-sm font-bold hover:bg-preto/5"
                onClick={() => void denunciar()}
              >
                🚩 Denunciar foto
              </button>
              {podeExcluir &&
                (confirmandoExclusao ? (
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-preto/5"
                    onClick={() => void excluir()}
                  >
                    ⚠️ Confirmar exclusão?
                  </button>
                ) : (
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-bold hover:bg-preto/5"
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
          className="aspect-[4/5] w-full bg-fundo object-cover"
        />
      ) : (
        // Fotos antigas são apagadas pela política de retenção (4 meses);
        // o registro da presença continua valendo.
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-fundo text-tinta-400">
          <span className="text-4xl">🎞️</span>
          <span className="text-xs">Foto arquivada — presença registrada</span>
        </div>
      )}

      {item.legenda && (
        <p className="px-4 pt-3 text-sm text-tinta-900">{item.legenda}</p>
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
              // Sem `disabled`: o botão fica clicável e a cor muda na
              // hora; é o `reagindo` lá em cima que descarta o toque
              // extra, invisível para quem toca uma vez só.
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm transition active:scale-90 ${
                minha
                  ? 'bg-brasa-500/20 ring-1 ring-brasa-400'
                  : 'bg-preto/5 hover:bg-preto/10'
              }`}
            >
              <span>{tipo}</span>
              {n > 0 && <span className="text-xs font-bold">{n}</span>}
            </button>
          )
        })}
        <button
          onClick={() => setComentariosAbertos(true)}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-preto/5 px-3 py-1.5 text-sm hover:bg-preto/10"
        >
          💬
          <span className="text-xs font-bold">{item.comentarios}</span>
        </button>
        {meuCheckin && (
          <button
            onClick={() => void favoritar()}
            aria-pressed={item.favorito}
            title={
              item.favorito
                ? 'Guardado no seu perfil — clique para tirar'
                : 'Guardar no seu perfil (não será arquivado)'
            }
            aria-label={
              item.favorito ? 'Tirar dos favoritos' : 'Guardar nos favoritos'
            }
            className={`rounded-full px-3 py-1.5 text-sm transition active:scale-90 ${
              item.favorito
                ? 'bg-brasa-500/20 ring-1 ring-brasa-400'
                : 'bg-preto/5 hover:bg-preto/10'
            }`}
          >
            {item.favorito ? '⭐' : '☆'}
          </button>
        )}
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
