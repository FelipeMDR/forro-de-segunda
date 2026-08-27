import { useState } from 'react'
import { useInstalacao } from '../lib/instalacao'
import { BotaoInstalar } from './BotaoInstalar'

const DISPENSADO_KEY = 'fds-install-dispensado'

/**
 * Convite para instalar, no topo do feed. É dispensável — mas dispensar
 * aqui não tira o acesso: o botão continua no perfil, porque quem tocou
 * em "agora não" um dia pode querer instalar depois.
 */
export function InstallPrompt() {
  const { jaInstalado, temPromptNativo, ios } = useInstalacao()
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(DISPENSADO_KEY) === '1',
  )

  if (jaInstalado || dispensado) return null
  if (!ios && !temPromptNativo) return null

  const dispensar = () => {
    localStorage.setItem(DISPENSADO_KEY, '1')
    setDispensado(true)
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brasa-500/30 bg-brasa-500/10 px-4 py-3">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brasa-700">
          Deixe o Forró de Segunda na tela inicial
        </p>
        {/* A permissão vem primeiro: é a queixa real de quem usa pelo
            navegador, onde o celular esquece o "permitir" a cada vez.
            Ícone e lembretes são bônus — não é por eles que alguém
            para o que está fazendo para instalar um app. */}
        <p className="text-xs text-tinta-600">
          Assim o celular para de pedir câmera e localização toda vez — e
          o app abre direto, com ícone próprio.
        </p>
        <div className="mt-2 flex gap-2">
          <BotaoInstalar
            className="btn-primary px-3 py-1.5 text-xs"
            rotulo="Instalar"
          />
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={dispensar}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
