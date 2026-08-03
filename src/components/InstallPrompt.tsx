import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'fds-install-dispensado'

function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Convida a instalar o PWA na tela inicial. No Android usa o prompt
 * nativo; no iOS não existe API de instalação, então explicamos o
 * caminho manual (e lá isso é obrigatório para push funcionar).
 */
export function InstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [mostrarIOS, setMostrarIOS] = useState(false)
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => {
    if (estaInstalado()) return
    const handler = (e: Event) => {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    if (ehIOS()) setMostrarIOS(true)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dispensado || estaInstalado()) return null
  if (!evento && !mostrarIOS) return null

  const dispensar = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDispensado(true)
  }

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
    dispensar()
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brasa-500/30 bg-brasa-500/10 px-4 py-3">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brasa-300">
          Instale o app na tela inicial
        </p>
        {evento ? (
          <p className="text-xs text-stone-400">
            Fica com ícone próprio e abre mais rápido.
          </p>
        ) : (
          <p className="text-xs text-stone-400">
            No iPhone: toque em <strong>Compartilhar</strong> (o quadradinho
            com a seta) e depois em <strong>Adicionar à Tela de Início</strong>.
            É assim que os lembretes funcionam no iOS.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {evento && (
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={() => void instalar()}
            >
              Instalar
            </button>
          )}
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={dispensar}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
