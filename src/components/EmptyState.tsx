import type { ReactNode } from 'react'

export function EmptyState({
  emoji,
  titulo,
  texto,
  children,
}: {
  emoji: string
  titulo: string
  texto?: string
  children?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-5xl">{emoji}</span>
      <h2 className="mt-2 text-lg font-extrabold">{titulo}</h2>
      {texto && <p className="max-w-xs text-sm text-stone-400">{texto}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
