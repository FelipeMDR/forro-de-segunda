import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import { REACTION_TYPES, cargoPrincipal, type FeedItem } from '../lib/types'
import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'
import { Icone, IconeMais } from './Icone'
import { BotaoAcao, BotaoSuave, Confirmar, MenuAcoes } from './ui'

/**
 * Uma publicação do feed: a foto ocupa a largura toda (é o que as
 * pessoas vieram ver), com autor em cima e as quatro reações embaixo.
 */
export function CheckinCard({
  item,
  onChanged,
  destaque = false,
}: {
  item: FeedItem
  onChanged: () => void
  /** Fundo levemente aceso — a publicação aberta a partir de um aviso. */
  destaque?: boolean
}) {
  const { api, userId, papel } = useAuth()
  const toast = useToast()
  const [menuAberto, setMenuAberto] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [comentariosAbertos, setComentariosAbertos] = useState(false)
  /** Texto em edição; `null` quando a legenda não está sendo editada. */
  const [rascunho, setRascunho] = useState<string | null>(null)
  const [salvandoLegenda, setSalvandoLegenda] = useState(false)
  /**
   * Cópia local da legenda, pelo mesmo motivo das reações: a nova aparece
   * assim que salva, sem esperar a recarga da lista (que no feed pode
   * nem pegar este cartão, se ele estiver além da primeira página).
   */
  const [legenda, setLegenda] = useState(item.legenda)
  useEffect(() => {
    setLegenda(item.legenda)
  }, [item.legenda])

  // Só o cargo mais alto vai para o feed — a lista completa fica no perfil
  const cargo = cargoPrincipal(item.autor.cargos)

  /**
   * As reações vivem em estado local, e não direto na prop.
   *
   * Reagir era: mandar para o servidor, ESPERAR, recarregar o feed
   * inteiro, e só então o coração acendia. No 4G isso levava segundos
   * sem nenhum sinal na tela — a pessoa tocava de novo achando que não
   * pegou, e o segundo toque DESFAZIA o primeiro.
   *
   * Agora o toque muda a tela na hora e o servidor confirma depois. Se
   * falhar, volta ao que era e avisa. O feed sincroniza a cópia local
   * quando a prop muda (tempo real, recarga).
   */
  const [reacoes, setReacoes] = useState(item.reacoes)
  useEffect(() => {
    setReacoes(item.reacoes)
  }, [item.reacoes])
  // Um toque por vez por cartão: dois pedidos em voo podem chegar ao
  // servidor fora de ordem e deixar o oposto do que a pessoa queria.
  const [reagindo, setReagindo] = useState(false)

  const minhaReacao = reacoes.find((r) => r.user_id === userId)?.tipo
  const contagem = (tipo: string) => reacoes.filter((r) => r.tipo === tipo).length

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
      toast('Denúncia enviada. Obrigado por avisar!')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const excluir = async () => {
    setExcluindo(true)
    try {
      await api.deleteCheckin(item.id)
      setConfirmandoExclusao(false)
      toast('Publicação excluída')
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  const podeExcluir = item.user_id === userId || papel === 'organizador'
  // Só o dono favorita: é o arquivo pessoal dele, não uma curtida
  const meuCheckin = item.user_id === userId

  const salvarLegenda = async () => {
    if (rascunho === null || salvandoLegenda) return
    const nova = rascunho.trim() || null
    if (nova === legenda) {
      setRascunho(null)
      return
    }
    setSalvandoLegenda(true)
    try {
      await api.editarLegenda(item.id, rascunho)
      setLegenda(nova)
      setRascunho(null)
      toast('Legenda atualizada')
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvandoLegenda(false)
    }
  }

  const favoritar = async () => {
    try {
      await api.setFavorito(item.id, !item.favorito)
      toast(
        item.favorito
          ? 'Tirado dos favoritos'
          : 'Guardado nos favoritos. Essa foto não será arquivada.',
      )
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const acoes = [
    ...(meuCheckin
      ? [
          {
            rotulo: legenda ? 'Editar legenda' : 'Escrever legenda',
            onClick: () => {
              setMenuAberto(false)
              setRascunho(legenda ?? '')
            },
          },
        ]
      : []),
    { rotulo: 'Denunciar', onClick: () => void denunciar() },
    ...(podeExcluir
      ? [
          {
            rotulo: 'Excluir publicação',
            perigo: true,
            onClick: () => {
              setMenuAberto(false)
              setConfirmandoExclusao(true)
            },
          },
        ]
      : []),
  ]

  return (
    <article
      className={`flex flex-col gap-2.5 pb-5 pt-1.5 transition-colors duration-500 ${
        destaque ? 'bg-sf2' : ''
      }`}
    >
      <header className="flex items-center gap-2.5 px-4">
        <Link to={`/perfil/${item.user_id}`} className="shrink-0">
          <Avatar nome={item.autor.nome} url={item.autor.avatar_url} tamanho={42} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to={`/perfil/${item.user_id}`}
              className="truncate text-base font-extrabold"
            >
              {item.autor.nome}
            </Link>
            {cargo && (
              // Cargo em destaque: é o reconhecimento mais visível do app
              <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-xs font-extrabold text-or-t">
                {cargo}
              </span>
            )}
          </div>
          <span className="truncate text-[13px] text-ink3">
            {item.autor.turma ? `${item.autor.turma} · ` : ''}
            {formatRelative(item.criado_em)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Mais opções"
          onClick={() => setMenuAberto(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-ink3"
        >
          <IconeMais />
        </button>
      </header>

      {item.foto_url ? (
        <img
          src={item.foto_url}
          alt={legenda ?? `Check-in de ${item.autor.nome}`}
          loading="lazy"
          className="aspect-[4/5] w-full bg-sf2 object-cover"
        />
      ) : (
        // Fotos antigas são apagadas pela política de retenção (4 meses);
        // o registro da presença continua valendo.
        <div className="listras flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-marinho-600 text-[13px] font-bold text-branco/75">
          Foto arquivada · presença registrada
        </div>
      )}

      {rascunho !== null ? (
        <div className="flex flex-col gap-2 px-4">
          <textarea
            className="input resize-none"
            rows={2}
            maxLength={200}
            autoFocus
            aria-label="Legenda"
            placeholder="Escreva algo sobre a noite…"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <BotaoSuave tamanho="p" disabled={salvandoLegenda} onClick={() => setRascunho(null)}>
              Cancelar
            </BotaoSuave>
            <BotaoAcao
              tamanho="p"
              sombra={false}
              disabled={salvandoLegenda}
              onClick={() => void salvarLegenda()}
            >
              {salvandoLegenda ? 'Salvando…' : 'Salvar'}
            </BotaoAcao>
          </div>
        </div>
      ) : (
        legenda && (
          <p className="break-words px-4 text-base leading-snug [text-wrap:pretty]">
            {legenda}
          </p>
        )
      )}

      <div className="flex items-center gap-1.5 px-3">
        {REACTION_TYPES.map((tipo) => {
          const n = contagem(tipo)
          const minha = minhaReacao === tipo
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => void reagir(tipo)}
              aria-pressed={minha}
              aria-label={`Reagir com ${tipo}`}
              // Sem `disabled`: a cor muda na hora; é o `reagindo` lá em
              // cima que descarta o toque extra.
              className={`flex h-10 min-w-11 items-center justify-center gap-[5px] rounded-full border-[1.5px] px-2.5 text-sm font-extrabold text-ink transition-transform active:scale-90 ${
                minha ? 'border-brasa-500 bg-brasa-500/20' : 'border-transparent bg-chip'
              }`}
            >
              <span className="text-[17px] leading-none">{tipo}</span>
              {n > 0 && n}
            </button>
          )
        })}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setComentariosAbertos(true)}
          aria-label="Comentários"
          className="flex h-11 min-w-11 items-center justify-center gap-1 text-sm font-extrabold text-ink2"
        >
          <Icone nome="comentario" traco={2} />
          {item.comentarios > 0 && item.comentarios}
        </button>
        {meuCheckin && (
          <button
            type="button"
            onClick={() => void favoritar()}
            aria-pressed={item.favorito}
            aria-label={item.favorito ? 'Tirar dos favoritos' : 'Guardar nos favoritos'}
            title={
              item.favorito
                ? 'Guardado no seu perfil — toque para tirar'
                : 'Guardar no seu perfil (não será arquivado)'
            }
            className={`flex h-11 w-11 items-center justify-center ${
              item.favorito ? 'text-or-t' : 'text-ink2'
            }`}
          >
            <Icone nome="favorito" traco={2} preenchido={item.favorito} />
          </button>
        )}
      </div>

      <MenuAcoes aberto={menuAberto} onFechar={() => setMenuAberto(false)} acoes={acoes} />
      <Confirmar
        aberto={confirmandoExclusao}
        titulo="Excluir esta publicação?"
        texto={
          meuCheckin
            ? 'A foto sai do feed, e a presença que ela marcou sai junto. Não dá para desfazer.'
            : `A foto de ${item.autor.nome.split(' ')[0]} sai do feed para todo mundo.`
        }
        ok="Excluir"
        ocupado={excluindo}
        onOk={() => void excluir()}
        onVoltar={() => setConfirmandoExclusao(false)}
      />
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
