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
    <div className="flex flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4">
      <div className="flex flex-col gap-1">
        <p className="text-base font-extrabold">
          Deixe o Forró de Segunda na tela inicial
        </p>
        {/* A permissão vem primeiro: é a queixa real de quem usa pelo
            navegador, onde o celular esquece o "permitir" a cada vez.
            Ícone e lembretes são bônus — não é por eles que alguém
            para o que está fazendo para instalar um app. */}
        <p className="text-sm leading-snug text-ink3">
          Assim o celular para de pedir câmera e localização toda vez — e
          o app abre direto, com ícone próprio.
        </p>
      </div>
      <div className="flex gap-2">
        <BotaoInstalar
          className="flex h-11 flex-1 items-center justify-center rounded-[14px] border-2 border-preto bg-brasa-500 px-3 text-[15px] font-extrabold text-preto"
          rotulo="Instalar"
        />
        <button
          type="button"
          className="h-11 rounded-[14px] border-[1.5px] border-linha bg-sf px-4 text-[15px] font-bold text-ink"
          onClick={dispensar}
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
