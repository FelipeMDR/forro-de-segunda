import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Equalizador, Icone } from '../components/Icone'
import { CapaAlbum, LinhaPedido } from '../components/LinhaPedido'
import { Spinner } from '../components/Spinner'
import { BotaoAcao, Cabecalho, CampoBusca, Confirmar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { diaDaNoite } from '../lib/dates'
import { proximasNaTela } from '../lib/filaMusica'
import type { FaixaSpotify, PedidoMusica, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'
import { useSessaoDJAoVivo } from '../lib/useSessaoDJAoVivo'

/** "toca daqui a ~N músicas" a partir da posição na lista de próximas. */
function quando(posicao: number, naFilaDoSpotify: boolean): string {
  if (naFilaDoSpotify) return 'é a próxima! já está na fila do Spotify'
  if (posicao === 1) return 'é a próxima!'
  const antes = posicao - 1
  return `toca daqui a ~${antes} ${antes === 1 ? 'música' : 'músicas'}`
}

/**
 * Quantas músicas da fila aparecem antes de "Ver a fila inteira". A
 * fila cheia de uma noite movimentada viraria uma rolagem longa; as
 * próximas cinco respondem quase sempre o que a pessoa quer saber.
 */
const PREVIA_DA_FILA = 5

/** "Tocando agora": o cartão azul com o equalizador. */
export function TocandoAgora({ sessao }: { sessao: SessaoDJ }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-3xl border-2 border-preto bg-azul-500 p-3.5 text-preto shadow-[0_4px_0_#000507]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.06em]">
          <Equalizador className="!h-3.5" />
          Tocando agora
        </span>
        <span className="text-xs font-extrabold">DJ {sessao.dj_nome.split(' ')[0]}</span>
      </div>
      <div className="rounded-2xl bg-sf p-2.5 text-ink">
        {sessao.tocando ? (
          <LinhaPedido
            titulo={sessao.tocando.titulo}
            artista={sessao.tocando.artista}
            capaUrl={sessao.tocando.capa_url}
            tamanhoCapa={64}
            pessoa={
              sessao.tocando.pedido_por
                ? { nome: sessao.tocando.pedido_por, avatarUrl: sessao.tocando.pedido_por_avatar }
                : null
            }
          />
        ) : (
          <p className="px-1 py-2 text-sm text-ink3">Esperando a primeira leitura do Spotify…</p>
        )}
      </div>
    </div>
  )
}

export function MusicaPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const podeSerDJ = usePodeSerDJ() === true
  const [sessao, setSessao] = useState<SessaoDJ | null | undefined>(undefined)
  const [fila, setFila] = useState<PedidoNaFila[]>([])
  const [pedidos, setPedidos] = useState<PedidoMusica[]>([])
  const [temCheckin, setTemCheckin] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<FaixaSpotify[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [pedindo, setPedindo] = useState<string | null>(null)
  const [filaInteira, setFilaInteira] = useState(false)
  const [cancelando, setCancelando] = useState<PedidoMusica | null>(null)
  // Check-in não "desaparece": confirmado uma vez na noite, não consulta mais
  const checkinConfirmadoNa = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    const s = await api.sessaoDJAberta()
    setSessao(s)
    if (!s || !userId) {
      setFila([])
      setPedidos([])
      return
    }
    const [f, p] = await Promise.all([api.filaDaNoite(), api.pedidosDaNoite()])
    setFila(f)
    setPedidos(p)
    if (checkinConfirmadoNa.current !== s.noite) {
      const cs = await api.checkinsDe(userId)
      const tem = cs.some(
        (c) => !c.presencaAnulada && diaDaNoite(new Date(c.criado_em)) === s.noite,
      )
      setTemCheckin(tem)
      if (tem) checkinConfirmadoNa.current = s.noite
    }
  }, [api, userId])
  // A troca de música chega na hora, pela sessão (tempo real); a busca
  // periódica fica só para pedidos novos de outras pessoas
  useSessaoDJAoVivo(api, carregar)
  useAtualizacaoPeriodica(carregar, 120_000)

  // Só ao enviar o formulário: buscar a cada tecla multiplicaria as
  // chamadas (e os logs) por dez
  const buscar = async (e: FormEvent) => {
    e.preventDefault()
    if (termo.trim().length < 2) return
    setBuscando(true)
    try {
      setResultados(await api.buscarMusicas(termo))
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setBuscando(false)
    }
  }

  const pedir = async (f: FaixaSpotify) => {
    setPedindo(f.uri)
    try {
      await api.pedirMusica(f)
      // Pedido feito, a busca já cumpriu o papel: some da tela para a
      // fila voltar a ser o que se vê
      setResultados(null)
      setTermo('')
      toast('Pedido feito! Ele entra no rodízio.')
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setPedindo(null)
    }
  }

  const cancelar = async (p: PedidoMusica) => {
    try {
      await api.cancelarPedido(p.id)
      setCancelando(null)
      toast('Pedido cancelado')
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  if (sessao === undefined) return <Spinner texto="Carregando os pedidos…" />

  if (sessao === null) {
    return (
      <div className="anima-tela">
        <Cabecalho titulo="Música da noite" />
        <div className="px-4 pt-1">
          <div className="flex flex-col items-start gap-2.5 rounded-[22px] border border-linha bg-sf p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-sf2 text-ink3">
              <Icone nome="fone" tamanho={24} traco={2.3} />
            </span>
            <span className="text-xl font-extrabold">Pedidos fechados agora</span>
            <span className="text-[15px] leading-relaxed text-ink2">
              Os pedidos abrem quando um DJ liga o Modo DJ no salão. Aparece aqui e na
              tela Hoje.
            </span>
            {podeSerDJ && (
              <BotaoAcao
                cor="azul"
                tamanho="m"
                sombra={false}
                className="mt-1"
                onClick={() => navigate('/dj')}
              >
                <Icone nome="fone" tamanho={20} traco={2.3} />
                Abrir Modo DJ
              </BotaoAcao>
            )}
          </div>
        </div>
      </div>
    )
  }

  const jaPedidas = new Set(pedidos.map((p) => p.uri))
  // A lista que a pessoa vê inclui o pedido que já foi para a fila do
  // Spotify e ainda não tocou — ele é o próximo (ver proximasNaTela)
  const proximas = proximasNaTela(pedidos, fila, sessao.tocando?.pedido_id ?? null, new Date())
  const visiveis = filaInteira ? proximas : proximas.slice(0, PREVIA_DA_FILA)

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Música da noite" />
      <div className="flex flex-col gap-4 px-4 pt-1">
        <TocandoAgora sessao={sessao} />

        {!temCheckin ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-linha bg-sf p-4">
            <span className="text-base font-bold leading-snug">
              Só quem fez check-in hoje pode pedir música.
            </span>
            <BotaoAcao tamanho="m" sombra={false} onClick={() => navigate('/checkin')}>
              Fazer check-in
            </BotaoAcao>
          </div>
        ) : (
          <>
            <form onSubmit={(e) => void buscar(e)} className="flex gap-2">
              <CampoBusca
                className="h-14 flex-1"
                aria-label="Buscar música ou artista"
                placeholder="Buscar música ou artista"
                enterKeyHint="search"
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value)
                  if (!e.target.value) setResultados(null)
                }}
              />
              {termo.trim().length >= 2 && (
                <BotaoAcao type="submit" tamanho="m" sombra={false} className="h-14" disabled={buscando}>
                  {buscando ? '…' : 'Buscar'}
                </BotaoAcao>
              )}
            </form>
            {resultados !== null ? (
              <div className="flex flex-col overflow-hidden rounded-[20px] border border-linha bg-sf">
                {resultados.length === 0 && (
                  <p className="p-4 text-sm text-ink3">Nada encontrado. Tente outro nome.</p>
                )}
                {resultados.map((f) => (
                  <div key={f.uri} className="flex items-center gap-3 border-b border-linha px-3 py-2.5 last:border-b-0">
                    <CapaAlbum url={f.capa_url} tamanho={44} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-extrabold">{f.titulo}</span>
                      <span className="truncate text-sm text-ink3">{f.artista}</span>
                    </div>
                    {jaPedidas.has(f.uri) ? (
                      <span className="shrink-0 pr-1 text-right text-[13px] font-bold text-ink3">
                        Já pedida hoje
                      </span>
                    ) : (
                      <BotaoAcao
                        tamanho="p"
                        sombra={false}
                        disabled={pedindo !== null}
                        onClick={() => void pedir(f)}
                      >
                        {pedindo === f.uri ? 'Pedindo…' : 'Pedir'}
                      </BotaoAcao>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="px-1 text-sm leading-snug text-ink3">
                Uma música de cada pessoa por rodada. A mesma música não toca duas vezes
                na noite.
              </span>
            )}
          </>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-[19px] font-extrabold">A seguir</span>
            <span className="text-[13px] font-bold text-ink3">rodízio justo</span>
          </div>
          {proximas.length === 0 && (
            <p className="rounded-[18px] border border-linha bg-sf px-4 py-4 text-sm text-ink3">
              Nenhum pedido esperando — peça o seu!
            </p>
          )}
          {visiveis.map(({ pedido: p, posicao, naFilaDoSpotify }) => {
            const meu = p.user_id === userId
            return (
              <div
                key={p.id}
                className="rounded-[18px] border-[1.5px] px-3 py-2.5"
                style={{
                  background: meu ? 'rgba(222,83,0,.12)' : 'var(--sf)',
                  borderColor: meu ? '#DE5300' : 'var(--line)',
                }}
              >
                <LinhaPedido
                  posicao={posicao}
                  titulo={p.titulo}
                  artista={p.artista}
                  capaUrl={p.capa_url}
                  pessoa={{ nome: meu ? 'você' : p.nome, avatarUrl: p.avatar_url }}
                  detalhe={
                    meu
                      ? quando(posicao, naFilaDoSpotify)
                      : naFilaDoSpotify
                        ? 'já está na fila do Spotify'
                        : undefined
                  }
                  acao={
                    // Já foi para o Spotify: não dá mais para tirar de lá
                    meu && !naFilaDoSpotify ? (
                      <button
                        type="button"
                        onClick={() => setCancelando(p)}
                        className="h-10 shrink-0 rounded-xl border-[1.5px] border-linha px-3 text-sm font-bold text-ink"
                      >
                        Cancelar
                      </button>
                    ) : undefined
                  }
                />
              </div>
            )
          })}
          {proximas.length > PREVIA_DA_FILA && (
            <button
              type="button"
              className="h-11 text-sm font-extrabold text-bl-t"
              onClick={() => setFilaInteira((v) => !v)}
            >
              {filaInteira
                ? 'Mostrar só as próximas'
                : `Ver a fila inteira (${proximas.length} músicas)`}
            </button>
          )}
        </div>
      </div>

      <Confirmar
        aberto={cancelando !== null}
        titulo="Cancelar seu pedido?"
        texto={cancelando ? `“${cancelando.titulo}” sai da fila e não vai tocar hoje.` : undefined}
        ok="Cancelar pedido"
        onOk={() => cancelando && void cancelar(cancelando)}
        onVoltar={() => setCancelando(null)}
      />
    </div>
  )
}
