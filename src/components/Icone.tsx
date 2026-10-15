/**
 * Ícones do app, traçados à mão no redesign (traço 2–2,4, pontas
 * arredondadas). Todos herdam a cor do texto (`currentColor`).
 */
const TRACOS = {
  voltar: <path d="M15 5l-7 7 7 7" />,
  avancar: <path d="M9 5l7 7-7 7" />,
  abaixo: <path d="M6 9l6 6 6-6" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8h3.5l2-3h7l2 3H21v12H3z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  cadeado: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  chave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
    </>
  ),
  fone: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="5" height="7" rx="2" />
      <rect x="16" y="14" width="5" height="7" rx="2" />
    </>
  ),
  nota: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  local: (
    <>
      <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  comentario: <path d="M4 5h16v11H10l-6 4z" />,
  favorito: <path d="M6 3h12v18l-6-4-6 4z" />,
  girar: (
    <path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4" />
  ),
  lixo: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  ),
  enviar: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />,
  baixar: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  sino: <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />,
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.3 2.2 4 5" />
    </>
  ),
  feed: (
    <>
      <rect x="4" y="3" width="16" height="8" rx="2" />
      <rect x="4" y="13" width="16" height="8" rx="2" />
    </>
  ),
  hoje: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="1.8" fill="currentColor" />
    </>
  ),
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  trofeu: (
    <path d="M8 21h8M12 16v5M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  ),
  medalha: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7" />
    </>
  ),
  bandeira: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
  camadas: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  estrela: (
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  ),
  frequencia: (
    <>
      <rect x="4" y="4" width="7" height="9" rx="1.5" />
      <rect x="13" y="4" width="7" height="9" rx="1.5" />
      <path d="M4 17h16M4 21h10" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  sair: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  editar: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  mais: <path d="M12 5v14M5 12h14" />,
} as const

export type NomeIcone = keyof typeof TRACOS

export function Icone({
  nome,
  tamanho = 22,
  traco = 2.2,
  className,
  preenchido = false,
}: {
  nome: NomeIcone
  tamanho?: number
  traco?: number
  className?: string
  /** Preenche a forma (favorito marcado, por exemplo). */
  preenchido?: boolean
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill={preenchido ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {TRACOS[nome]}
    </svg>
  )
}

/** Três pontos do menu "mais opções". */
export function IconeMais({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

/** Quatro barrinhas subindo e descendo: música tocando agora. */
export function Equalizador({ className = '' }: { className?: string }) {
  return (
    <span className={`equalizador ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
