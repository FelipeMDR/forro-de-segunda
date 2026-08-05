/**
 * Fundos das iniciais, todos com contraste >= 4.5:1 contra o texto
 * branco (medido). As cores oficiais puras (500) não entram: o verde
 * #9BC22D dá 2,07:1 e o azul #0391D5 dá 3,49:1 — iniciais brancas
 * sumiriam neles.
 */
const CORES = [
  'bg-brasa-600',
  'bg-verde-700',
  'bg-azul-600',
  'bg-marinho-500',
  'bg-azul-700',
  'bg-brasa-700',
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
        className="shrink-0 rounded-full object-cover border border-preto/10"
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
