import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  CHAVE_STATE_SPOTIFY,
  LIMITE_DJS,
  novoStateSpotify,
  redirectSpotify,
  urlAutorizacaoSpotify,
} from '../lib/dj'
import type { ConexaoDJ } from '../lib/types'
import { Icone } from './Icone'
import { BotaoAcao, BotaoSuave } from './ui'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'

/**
 * Conexão do Spotify de quem pode ser DJ. Para os outros, nada aparece:
 * a conta do aluno não ganha um botão que ele não pode usar — nem a do
 * professor, depois que as 5 vagas de DJ foram preenchidas.
 */
export function ConexaoSpotify() {
  const { api } = useAuth()
  const toast = useToast()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pode = usePodeSerDJ() === true

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
        toast('Spotify conectado (demonstração)')
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
    <div className="flex flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-preto text-azul-300">
          <Icone nome="fone" tamanho={22} traco={2.3} />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-base font-extrabold">Spotify · Modo DJ</p>
          <p className="text-[13px] leading-snug text-ink3">
            Para tocar os pedidos no Espaço Livre, pelo seu Spotify Premium.
          </p>
        </div>
      </div>
      {conexao === null ? (
        <p className="text-sm text-ink3">Carregando…</p>
      ) : conexao.conectado ? (
        <>
          <p className="text-[15px]">
            Conectado como <b>{conexao.spotify_nome ?? 'sua conta'}</b>
          </p>
          {conexao.plano !== null && conexao.plano !== 'premium' && (
            <p className="rounded-xl border-[1.5px] border-brasa-500 px-3 py-2 text-sm">
              O Modo DJ precisa de Spotify Premium.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              to="/dj"
              className="flex h-11 items-center rounded-[14px] border-2 border-preto bg-azul-500 px-4 text-[15px] font-extrabold text-preto"
            >
              Abrir Modo DJ
            </Link>
            <BotaoSuave tamanho="p" disabled={ocupado} onClick={() => void desconectar()}>
              Desconectar
            </BotaoSuave>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-snug text-ink2">
            Sua conta Spotify precisa estar liberada pela organização no painel do
            Spotify. Quem conecta ganha o cargo de DJ — são só {LIMITE_DJS} vagas.
          </p>
          <BotaoAcao tamanho="m" sombra={false} bloco disabled={ocupado} onClick={() => void conectar()}>
            Conectar meu Spotify
          </BotaoAcao>
        </>
      )}
    </div>
  )
}
