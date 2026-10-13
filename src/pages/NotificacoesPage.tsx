import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Icone } from '../components/Icone'
import { Spinner } from '../components/Spinner'
import { TituloRaiz } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatRelative } from '../lib/dates'
import { PAGINA_NOTIFICACOES } from '../lib/types'
import type { Notificacao } from '../lib/types'

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
      className="flex items-center gap-3 rounded-[22px] border-2 border-preto bg-azul-500 p-4 text-preto shadow-[0_4px_0_#000507]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold uppercase tracking-[.06em]">Retrospectiva</p>
        <p className="text-lg font-extrabold leading-tight">Seu semestre chegou em stories</p>
      </div>
      <Icone nome="avancar" tamanho={22} traco={2.6} />
    </Link>
  )
}

/** O texto de cada aviso, depois do nome de quem fez. */
function textoDe(n: Notificacao): string {
  if (n.tipo === 'dupla') {
    return n.pendente
      ? `marcou você como dupla na noite de ${n.data ? formatDate(n.data) : 'hoje'}`
      : 'confirmou a dupla com você'
  }
  if (n.tipo === 'reacao') return 'reagiu à sua foto'
  return `comentou: "${n.detalhe ?? ''}"`
}

/**
 * Um aviso. Reação e comentário levam à publicação (é o que resolve "não
 * sei de qual foto ela está falando"); tocar no rosto ou no nome leva ao
 * perfil de quem fez. A dupla pendente é o único que pede resposta, com
 * os dois botões em tamanho de verdade.
 */
function Aviso({
  n,
  novo,
  ocupado,
  onResponder,
}: {
  n: Notificacao
  novo: boolean
  ocupado: boolean
  onResponder: (aceitar: boolean) => void
}) {
  const navigate = useNavigate()
  const temPost = n.tipo !== 'dupla' && !!n.checkin_id
  const abrirPerfil = (e: MouseEvent) => {
    e.stopPropagation()
    navigate(`/perfil/${n.autor.id}`)
  }
  const aceso = novo || n.pendente
  return (
    <div className={`flex flex-col gap-3 rounded-[20px] p-3.5 ${aceso ? 'bg-sf' : ''}`}>
      <div
        role={temPost ? 'link' : undefined}
        tabIndex={temPost ? 0 : undefined}
        onClick={temPost ? () => navigate(`/publicacao/${n.checkin_id}`) : undefined}
        onKeyDown={
          temPost
            ? (e) => e.key === 'Enter' && navigate(`/publicacao/${n.checkin_id}`)
            : undefined
        }
        className={`flex items-start gap-3 text-left ${temPost ? 'cursor-pointer' : ''}`}
      >
        <button
          type="button"
          onClick={abrirPerfil}
          className="relative shrink-0"
          aria-label={`Ver perfil de ${n.autor.nome}`}
        >
          <Avatar nome={n.autor.nome} url={n.autor.avatar_url} tamanho={44} />
          {n.tipo === 'reacao' && n.detalhe && (
            <span className="absolute -bottom-1 -right-1.5 text-lg leading-none">
              {n.detalhe}
            </span>
          )}
        </button>
        <span className="min-w-0 flex-1 text-[15px] leading-snug">
          <b onClick={abrirPerfil} className="cursor-pointer">
            {n.autor.nome}
          </b>{' '}
          <span className="break-words">{textoDe(n)}</span>
          <br />
          <span className="text-[13px] text-ink3">{formatRelative(n.criado_em)}</span>
        </span>
        {aceso && (
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brasa-500" aria-label="Novo" />
        )}
        {temPost &&
          (n.foto_url ? (
            <img
              src={n.foto_url}
              alt="Ver publicação"
              loading="lazy"
              className="h-12 w-12 shrink-0 rounded-[10px] border-[1.5px] border-linha object-cover"
            />
          ) : (
            <span className="listras h-12 w-12 shrink-0 rounded-[10px] border-[1.5px] border-linha bg-marinho-600" />
          ))}
      </div>
      {n.pendente && (
        <div className="flex gap-2 pl-14">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onResponder(true)}
            className="h-[46px] flex-1 rounded-[14px] border-2 border-preto bg-verde-500 text-[15px] font-extrabold text-preto disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onResponder(false)}
            className="h-[46px] flex-1 rounded-[14px] border-[1.5px] border-linha bg-sf text-[15px] font-bold text-ink disabled:opacity-50"
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
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(true)
  const [semestreEncerrado, setSemestreEncerrado] = useState(false)
  /**
   * Quando o painel tinha sido visto antes desta abertura — é o que diz
   * quais avisos são novos. `undefined` enquanto não se sabe (nada
   * acende), `null` = nunca tinha aberto (tudo é novo).
   */
  const [vistoAntes, setVistoAntes] = useState<string | null | undefined>(undefined)
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
    // Abriu o painel = viu tudo. O contador da barra zera na próxima
    // leitura; aqui os que eram novos continuam acesos até sair.
    void api
      .marcarNotificacoesVistas()
      .then((antes) => setVistoAntes(antes))
      .catch(() => setVistoAntes(undefined))
    void api
      .semestreEncerrado()
      .then(setSemestreEncerrado)
      // Sem a migração 017 a tabela não existe — o painel vale sem o convite
      .catch(() => setSemestreEncerrado(false))
  }, [api, carregar])

  // Rolagem infinita: mesma lógica do feed
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
      toast(
        aceitar
          ? `Dupla confirmada com ${n.autor.nome.split(' ')[0]}. Conta nas Parcerias e na Forródex.`
          : 'Marcação recusada',
      )
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  // Pendências na frente: são as únicas que pedem resposta, e ficavam
  // soterradas entre reações e comentários, que só avisam.
  const ordenados = itens
    ? [...itens.filter((n) => n.pendente), ...itens.filter((n) => !n.pendente)]
    : null
  const ehNovo = (n: Notificacao) =>
    vistoAntes !== undefined && (vistoAntes === null || n.criado_em > vistoAntes)
  const temNovos = !!itens?.some((n) => !n.pendente && ehNovo(n))

  return (
    <div className="anima-tela">
      <TituloRaiz
        acao={
          temNovos && (
            <button
              type="button"
              onClick={() => setVistoAntes(new Date().toISOString())}
              className="h-11 text-[15px] font-extrabold text-bl-t"
            >
              Marcar como lidos
            </button>
          )
        }
      >
        Avisos
      </TituloRaiz>

      {erro ? (
        <div className="px-4">
          <ErrorState erro={erro} onRetry={() => void carregar()} />
        </div>
      ) : ordenados === null ? (
        <Spinner texto="Carregando…" />
      ) : (
        <div className="flex flex-col gap-2 px-3">
          {semestreEncerrado && (
            <div className="px-1 pb-2">
              <ConviteRetrospectiva />
            </div>
          )}
          {ordenados.length === 0 && !semestreEncerrado && (
            <p className="px-4 py-10 text-center text-[15px] leading-snug text-ink3">
              Nada por aqui ainda. Reações, comentários e marcações de dupla
              aparecem aqui.
            </p>
          )}
          {ordenados.map((n) => (
            <Aviso
              key={n.id}
              n={n}
              novo={!n.pendente && ehNovo(n)}
              ocupado={ocupado === n.id}
              onResponder={(aceitar) => void responder(n, aceitar)}
            />
          ))}
          {temMais && (
            <div ref={sentinela} className="py-4 text-center text-[13px] text-ink3">
              {carregandoMais ? 'Carregando mais…' : ' '}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
