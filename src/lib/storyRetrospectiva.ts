/**
 * A imagem da retrospectiva para o story do Instagram (1080×1920).
 *
 * Em canvas e não em HTML: o objetivo é sair do app como arquivo, e
 * transformar DOM em imagem exigiria uma biblioteca inteira para fazer
 * pior. O desenho é o mesmo do cartão que aparece no último slide, em
 * coordenadas de uma tela de 288×512 multiplicadas por 3,75.
 */
export interface DadosStory {
  /** "2026.1" */
  codigo: string
  noites: number
  pessoas: number
  topDuplas: string[]
  musicas: number
  distintivos: number
  /** Foto mais reagida; se não carregar (CORS, arquivada), vira um bloco. */
  fotoUrl: string | null
}

const K = 3.75
const LARGURA = 1080
const ALTURA = 1920
const FONTE = "'Bricolage Grotesque Variable', system-ui, sans-serif"

function carregarImagem(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const im = new Image()
    if (cors) im.crossOrigin = 'anonymous'
    im.onload = () => ok(im)
    im.onerror = () => ok(null)
    im.src = src
  })
}

export async function desenharStory(d: DadosStory): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = LARGURA
  c.height = ALTURA
  const x = c.getContext('2d')!
  const f = (peso: number, tam: number) => `${peso} ${tam * K}px ${FONTE}`
  const rr = (X: number, Y: number, w: number, h: number, r: number) => {
    x.beginPath()
    x.roundRect(X * K, Y * K, w * K, h * K, r * K)
  }
  try {
    await document.fonts.load(f(800, 46))
  } catch {
    // Sem a fonte, sai na do sistema — melhor que não sair
  }

  // Fundo laranja com o "sol" de raios
  x.fillStyle = '#DE5300'
  x.fillRect(0, 0, LARGURA, ALTURA)
  x.save()
  x.translate(LARGURA / 2, ALTURA * 0.4)
  x.fillStyle = 'rgba(0,5,7,.08)'
  for (let a = 0; a < 360; a += 20) {
    x.beginPath()
    x.moveTo(0, 0)
    x.arc(0, 0, 1400, (a * Math.PI) / 180, ((a + 7) * Math.PI) / 180)
    x.closePath()
    x.fill()
  }
  x.restore()

  // A marca num cartão torto, com sombra dura
  const logo = await carregarImagem('/logo.webp', false)
  x.save()
  x.translate(104 * K, 76 * K)
  x.rotate((-4 * Math.PI) / 180)
  x.translate(-104 * K, -76 * K)
  x.fillStyle = '#000507'
  rr(22, 28, 164, 96, 14)
  x.fill()
  x.fillStyle = '#F5F4F2'
  x.strokeStyle = '#000507'
  x.lineWidth = 3 * K
  rr(22, 24, 164, 96, 14)
  x.fill()
  x.stroke()
  if (logo) x.drawImage(logo, 32 * K, 32 * K, 144 * K, (144 * K * logo.height) / logo.width)
  x.restore()

  x.fillStyle = '#000507'
  x.font = f(800, 12)
  x.fillText('MEU SEMESTRE NO FORRÓ', 24 * K, 146 * K)
  x.font = f(800, 46)
  x.fillText(d.codigo, 22 * K, 190 * K)

  // A foto mais reagida, torta, com moldura e sombra
  const foto = d.fotoUrl ? await carregarImagem(d.fotoUrl, true) : null
  x.save()
  x.translate(83 * K, 286 * K)
  x.rotate((-3 * Math.PI) / 180)
  x.translate(-83 * K, -286 * K)
  x.fillStyle = '#000507'
  x.fillRect(24 * K, 216 * K, 118 * K, 148 * K)
  x.fillStyle = '#024565'
  x.fillRect(24 * K, 212 * K, 118 * K, 148 * K)
  if (foto) {
    // Recorte central 4:5 (a foto do check-in já é 4:5)
    const alvo = 118 / 148
    let sw = foto.width
    let sh = foto.height
    if (sw / sh > alvo) sw = sh * alvo
    else sh = sw / alvo
    x.drawImage(foto, (foto.width - sw) / 2, (foto.height - sh) / 2, sw, sh, 24 * K, 212 * K, 118 * K, 148 * K)
  }
  x.lineWidth = 3 * K
  x.strokeStyle = '#000507'
  x.strokeRect(24 * K, 212 * K, 118 * K, 148 * K)
  x.restore()

  x.fillStyle = '#000507'
  x.font = f(800, 48)
  x.fillText(String(d.noites), 160 * K, 252 * K)
  x.fillText(String(d.pessoas), 160 * K, 322 * K)
  x.font = f(800, 12)
  x.fillText(d.noites === 1 ? 'noite de forró' : 'noites de forró', 160 * K, 268 * K)
  x.fillText(d.pessoas === 1 ? 'pessoa diferente' : 'pessoas diferentes', 160 * K, 338 * K)

  // Faixa preta com top duplas, músicas e distintivos
  x.fillStyle = '#000507'
  rr(14, 380, 260, 104, 16)
  x.fill()
  x.fillStyle = '#FFB98C'
  x.font = f(800, 9)
  x.fillText('TOP DUPLAS', 28 * K, 398 * K)
  x.fillText('MÚSICAS TOCADAS', 168 * K, 398 * K)
  x.fillText('DISTINTIVOS', 168 * K, 440 * K)
  x.fillStyle = '#F5F4F2'
  x.font = f(700, 11)
  d.topDuplas.slice(0, 5).forEach((nome, i) => {
    x.fillText(`${i + 1} ${nome}`, 28 * K, (414 + i * 15) * K, 130 * K)
  })
  if (d.topDuplas.length === 0) x.fillText('—', 28 * K, 414 * K)
  x.font = f(800, 22)
  x.fillText(String(d.musicas), 168 * K, 422 * K)
  x.fillText(String(d.distintivos), 168 * K, 464 * K)

  x.fillStyle = '#000507'
  x.font = f(800, 10)
  x.textAlign = 'center'
  x.fillText('@fds.itajuba', LARGURA / 2, 502 * K)

  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar a imagem')
  return blob
}

/** "2026.1" a partir de quando o semestre começou. */
export function codigoDoSemestre(inicio: Date): string {
  return `${inicio.getFullYear()}.${inicio.getMonth() < 6 ? 1 : 2}`
}
