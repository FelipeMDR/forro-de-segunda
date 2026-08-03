const CORES = [
  'bg-brasa-600',
  'bg-verde-600',
  'bg-azul-600',
  'bg-noite-600',
  'bg-emerald-700',
  'bg-sky-700',
]

function corPara(nome: string): string {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % CORES.length
  return CORES[h]
}

export function Avatar({
  nome,
  url,
  tamanho = 40,
}: {
  nome: string
  url: string | null
  tamanho?: number
}) {
  const style = { width: tamanho, height: tamanho }
  if (url) {
    return (
      <img
        src={url}
        alt={nome}
        style={style}
        className="shrink-0 rounded-full object-cover border border-white/10"
      />
    )
  }
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div
      style={{ ...style, fontSize: tamanho * 0.4 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${corPara(nome)}`}
      aria-hidden
    >
      {iniciais || '🙂'}
    </div>
  )
}
