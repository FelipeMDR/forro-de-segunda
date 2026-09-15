import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { semNome } from '../lib/nome'

/**
 * Pede o nome de quem ficou com o de preenchimento.
 *
 * "Dançarino(a)" é o que o banco põe quando a conta nasce sem nome —
 * lista de chamada sem a coluna, linha em branco, cadastro de antes de
 * a tela perguntar. Para a pessoa é quase invisível (ela sabe quem é),
 * mas no feed, no ranking e no painel da organização é um buraco:
 * cinco "Dançarino(a)" numa lista de presença não dizem nada.
 *
 * Mesmo desenho do pedido de consentimento: um cartão no topo do feed,
 * não uma janela que tranca o app. Fica até ser respondido, e some
 * sozinho quando o perfil deixa de estar com o nome de preenchimento —
 * inclusive se a pessoa trocar pelo caminho de sempre, em Conta.
 */
export function PedirNome() {
  const { api, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!profile || !semNome(profile.nome)) return null

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (nome.trim().length < 2) return
    setSalvando(true)
    try {
      await api.updateProfile({ nome: nome.trim() })
      await refreshProfile()
      toast(`Prazer, ${nome.trim().split(' ')[0]}! ✨`)
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="card space-y-3 border-brasa-500/40 p-4"
    >
      <div>
        <p className="text-sm font-extrabold">Como você se chama? 👋</p>
        <p className="mt-1 text-sm text-tinta-700">
          Sua conta ficou sem nome — é ele que aparece no feed, no ranking e
          na lista de presença. Conta pra gente:
        </p>
      </div>
      <input
        className="input"
        aria-label="Seu nome"
        placeholder="Como a galera te chama"
        autoComplete="name"
        value={nome}
        minLength={2}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <button
        className="btn-primary w-full"
        disabled={salvando || nome.trim().length < 2}
      >
        {salvando ? 'Salvando…' : 'Salvar meu nome'}
      </button>
    </form>
  )
}
