/**
 * Marca oficial do Forró de Segunda, entregue pela diretoria de
 * comunicação. O arquivo original é um SVG de 362 KB que embrulha um
 * PNG de 1600×783 — pesado demais para um PWA que precisa cachear tudo.
 * Aqui usamos a mesma arte recortada e convertida para WebP (56 KB,
 * 900px de largura, o dobro do maior uso em tela).
 */

const PROPORCAO = 468 / 900 // altura / largura da arte recortada

/**
 * Marca completa. Serve tanto para o cabeçalho (pequena) quanto para a
 * tela de login (grande) — é a mesma arte, então o app não corre o
 * risco de mostrar duas versões diferentes da marca.
 */
export function LogoWordmark({
  largura = 300,
  prioridade = false,
}: {
  largura?: number
  /** Na tela de login a marca é o primeiro elemento: não adiar. */
  prioridade?: boolean
}) {
  return (
    <img
      src="/logo.webp"
      width={largura}
      height={Math.round(largura * PROPORCAO)}
      alt="Forró de Segunda"
      loading={prioridade ? 'eager' : 'lazy'}
      decoding="async"
      style={{ width: largura, height: 'auto' }}
    />
  )
}

/**
 * Versão compacta para o cabeçalho. Recorta só o "FORRÓ de SEGUNDA"
 * numa altura fixa, mantendo a proporção.
 */
export function Logo({ altura = 28 }: { altura?: number }) {
  return (
    <img
      src="/logo.webp"
      alt="Forró de Segunda"
      height={altura}
      decoding="async"
      style={{ height: altura, width: 'auto' }}
    />
  )
}
