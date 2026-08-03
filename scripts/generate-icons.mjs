// Gera os ícones do PWA a partir do emblema da marca (zabumba +
// bandana + triângulo, cores oficiais). Uso: npm run icons
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

const VERDE = '#7dba2f'
const AZUL = '#1b87c9'
const LARANJA = '#e56a19'
const CREME = '#f8f6c8'
const TRACO = '#1a1a1a'

function star(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 === 0 ? r : r * 0.45
    const ang = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${(cx + raio * Math.cos(ang)).toFixed(1)},${(cy + raio * Math.sin(ang)).toFixed(1)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="#f9c74f" stroke="${TRACO}" stroke-width="3"/>`
}

function emblema({ maskable = false } = {}) {
  const s = maskable ? 0.74 : 1
  const t = (x, y) => {
    // escala em torno do centro (256, 276)
    return `${(256 + (x - 256) * s).toFixed(1)} ${(276 + (y - 276) * s).toFixed(1)}`
  }
  const n = (v) => (v * s).toFixed(1)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#ffffff"/>
  <!-- zabumba -->
  <circle cx="${t(240, 280).split(' ')[0]}" cy="${t(240, 280).split(' ')[1]}" r="${n(150)}" fill="${VERDE}" stroke="${TRACO}" stroke-width="${n(22)}"/>
  <circle cx="${t(240, 280).split(' ')[0]}" cy="${t(240, 280).split(' ')[1]}" r="${n(108)}" fill="${CREME}" stroke="${TRACO}" stroke-width="${n(17)}"/>
  <line x1="${t(262, 228).split(' ')[0]}" y1="${t(262, 228).split(' ')[1]}" x2="${t(472, 122).split(' ')[0]}" y2="${t(472, 122).split(' ')[1]}" stroke="${TRACO}" stroke-width="${n(22)}" stroke-linecap="round"/>
  <circle cx="${t(262, 228).split(' ')[0]}" cy="${t(262, 228).split(' ')[1]}" r="${n(21)}" fill="#ffffff" stroke="${TRACO}" stroke-width="${n(13)}"/>
  <!-- bandana -->
  <path d="M ${t(110, 150)}
           Q ${t(164, 36)} ${t(258, 46)}
           Q ${t(353, 60)} ${t(380, 122)}
           L ${t(331, 139)}
           Q ${t(272, 168)} ${t(218, 150)}
           Q ${t(164, 168)} ${t(110, 150)} Z"
        fill="${LARANJA}" stroke="${TRACO}" stroke-width="${n(12)}" stroke-linejoin="round"/>
  <path d="M ${t(364, 96)} q ${n(45)} ${-n(12)} ${n(38)} ${n(34)} q ${-n(16)} ${-n(6)} ${-n(42)} ${-n(2)} Z"
        fill="${LARANJA}" stroke="${TRACO}" stroke-width="${n(8)}" stroke-linejoin="round"/>
  ${star(256 + (168 - 256) * s, 276 + (108 - 276) * s, 18 * s)}
  ${star(256 + (244 - 256) * s, 276 + (84 - 276) * s, 20 * s)}
  ${star(256 + (318 - 256) * s, 276 + (104 - 276) * s, 16 * s)}
  <!-- triângulo -->
  <path d="M ${t(328, 434)} L ${t(375, 326)} L ${t(438, 452)} L ${t(340, 452)}"
        fill="none" stroke="${AZUL}" stroke-width="${n(22)}" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="${t(390, 384).split(' ')[0]}" y1="${t(390, 384).split(' ')[1]}" x2="${t(452, 336).split(' ')[0]}" y2="${t(452, 336).split(' ')[1]}" stroke="${AZUL}" stroke-width="${n(16)}" stroke-linecap="round"/>
</svg>`
}

await mkdir('public', { recursive: true })
await writeFile('public/favicon.svg', emblema())

const normal = Buffer.from(emblema())
const maskable = Buffer.from(emblema({ maskable: true }))

await sharp(normal).resize(192, 192).png().toFile('public/pwa-192x192.png')
await sharp(normal).resize(512, 512).png().toFile('public/pwa-512x512.png')
await sharp(maskable).resize(512, 512).png().toFile('public/maskable-512x512.png')
await sharp(normal).resize(180, 180).png().toFile('public/apple-touch-icon.png')

console.log('Ícones gerados em public/')
