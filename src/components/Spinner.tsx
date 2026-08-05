export function Spinner({ texto }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-tinta-600">
      <span className="text-3xl animate-bounce">🎶</span>
      <span className="text-sm">{texto ?? 'Carregando…'}</span>
    </div>
  )
}
