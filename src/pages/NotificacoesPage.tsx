import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { agrupaPorDia } from '../lib/agrupaPorDia'
import { formatRelative } from '../lib/dates'
import { PAGINA_NOTIFICACOES } from '../lib/types'
import type { Notificacao } from '../lib/types'

/** Título de bloco: PENDÊNCIAS, HOJE, ONTEM… */
function TituloBloco({
  children,
  destaque = false,
}: {
  children: ReactNode
  destaque?: boolean
}) {
  return (
    <h2
      className={`px-1 text-xs font-extrabold uppercase tracking-wide ${
        destaque ? 'text-brasa-700' : 'text-tinta-500'
      }`}
    >
      {children}
    </h2>
  )
}

/**
 * Convite da retrospectiva.
 *
 * O balanço do semestre era a tela mais escondida do app: só existia
 * como um botão dentro do perfil. Aqui ele vira o que sempre foi — um
 * acontecimento, que chega até a pessoa em vez de esperar ser
 * procurado.
 */
function ConviteRetrospectiva() {
  return (
    <Link
      to="/retrospectiva"
      // azul-600 e não o 500 oficial: branco sobre o 500 dá 3,49:1, e
      // este texto é pequeno (precisa de 4,5:1). O 600 leva a 5,07:1 no
      // ponto mais claro do gradiente, e a marca continua reconhecível.
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-azul-600 to-marinho-500 p-4 text-white shadow-sm"
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl"
      >
        ✨
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold leading-tight">
          Sua retrospectiva do semestre chegou
        </p>
        {/* /90 e não /85: o 85 cai para 4,11:1 sobre o azul-600 */}
        <p className="mt-0.5 text-xs text-white/90">
          Toque para ver seu balanço
        </p>
      </div>
      <span aria-hidden className="shrink-0 text-white/70">
        ›
      </span>
    </Link>
  )
}

/**
 * Pendência de dupla: a única linha do painel que pede uma resposta.
 *
 * Sai da lista comum e ganha cartão próprio no topo, com os dois botões
 * em tamanho de verdade — antes eram duas pílulas de 12px perdidas no
 * meio de reações e comentários, que só avisam.
 */
function CartaoPendencia({
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
    <div className="card space-y-3 border-brasa-500/40 p-4">
      <div className="flex items-center gap-3">
        <Link to={`/perfil/${n.autor.id}`} className="shrink-0">
          <Avatar nome={n.autor.nome} url={n.autor.avatar_url} tamanho={40} />
        </Link>
        <p className="min-w-0 flex-1 text-sm">
          <strong>{n.autor.nome}</strong> marcou vocês como dupla 💃
        </p>
      </div>
      {/* py-3 leva os dois de 42px para 48: o padrão do `.btn` para
          quando o botão fica no meio do texto, aqui é o alvo principal
          da tela e precisa dos 44px mínimos. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-primary py-3"
          disabled={ocupado}
          onClick={onConfirmar}
        >
          Confirmar
        </button>
        <button
          className="btn-ghost py-3"
          disabled={ocupado}
          onClick={onRecusar}
        >
          Não rolou
        </button>
      </div>
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
function LinhaNotificacao({ n }: { n: Notificacao }) {
  const conteudo =
    n.tipo === 'dupla' ? (
      // Pendência não passa por aqui: ela vira cartão no topo. O que
      // sobra é a dupla já confirmada, que é só um aviso.
      <p className="text-sm">
        <strong>{n.autor.nome}</strong> dançou com você 💃
      </p>
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

  // Sem cartão em volta, o respiro horizontal já vem da página; a
  // margem negativa só alarga a área tocável para além do texto.
  if (n.tipo === 'dupla' || !n.checkin_id) {
    return (
      <div className="flex items-start gap-3 py-3.5">
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
      className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3.5 transition hover:bg-preto/5"
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
  const [semestreEncerrado, setSemestreEncerrado] = useState(false)
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
    void api
      .semestreEncerrado()
      .then(setSemestreEncerrado)
      // Sem a migração 017 a tabela não existe — o painel vale sem o convite
      .catch(() => setSemestreEncerrado(false))
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

  // Pendências saem da linha do tempo: são as únicas que pedem resposta,
  // e ficavam soterradas entre reações e comentários, que só avisam.
  const pendencias = itens.filter((n) => n.pendente)
  const avisos = itens.filter((n) => !n.pendente)
  const porDia = agrupaPorDia(avisos, (n) => n.criado_em)
  const vazio = itens.length === 0 && !semestreEncerrado

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">🔔 Avisos</h1>

      {semestreEncerrado && <ConviteRetrospectiva />}

      {vazio ? (
        <EmptyState emoji="🌵" titulo="Nada por aqui ainda">
          <p className="text-sm text-tinta-500">
            Curtidas, comentários e marcações de dança aparecem aqui.
          </p>
        </EmptyState>
      ) : (
        <>
          {pendencias.length > 0 && (
            <section className="space-y-2">
              <TituloBloco destaque>
                ⚡ {pendencias.length === 1 ? 'Pendência' : 'Pendências'}
              </TituloBloco>
              {pendencias.map((n) => (
                <CartaoPendencia
                  key={n.id}
                  n={n}
                  ocupado={ocupado === n.id}
                  onConfirmar={() => void responder(n, true)}
                  onRecusar={() => void responder(n, false)}
                />
              ))}
            </section>
          )}

          {/* Sem cartão em volta: uma caixa branca por bloco fazia o
              painel virar uma pilha de caixas, e a lista é justamente o
              lugar onde nada precisa de moldura. As linhas se separam
              por um fio, e a superfície fica só na miniatura. */}
          {porDia.map((grupo) => (
            <section key={grupo.rotulo} className="space-y-1">
              <TituloBloco>{grupo.rotulo}</TituloBloco>
              <div className="divide-y divide-preto/10">
                {grupo.itens.map((n) => (
                  <LinhaNotificacao key={n.id} n={n} />
                ))}
              </div>
            </section>
          ))}

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
