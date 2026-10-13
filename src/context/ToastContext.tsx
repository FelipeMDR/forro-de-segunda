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
      <div
        className="pointer-events-none fixed inset-x-0 z-[80] mx-auto flex max-w-md flex-col items-stretch gap-2 px-4"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            // Fundo sólido, não translúcido: o aviso passa por cima de
            // fotos e listas, e com transparência o conteúdo de trás
            // atravessava o texto. Preto com contorno claro destaca nos
            // dois temas; erro vai no laranja da marca, texto preto.
            className={`anima-tela rounded-[18px] border-2 px-4 py-3.5 text-[15px] font-bold leading-snug shadow-[0_10px_30px_rgba(0,5,7,.35)] ${
              t.tipo === 'erro'
                ? 'border-preto bg-brasa-500 text-preto'
                : 'border-branco bg-preto text-branco'
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
