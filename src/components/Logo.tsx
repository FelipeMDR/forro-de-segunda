/**
 * Marca do Forró de Segunda recriada em vetor a partir da logo oficial:
 * "FORRÓ" verde com bandana de cangaceiro no F e zabumba no lugar do O,
 * "de" manuscrito e "SEGUNDA" azul com triângulo no lugar do A.
 */

const VERDE = '#7dba2f'
const VERDE_CLARO = '#9ccf49'
const AZUL = '#1b87c9'
const AZUL_CLARO = '#3fa9f5'
const LARANJA = '#e56a19'
const CREME = '#f8f6c8'
const TRACO = '#1a1a1a'

/** Zabumba (usada como "O" na marca e como emblema do app). */
function Zabumba({
  cx,
  cy,
  r,
  traco,
}: {
  cx: number
  cy: number
  r: number
  traco: number
}) {
  const baqueta = {
    x1: cx + r * 0.15,
    y1: cy - r * 0.35,
    x2: cx + r * 1.55,
    y2: cy - r * 1.05,
  }
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={VERDE}
        stroke={TRACO}
        strokeWidth={traco}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.72}
        fill={CREME}
        stroke={TRACO}
        strokeWidth={traco * 0.8}
      />
      <line
        x1={baqueta.x1}
        y1={baqueta.y1}
        x2={baqueta.x2}
        y2={baqueta.y2}
        stroke={TRACO}
        strokeWidth={traco}
        strokeLinecap="round"
      />
      <circle
        cx={cx + r * 0.15}
        cy={cy - r * 0.35}
        r={r * 0.14}
        fill="#ffffff"
        stroke={TRACO}
        strokeWidth={traco * 0.6}
      />
    </g>
  )
}

/** Triângulo (usado como "A" na marca). */
function Triangulo({
  x,
  y,
  tamanho,
  traco,
  cor = AZUL,
}: {
  x: number
  y: number
  tamanho: number
  traco: number
  cor?: string
}) {
  const s = tamanho
  return (
    <g>
      <path
        d={`M ${x + s * 0.13} ${y - s * 0.14} L ${x + s * 0.5} ${y - s} L ${x + s} ${y} L ${x + s * 0.22} ${y}`}
        fill="none"
        stroke={cor}
        strokeWidth={traco}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={x + s * 0.62}
        y1={y - s * 0.62}
        x2={x + s * 1.12}
        y2={y - s * 1.02}
        stroke={cor}
        strokeWidth={traco * 0.75}
        strokeLinecap="round"
      />
    </g>
  )
}

/** Bandana de cangaceiro com estrelas (fica sobre o F). */
function Bandana({
  x,
  y,
  largura,
  traco,
}: {
  x: number
  y: number
  largura: number
  traco: number
}) {
  const w = largura
  const h = w * 0.42
  return (
    <g>
      <path
        d={`M ${x} ${y}
            Q ${x + w * 0.2} ${y - h} ${x + w * 0.55} ${y - h * 0.92}
            Q ${x + w * 0.9} ${y - h * 0.8} ${x + w} ${y - h * 0.25}
            L ${x + w * 0.82} ${y - h * 0.1}
            Q ${x + w * 0.6} ${y + h * 0.12} ${x + w * 0.4} ${y}
            Q ${x + w * 0.2} ${y + h * 0.12} ${x} ${y} Z`}
        fill={LARANJA}
        stroke={TRACO}
        strokeWidth={traco}
        strokeLinejoin="round"
      />
      {/* pontas da bandana */}
      <path
        d={`M ${x + w * 0.94} ${y - h * 0.35}
            q ${w * 0.14} ${-h * 0.1} ${w * 0.12} ${h * 0.28}
            q ${-w * 0.05} ${-h * 0.05} ${-w * 0.14} ${-h * 0.02} Z`}
        fill={LARANJA}
        stroke={TRACO}
        strokeWidth={traco * 0.7}
        strokeLinejoin="round"
      />
      {[0.22, 0.48, 0.74].map((p, i) => (
        <text
          key={i}
          x={x + w * p}
          y={y - h * (i === 1 ? 0.5 : 0.32)}
          fontSize={h * 0.34}
          textAnchor="middle"
          fill="#f9c74f"
        >
          ★
        </text>
      ))}
    </g>
  )
}

/** Emblema quadrado (cabeçalho e ícone do app). */
export function Logo({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="112" fill="#ffffff" />
      <Zabumba cx={240} cy={280} r={150} traco={22} />
      <Bandana x={110} y={150} largura={270} traco={12} />
      <Triangulo x={310} y={452} tamanho={130} traco={22} />
    </svg>
  )
}

/** Marca completa (tela de login). Desenhada para fundo claro. */
export function LogoWordmark({ largura = 300 }: { largura?: number }) {
  return (
    <svg
      width={largura}
      height={largura * 0.52}
      viewBox="0 0 680 354"
      role="img"
      aria-label="Forró de Segunda"
    >
      <defs>
        <linearGradient id="wm-verde" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={VERDE_CLARO} />
          <stop offset="1" stopColor={VERDE} />
        </linearGradient>
        <linearGradient id="wm-azul" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={AZUL_CLARO} />
          <stop offset="1" stopColor={AZUL} />
        </linearGradient>
      </defs>

      <text
        x={30}
        y={168}
        fontFamily="'Nunito Variable', ui-sans-serif, sans-serif"
        fontWeight={900}
        fontSize={140}
        letterSpacing={2}
        fill="url(#wm-verde)"
        stroke={TRACO}
        strokeWidth={8}
        paintOrder="stroke"
      >
        FORR
      </text>
      <Zabumba cx={512} cy={118} r={78} traco={10} />
      <Bandana x={8} y={52} largura={160} traco={7} />

      <text
        x={168}
        y={224}
        fontFamily="'Segoe Script', 'Bradley Hand', cursive"
        fontWeight={700}
        fontSize={64}
        fill={TRACO}
      >
        de
      </text>

      <text
        x={30}
        y={330}
        fontFamily="'Nunito Variable', ui-sans-serif, sans-serif"
        fontWeight={900}
        fontSize={118}
        letterSpacing={1}
        fill="url(#wm-azul)"
        stroke={TRACO}
        strokeWidth={8}
        paintOrder="stroke"
      >
        SEGUND
      </text>
      <Triangulo x={540} y={330} tamanho={118} traco={16} cor={AZUL} />
    </svg>
  )
}
