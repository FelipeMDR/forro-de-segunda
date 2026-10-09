import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  CHAVE_STATE_SPOTIFY,
  novoStateSpotify,
  podeSerDJ,
  redirectSpotify,
  urlAutorizacaoSpotify,
} from '../lib/dj'
import type { ConexaoDJ } from '../lib/types'

/**
 * Conexão do Spotify de quem pode ser DJ. Para os outros, nada aparece:
 * a conta do aluno não ganha um botão que ele não pode usar.
 */
export function ConexaoSpotify() {
  const { api, profile, papel } = useAuth()
  const toast = useToast()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pode = profile ? podeSerDJ(profile.cargos, papel) : false

  useEffect(() => {
    if (!pode) return
    void api
      .minhaConexaoDJ()
      .then(setConexao)
      // Sem a migração 029: mostra como não conectado
      .catch(() => setConexao({ conectado: false, spotify_nome: null, plano: null }))
  }, [api, pode])

  if (!pode) return null

  const conectar = async () => {
    if (api.mode === 'demo') {
      // No demo não há Spotify de verdade para abrir
      setOcupado(true)
      try {
        await api.conectarSpotify('demo', '')
        setConexao(await api.minhaConexaoDJ())
        toast('Spotify conectado (demonstração) 🎧')
      } catch (e) {
        toast((e as Error).message, 'erro')
      } finally {
        setOcupado(false)
      }
      return
    }
    const state = novoStateSpotify()
    sessionStorage.setItem(CHAVE_STATE_SPOTIFY, state)
    window.location.href = urlAutorizacaoSpotify(
      redirectSpotify(window.location.origin),
      state,
    )
  }

  const desconectar = async () => {
    setOcupado(true)
    try {
      await api.desconectarSpotify()
      setConexao({ conectado: false, spotify_nome: null, plano: null })
      toast('Spotify desconectado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="text-sm font-bold">Spotify · Modo DJ 🎧</p>
        <p className="text-xs text-tinta-500">
          Para tocar os pedidos dos alunos no Espaço Livre, pelo seu Spotify
          Premium.
        </p>
      </div>
      {conexao === null ? (
        <p className="text-xs text-tinta-500">Carregando…</p>
      ) : conexao.conectado ? (
        <>
          <p className="text-sm">
            Conectado como <strong>{conexao.spotify_nome ?? 'sua conta'}</strong>
          </p>
          {conexao.plano !== null && conexao.plano !== 'premium' && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              O Modo DJ precisa de Spotify Premium.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link to="/dj" className="btn-primary">
              Abrir Modo DJ
            </Link>
            <button
              className="btn-ghost"
              disabled={ocupado}
              onClick={() => void desconectar()}
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-tinta-600">
            Sua conta Spotify precisa estar liberada pela organização no painel
            do Spotify (até 5 professores).
          </p>
          <button
            className="btn-primary w-full"
            disabled={ocupado}
            onClick={() => void conectar()}
          >
            Conectar meu Spotify
          </button>
        </>
      )}
    </div>
  )
}
