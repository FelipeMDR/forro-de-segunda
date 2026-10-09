import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { podeSerDJ } from '../lib/dj'
import type { ConexaoDJ, PedidoNaFila, SessaoDJ } from '../lib/types'
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
  const [ocupado, setOcupado] = useState(false)
  const pode = profile ? podeSerDJ(profile.cargos, papel) : false

  const carregar = useCallback(async () => {
    if (!pode) return
    const [c, s, f] = await Promise.all([
      api.minhaConexaoDJ(),
      api.sessaoDJAberta(),
      api.filaDaNoite(),
    ])
    setConexao(c)
    setSessao(s)
    setFila(f)
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

  const cancelar = async (p: PedidoNaFila) => {
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

  const proxima = fila[0]

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

      <div className="card space-y-1 p-4">
        <p className="text-xs font-bold uppercase text-tinta-500">Tocando agora</p>
        {sessao?.tocando ? (
          <>
            <p className="font-bold">{sessao.tocando.titulo}</p>
            <p className="text-sm text-tinta-600">{sessao.tocando.artista}</p>
            {sessao.tocando.pedido_por && (
              <p className="text-xs text-brasa-700">pedida por {sessao.tocando.pedido_por}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-tinta-600">Esperando a primeira leitura do Spotify…</p>
        )}
      </div>

      <div className="card space-y-1 p-4">
        <p className="text-xs font-bold uppercase text-tinta-500">Próxima do rodízio</p>
        {proxima ? (
          <p className="text-sm">
            <strong>{proxima.titulo}</strong> — {proxima.artista}
            <span className="text-tinta-500"> · pedida por {proxima.nome}</span>
          </p>
        ) : (
          <p className="text-sm text-tinta-600">Nenhum pedido esperando: a playlist segue.</p>
        )}
      </div>

      <div className="card divide-y divide-preto/10">
        <p className="p-4 text-xs font-bold uppercase text-tinta-500">
          Fila ({fila.length})
        </p>
        {fila.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <span className="w-6 text-center text-sm font-bold text-tinta-500">{p.posicao}</span>
            <Avatar nome={p.nome} url={p.avatar_url} tamanho={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.titulo}</p>
              <p className="truncate text-xs text-tinta-500">
                {p.artista} · {p.nome}
              </p>
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
    </div>
  )
}
