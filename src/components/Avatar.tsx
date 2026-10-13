/**
 * Fundos das iniciais: cores da marca e vizinhas claras, sempre com a
 * inicial em preto — preto sobre qualquer uma delas passa de 4,5:1
 * (o pior caso, #0391D5, fica em 5,7:1). Branco não passaria no verde
 * nem no azul oficiais.
 */
const CORES = [
  '#DE5300',
  '#9BC22D',
  '#0391D5',
  '#FFB98C',
  '#B0D24A',
  '#7CC6EE',
  '#F97316',
  '#CBE288',
  '#2BA5E2',
]

export function corDoNome(nome: string): string {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % CORES.length
  return CORES[h]
}

export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({
  nome,
  url,
  tamanho = 40,
  borda = true,
  className = '',
}: {
  nome: string
  url: string | null
  tamanho?: number
  /** Contorno preto da linguagem do logo. Desligue em pilhas e chips. */
  borda?: boolean
  className?: string
}) {
  const espessura = tamanho >= 90 ? 3 : 2
  const style = {
    width: tamanho,
    height: tamanho,
    border: borda ? `${espessura}px solid #000507` : undefined,
  }
  if (url) {
    return (
      <img
        src={url}
        alt={nome}
        style={style}
        className={`shrink-0 rounded-full bg-sf2 object-cover ${className}`}
      />
    )
  }
  return (
    <div
      style={{
        ...style,
        fontSize: Math.max(10, tamanho * 0.34),
        background: corDoNome(nome),
      }}
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-preto ${className}`}
      aria-hidden
    >
      {iniciais(nome) || '?'}
    </div>
  )
}
