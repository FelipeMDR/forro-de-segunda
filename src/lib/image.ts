/**
 * Compressão de imagem no cliente — estratégia central para caber no
 * free tier do Supabase (1 GB de storage): WebP, lado maior ~1080px,
 * qualidade 0.72 ≈ 100–150 KB por foto.
 */

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

export async function compressImage(
  file: Blob,
  maxDim = 1080,
  quality = 0.72,
): Promise<Blob> {
  const src = await loadBitmap(file)
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')
  ctx.drawImage(src, 0, 0, cw, ch)
  if ('close' in src) src.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (blob && blob.type === 'image/webp') return blob

  // Fallback para navegadores sem encoder WebP (Safari antigo)
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!jpeg) throw new Error('Falha ao comprimir a imagem')
  return jpeg
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
