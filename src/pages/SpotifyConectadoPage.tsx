import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { CHAVE_STATE_SPOTIFY, redirectSpotify } from '../lib/dj'
import type { ResultadoConexao } from '../lib/types'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; resultado: ResultadoConexao }
  | { tipo: 'erro'; mensagem: string }

const MENSAGENS: Record<ResultadoConexao, { titulo: string; texto: string }> = {
  ok: {
    titulo: 'Spotify conectado! 🎧',
    texto: 'Agora é só ligar o Modo DJ no Espaço Livre.',
  },
  sem_premium: {
    titulo: 'Conectado, mas falta o Premium',
    texto:
      'O Modo DJ precisa de Spotify Premium: sem ele, o Spotify não deixa o app colocar músicas na fila.',
  },
  nao_liberado: {
    titulo: 'Sua conta ainda não foi liberada',
    texto:
      'Sua conta Spotify ainda não foi liberada. Peça à organização para incluir você.',
  },
}

/**
 * Onde o Spotify devolve a pessoa depois do login. Confere o `state`
 * (que só este navegador conhece) e entrega o código ao servidor.
 */
export function SpotifyConectadoPage() {
  const { api } = useAuth()
  const [params] = useSearchParams()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  // O código do Spotify só vale uma vez; o StrictMode roda efeitos duas
  const jaFoi = useRef(false)

  useEffect(() => {
    if (jaFoi.current) return
    jaFoi.current = true
    const esperado = sessionStorage.getItem(CHAVE_STATE_SPOTIFY)
    sessionStorage.removeItem(CHAVE_STATE_SPOTIFY)
    if (params.get('error')) {
      setEstado({ tipo: 'erro', mensagem: 'A conexão foi cancelada no Spotify.' })
      return
    }
    const code = params.get('code')
    if (!code || !esperado || params.get('state') !== esperado) {
      setEstado({
        tipo: 'erro',
        mensagem: 'Esse retorno do Spotify não é válido. Tente conectar de novo.',
      })
      return
    }
    api
      .conectarSpotify(code, redirectSpotify(window.location.origin))
      .then((resultado) => setEstado({ tipo: 'pronto', resultado }))
      .catch((e) => setEstado({ tipo: 'erro', mensagem: (e as Error).message }))
  }, [api, params])

  if (estado.tipo === 'carregando') return <Spinner texto="Conectando ao Spotify…" />

  const titulo =
    estado.tipo === 'pronto' ? MENSAGENS[estado.resultado].titulo : 'Não deu certo'
  const texto =
    estado.tipo === 'pronto' ? MENSAGENS[estado.resultado].texto : estado.mensagem

  return (
    <div className="card space-y-3 p-5">
      <h1 className="text-lg font-extrabold">{titulo}</h1>
      <p className="text-sm text-tinta-700">{texto}</p>
      <div className="flex flex-wrap gap-2">
        {estado.tipo === 'pronto' && estado.resultado === 'ok' && (
          <Link to="/dj" className="btn-primary">
            Abrir Modo DJ
          </Link>
        )}
        <Link to="/perfil/conta" className="btn-ghost">
          Voltar para a conta
        </Link>
      </div>
    </div>
  )
}
