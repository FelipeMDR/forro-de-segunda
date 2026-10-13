import { Equalizador } from './Icone'

export function Spinner({ texto }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-or-t">
      <Equalizador />
      <span className="text-sm font-semibold text-ink3">{texto ?? 'Carregando…'}</span>
    </div>
  )
}
