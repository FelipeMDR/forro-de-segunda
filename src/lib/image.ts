/**
 * Compressão de imagem no cliente — estratégia central para caber no
 * free tier do Supabase (1 GB de storage).
 *
 * A compressão mira um TETO DE BYTES, não uma qualidade fixa. Qualidade
 * fixa dá tamanhos muito diferentes conforme o encoder do aparelho: o
 * mesmo 0.72 rende ~60 KB no Chrome/Android (WebP) e passa de 300 KB no
 * Safari/iPhone (que cai no JPEG quando não tem encoder WebP). Mirando
 * bytes, todo aparelho converge para o mesmo custo de storage — quem já
 * está abaixo do teto sai intocado, só o excesso é reencodado.
 */

/** Teto por foto de check-in. 1 GB ≈ 12 mil fotos nesse tamanho. */
export const LIMITE_FOTO = 90 * 1024
/** Teto por foto de perfil (256px já rende ~10 KB). */
export const LIMITE_AVATAR = 20 * 1024

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // 'from-image' respeita a orientação EXIF de fotos de celular
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Não foi possível ler a imagem'))
        img.src = url
      })
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
  }
}

/** Codifica o canvas em WebP; cai para JPEG onde não há encoder WebP (Safari antigo). */
async function encode(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (webp && webp.type === 'image/webp') return webp

  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!jpeg) throw new Error('Falha ao comprimir a imagem')
  return jpeg
}

export async function compressImage(
  file: Blob,
  maxDim = 1080,
  quality = 0.72,
  maxBytes = LIMITE_FOTO,
): Promise<Blob> {
  const src = await loadBitmap(file)
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')

  const desenha = (dim: number) => {
    const escala = Math.min(1, dim / Math.max(w, h))
    canvas.width = Math.round(w * escala)
    canvas.height = Math.round(h * escala)
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  }

  // Primeiro afrouxa a qualidade (quase imperceptível numa foto de festa);
  // só depois reduz a resolução, que é o que realmente se nota.
  const tentativas: Array<{ dim: number; q: number }> = [
    { dim: maxDim, q: quality },
    { dim: maxDim, q: 0.6 },
    { dim: maxDim, q: 0.5 },
    { dim: Math.round(maxDim * 0.8), q: 0.55 },
    { dim: Math.round(maxDim * 0.66), q: 0.5 },
  ]

  let melhor: Blob | null = null
  let dimAtual = 0
  try {
    for (const t of tentativas) {
      if (t.dim !== dimAtual) {
        desenha(t.dim)
        dimAtual = t.dim
      }
      const blob = await encode(canvas, t.q)
      if (!melhor || blob.size < melhor.size) melhor = blob
      if (blob.size <= maxBytes) return blob
    }
  } finally {
    if ('close' in src) src.close()
  }

  // Nem a tentativa mais agressiva coube — sobe a menor mesmo assim;
  // barrar o check-in por causa de bytes seria pior para o aluno.
  if (!melhor) throw new Error('Falha ao comprimir a imagem')
  return melhor
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function extensionFor(blob: Blob): string {
  return blob.type === 'image/webp' ? 'webp' : 'jpg'
}
