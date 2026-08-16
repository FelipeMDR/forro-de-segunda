import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Pedido de consentimento para quem já tinha conta.
 *
 * Quem se cadastra depois da exigência aceita na própria tela de
 * cadastro. Estas são as contas anteriores — a maior parte da turma —
 * que nunca viram aviso nenhum. Sem pedir a elas, a exigência valeria
 * só para os novos e a base ficaria sem base legal.
 *
 * É um cartão no topo do feed, não uma janela que tranca o app: a
 * pessoa consegue ler o aviso inteiro antes de decidir, e continuar
 * usando enquanto lê. Ele não some sozinho — fica até ser respondido.
 */
export function AceiteTermos() {
  const { api, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)

  // `undefined` = coluna ainda não existe no banco (migração 019 não
  // rodou). Nesse caso não há como registrar nada, então não pede.
  if (!profile || profile.termos_aceitos_em !== null) return null

  const aceitar = async () => {
    setSalvando(true)
    try {
      await api.aceitarTermos()
      await refreshProfile()
      toast('Obrigado! 🙌')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="card space-y-3 border-azul-500/40 p-4">
      <div>
        <p className="text-sm font-extrabold">Uma coisa rápida 📄</p>
        <p className="mt-1 text-sm text-tinta-700">
          Escrevemos um aviso explicando que dados o app guarda, por quanto
          tempo e quem enxerga o quê. Dá uma lida e confirma para a gente?
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/privacidade" className="btn-ghost">
          Ler o aviso
        </Link>
        <button
          className="btn-primary flex-1"
          disabled={salvando}
          onClick={() => void aceitar()}
        >
          {salvando ? 'Salvando…' : 'Li e aceito'}
        </button>
      </div>
    </div>
  )
}
