import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../lib/dates'
import { PAGINA_NOTIFICACOES } from '../lib/types'
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

/**
 * Uma linha do painel.
 *
 * Reação e comentário viram `<Link>` até a publicação — é o que
 * resolve "não sei de qual foto ela está falando". Como o texto já
 * mostra o nome de quem reagiu (não do dono da foto), não tem link
 * para perfil aqui dentro: um `<a>` dentro de outro `<a>` quebra o
 * HTML, e quem quiser ver o perfil clica no autor já dentro da
 * publicação. "Dancei com" não é sobre uma foto, então continua sem
 * link — só a resposta de confirmar/recusar.
 */
function LinhaNotificacao({
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
  const conteudo =
    n.tipo === 'dupla' ? (
      <LinhaDupla
        n={n}
        ocupado={ocupado}
        onConfirmar={onConfirmar}
        onRecusar={onRecusar}
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
    )

  const rodape = (
    <p className="mt-0.5 text-xs text-tinta-500">
      {formatRelative(n.criado_em)}
    </p>
  )

  if (n.tipo === 'dupla' || !n.checkin_id) {
    return (
      <div className="flex items-start gap-3 p-4">
        <Link to={`/perfil/${n.autor.id}`} className="shrink-0">
          <Avatar nome={n.autor.nome} url={n.autor.avatar_url} tamanho={40} />
        </Link>
        <div className="min-w-0 flex-1">
          {conteudo}
          {rodape}
        </div>
      </div>
    )
  }

  return (
    <Link
      to={`/publicacao/${n.checkin_id}`}
      className="flex items-start gap-3 p-4 transition hover:bg-preto/5"
    >
      <Avatar nome={n.autor.nome} url={n.autor.avatar_url} tamanho={40} />
      <div className="min-w-0 flex-1">
        {conteudo}
        {rodape}
      </div>
      {n.foto_url ? (
        <img
          src={n.foto_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-preto/5 text-lg">
          📷
        </span>
      )}
    </Link>
  )
}

export function NotificacoesPage() {
  const { api } = useAuth()
  const toast = useToast()
  const [itens, setItens] = useState<Notificacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(true)
  /** Marcador invisível no fim da lista — carrega mais ao entrar na tela. */
  const sentinela = useRef<HTMLDivElement | null>(null)

  /**
   * Recarrega só a PRIMEIRA página e funde com o que já está na tela —
   * mesmo truque do feed. Sem isso, confirmar uma dupla refaria a
   * consulta inteira e perderia o lugar de quem já rolou várias páginas.
   */
  const carregar = useCallback(async () => {
    try {
      setErro(null)
      const novos = await api.listNotificacoes({ limite: PAGINA_NOTIFICACOES })
      setItens((atual) => {
        if (!atual) {
          setTemMais(novos.length === PAGINA_NOTIFICACOES)
          return novos
        }
        const idsNovos = new Set(novos.map((n) => n.id))
        const corte = novos[novos.length - 1]?.criado_em
        // Descarta o que estava na faixa recarregada e não voltou: é o
        // que faz uma dupla recusada sumir da tela.
        const cauda = atual.filter(
          (n) => !idsNovos.has(n.id) && (!corte || n.criado_em < corte),
        )
        return [...novos, ...cauda]
      })
    } catch (e) {
      console.error('[notificações] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  const carregarMais = useCallback(async () => {
    if (!itens || itens.length === 0 || carregandoMais) return
    setCarregandoMais(true)
    try {
      const antesDe = itens[itens.length - 1].criado_em
      const proximos = await api.listNotificacoes({
        limite: PAGINA_NOTIFICACOES,
        antesDe,
      })
      setItens((atual) => [...(atual ?? []), ...proximos])
      setTemMais(proximos.length === PAGINA_NOTIFICACOES)
    } catch (e) {
      console.error('[notificações] falha ao carregar mais', e)
    } finally {
      setCarregandoMais(false)
    }
  }, [api, itens, carregandoMais])

  useEffect(() => {
    void carregar()
    // Abriu o painel = viu tudo. O contador zera na próxima leitura.
    void api.marcarNotificacoesVistas().catch(() => {})
  }, [api, carregar])

  // Rolagem infinita: mesma lógica do feed. `rootMargin` positivo busca
  // um pouco ANTES do fim de verdade, para a próxima página já estar
  // pronta quando a rolagem chegar lá.
  useEffect(() => {
    if (!temMais) return
    const el = sentinela.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) void carregarMais()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [temMais, carregarMais])

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
        <>
          <div className="card divide-y divide-preto/10">
            {itens.map((n) => (
              <LinhaNotificacao
                key={n.id}
                n={n}
                ocupado={ocupado === n.id}
                onConfirmar={() => void responder(n, true)}
                onRecusar={() => void responder(n, false)}
              />
            ))}
          </div>

          {temMais && (
            <div ref={sentinela} className="flex justify-center py-4">
              {carregandoMais && (
                <p className="text-xs text-tinta-500">Carregando mais…</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
