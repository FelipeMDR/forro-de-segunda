import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { diaDaNoite } from '../lib/dates'
import type { FaixaSpotify, PedidoMusica, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'

function Capa({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-preto/5">
      🎵
    </span>
  )
}

/** "toca daqui a ~N músicas" a partir da posição no rodízio. */
function quando(posicao: number): string {
  if (posicao === 1) return 'é a próxima!'
  const antes = posicao - 1
  return `toca daqui a ~${antes} ${antes === 1 ? 'pedido' : 'pedidos'}`
}

export function MusicaPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const [sessao, setSessao] = useState<SessaoDJ | null | undefined>(undefined)
  const [fila, setFila] = useState<PedidoNaFila[]>([])
  const [pedidos, setPedidos] = useState<PedidoMusica[]>([])
  const [temCheckin, setTemCheckin] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<FaixaSpotify[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [pedindo, setPedindo] = useState<string | null>(null)
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
  useAtualizacaoPeriodica(carregar, 30_000)

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
      toast('Pedido feito! 🎶')
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setPedindo(null)
    }
  }

  const cancelar = async (p: PedidoNaFila) => {
    try {
      await api.cancelarPedido(p.id)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  if (sessao === undefined) return <Spinner texto="Carregando os pedidos…" />
  if (sessao === null) {
    return (
      <div className="card space-y-2 p-5">
        <h1 className="text-lg font-extrabold">Pedir música 🎶</h1>
        <p className="text-sm text-tinta-700">
          Os pedidos abrem quando um professor liga o Modo DJ no Espaço Livre.
        </p>
      </div>
    )
  }

  const jaPedidas = new Set(pedidos.map((p) => p.uri))
  const meus = fila.filter((p) => p.user_id === userId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Pedir música 🎶</h1>
        <p className="text-sm text-tinta-600">DJ: {sessao.dj_nome}</p>
      </div>

      {sessao.tocando && (
        <div className="card flex items-center gap-3 p-4">
          <Capa url={sessao.tocando.capa_url} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-tinta-500">Tocando agora</p>
            <p className="truncate font-bold">{sessao.tocando.titulo}</p>
            <p className="truncate text-xs text-tinta-600">
              {sessao.tocando.artista}
              {sessao.tocando.pedido_por && ` · pedida por ${sessao.tocando.pedido_por}`}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={(e) => void buscar(e)} className="flex gap-2">
        <input
          className="input flex-1"
          aria-label="Buscar música"
          placeholder="Música ou artista"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={buscando || termo.trim().length < 2}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {resultados !== null && (
        <div className="card divide-y divide-preto/10">
          {resultados.length === 0 && (
            <p className="p-4 text-sm text-tinta-600">Nada encontrado. Tente outro nome.</p>
          )}
          {resultados.map((f) => (
            <div key={f.uri} className="flex items-center gap-3 p-3">
              <Capa url={f.capa_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{f.titulo}</p>
                <p className="truncate text-xs text-tinta-500">{f.artista}</p>
              </div>
              {jaPedidas.has(f.uri) ? (
                <span className="shrink-0 text-xs text-tinta-500">Já pedida hoje</span>
              ) : !temCheckin ? (
                <Link to="/checkin" className="shrink-0 text-xs font-bold text-brasa-700 underline">
                  Faça seu check-in para pedir
                </Link>
              ) : (
                <button
                  className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                  disabled={pedindo !== null}
                  onClick={() => void pedir(f)}
                >
                  {pedindo === f.uri ? 'Pedindo…' : 'Pedir'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {meus.length > 0 && (
        <div className="card divide-y divide-preto/10">
          <p className="p-4 text-xs font-bold uppercase text-tinta-500">Meus pedidos</p>
          {meus.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.titulo}</p>
                <p className="text-xs text-tinta-500">{quando(p.posicao)}</p>
              </div>
              <button
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-tinta-600 hover:bg-preto/5"
                onClick={() => void cancelar(p)}
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card divide-y divide-preto/10">
        <p className="p-4 text-xs font-bold uppercase text-tinta-500">Próximas</p>
        {fila.length === 0 && (
          <p className="p-4 text-sm text-tinta-600">Nenhum pedido esperando — peça o seu!</p>
        )}
        {fila.slice(0, 5).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <span className="w-6 text-center text-sm font-bold text-tinta-500">{p.posicao}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.titulo}</p>
              <p className="truncate text-xs text-tinta-500">pedida por {p.nome}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
