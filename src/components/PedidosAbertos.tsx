import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { SessaoDJ } from '../lib/types'

/**
 * "Pedidos de música abertos" no topo do feed, enquanto há DJ ligado.
 *
 * Uma consulta ao abrir o feed e outra quando a pessoa volta ao app
 * depois de mais de 2 minutos — o mesmo gatilho que o feed já usa. Sem
 * tempo real: foi o tempo real que estourou a cota de logs (migração 028).
 */
export function PedidosAbertos() {
  const { api } = useAuth()
  const [sessao, setSessao] = useState<SessaoDJ | null>(null)
  const ultima = useRef(0)

  useEffect(() => {
    let cancelado = false
    const carregar = () => {
      ultima.current = Date.now()
      void api
        .sessaoDJAberta()
        .then((s) => {
          if (!cancelado) setSessao(s)
        })
        // Sem a migração 029, simplesmente não aparece
        .catch(() => {})
    }
    carregar()
    const aoVoltar = () => {
      if (!document.hidden && Date.now() - ultima.current > 2 * 60 * 1000) carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [api])

  if (!sessao) return null

  return (
    <Link
      to="/musica"
      className="card brilho-pedidos flex items-center gap-3 border-brasa-500/40 p-4"
    >
      {/* Equalizador animado (index.css): "tem música tocando agora" */}
      <span className="equalizador shrink-0 px-1" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">Pedidos de música abertos</p>
        <p className="truncate text-xs text-tinta-600">
          DJ: {sessao.dj_nome}
          {sessao.tocando ? ` · tocando ${sessao.tocando.titulo}` : ''}
        </p>
      </div>
      <span className="btn-primary shrink-0 px-3 py-1.5 text-xs">Pedir música</span>
    </Link>
  )
}
