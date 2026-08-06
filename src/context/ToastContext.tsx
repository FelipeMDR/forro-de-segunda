import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface Toast {
  id: number
  texto: string
  tipo: 'ok' | 'erro'
}

const ToastCtx = createContext<(texto: string, tipo?: 'ok' | 'erro') => void>(
  () => {},
)

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const show = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, texto, tipo }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            // Fundo sólido, não translúcido: o aviso passa por cima de
            // fotos e listas, e com transparência o conteúdo de trás
            // atravessava o texto. Escuro sobre o app claro para
            // destacar sem precisar de cor de alerta.
            className={`max-w-sm rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg shadow-preto/20 ${
              t.tipo === 'erro'
                ? 'bg-red-600 text-white'
                : 'bg-marinho-500 text-white'
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
