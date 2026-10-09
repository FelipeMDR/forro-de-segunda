import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { LinhaPedido } from '../components/LinhaPedido'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { podeSerDJ } from '../lib/dj'
import { proximasNaTela } from '../lib/filaMusica'
import type { ConexaoDJ, PedidoMusica, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'

const AVISOS: Record<NonNullable<SessaoDJ['aviso']>, string> = {
  sem_aparelho:
    'O Spotify não está tocando em nenhum aparelho. Dê play na playlist no Spotify.',
  sem_premium:
    'O Spotify recusou o controle do player. A conta precisa ser Premium e estar liberada no painel do Spotify.',
}

/**
 * Modo DJ: ligar, ver a fila e cuidar dela. O professor NÃO precisa
 * deixar esta tela aberta — quem manda as músicas é o servidor, a cada
 * minuto. Ela serve para ver e cancelar.
 */
export function DJPage() {
  const { api, userId, profile, papel } = useAuth()
  const toast = useToast()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [sessao, setSessao] = useState<SessaoDJ | null>(null)
  const [fila, setFila] = useState<PedidoNaFila[]>([])
  const [pedidos, setPedidos] = useState<PedidoMusica[]>([])
  const [ocupado, setOcupado] = useState(false)
  const pode = profile ? podeSerDJ(profile.cargos, papel) : false

  const carregar = useCallback(async () => {
    if (!pode) return
    const [c, s, f, p] = await Promise.all([
      api.minhaConexaoDJ(),
      api.sessaoDJAberta(),
      api.filaDaNoite(),
      api.pedidosDaNoite(),
    ])
    setConexao(c)
    setSessao(s)
    setFila(f)
    setPedidos(p)
  }, [api, pode])
  useAtualizacaoPeriodica(carregar, 30_000)

  const ligar = async (assumir: boolean) => {
    setOcupado(true)
    try {
      let r = await api.ligarModoDJ(assumir)
      if (r.tipo === 'ocupado') {
        if (!window.confirm(`${r.dj_nome} está de DJ agora. Assumir?`)) return
        r = await api.ligarModoDJ(true)
      }
      // Primeira passada já, sem esperar o minuto do agendamento
      await api.cutucarLoopDJ()
      await carregar()
      toast('Modo DJ ligado 🎧')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const desligar = async () => {
    if (!window.confirm('Desligar o Modo DJ? Os pedidos que ainda estão esperando não vão tocar.')) {
      return
    }
    setOcupado(true)
    try {
      await api.desligarModoDJ()
      await carregar()
      toast('Modo DJ desligado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const cancelar = async (p: PedidoMusica) => {
    try {
      await api.cancelarPedido(p.id)
      await carregar()
      toast(`Pedido de ${p.nome} cancelado`)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  if (!pode) {
    return (
      <div className="card p-5 text-sm text-tinta-700">
        O Modo DJ é para professores. Para pedir uma música, use{' '}
        <Link to="/musica" className="font-bold underline">
          Pedir música
        </Link>
        .
      </div>
    )
  }
  if (conexao === null) return <Spinner texto="Carregando o Modo DJ…" />
  if (!conexao.conectado) {
    return (
      <div className="card space-y-3 p-5">
        <h1 className="text-lg font-extrabold">Modo DJ 🎧</h1>
        <p className="text-sm text-tinta-700">
          Primeiro conecte seu Spotify em Meus dados e acesso.
        </p>
        <Link to="/perfil/conta" className="btn-primary">
          Conectar meu Spotify
        </Link>
      </div>
    )
  }

  const souEu = sessao?.dj_user_id === userId

  if (!souEu) {
    return (
      <div className="card space-y-3 p-5">
        <h1 className="text-lg font-extrabold">Modo DJ 🎧</h1>
        <p className="text-sm text-tinta-700">
          Dê play na sua playlist no Spotify e ligue o Modo DJ. Os pedidos dos
          alunos entram no meio dela, um de cada pessoa por vez.
        </p>
        {sessao && (
          <p className="rounded-xl bg-preto/5 px-3 py-2 text-sm">
            <strong>{sessao.dj_nome}</strong> está de DJ agora.
          </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={ocupado}
          onClick={() => void ligar(Boolean(sessao))}
        >
          {sessao ? 'Assumir o Modo DJ' : 'Ligar Modo DJ'}
        </button>
      </div>
    )
  }

  // Inclui o pedido que já está na fila do Spotify e ainda não tocou
  const proximas = proximasNaTela(pedidos, fila, sessao?.tocando?.pedido_id ?? null, new Date())
  const proxima = proximas[0]?.pedido

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Modo DJ 🎧</h1>
        <button className="btn-ghost" disabled={ocupado} onClick={() => void desligar()}>
          Desligar
        </button>
      </div>

      {sessao?.aviso && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          {AVISOS[sessao.aviso]}
        </p>
      )}

      <div className="card overflow-hidden">
        <p className="px-4 pt-3 text-xs font-bold uppercase text-tinta-500">Tocando agora</p>
        {sessao?.tocando ? (
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
          <p className="p-4 text-sm text-tinta-600">Esperando a primeira leitura do Spotify…</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <p className="px-4 pt-3 text-xs font-bold uppercase text-tinta-500">Próxima do rodízio</p>
        {proxima ? (
          <LinhaPedido
            titulo={proxima.titulo}
            artista={proxima.artista}
            capaUrl={proxima.capa_url}
            pessoa={{ nome: proxima.nome, avatarUrl: proxima.avatar_url }}
          />
        ) : (
          <p className="p-4 text-sm text-tinta-600">Nenhum pedido esperando: a playlist segue.</p>
        )}
      </div>

      <div className="card divide-y divide-preto/10">
        <p className="p-4 text-xs font-bold uppercase text-tinta-500">
          Fila ({proximas.length})
        </p>
        {proximas.map(({ pedido: p, posicao, naFilaDoSpotify }) => (
          <LinhaPedido
            key={p.id}
            posicao={posicao}
            titulo={p.titulo}
            artista={p.artista}
            capaUrl={p.capa_url}
            pessoa={{ nome: p.nome, avatarUrl: p.avatar_url }}
            detalhe={naFilaDoSpotify ? 'já está na fila do Spotify' : undefined}
            acao={
              naFilaDoSpotify ? undefined : (
                <button
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-tinta-600 hover:bg-preto/5"
                  onClick={() => void cancelar(p)}
                >
                  Cancelar
                </button>
              )
            }
          />
        ))}
      </div>
    </div>
  )
}
