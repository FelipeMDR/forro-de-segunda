import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Câmera dentro do app — a foto do check-in só pode ser tirada na hora
 * (sem galeria), para evitar fotos antigas. Usa getUserMedia; exige
 * HTTPS (ou localhost) e permissão de câmera.
 *
 * Ocupa a tela inteira, como a câmera de qualquer app de foto. Antes era
 * um cartãozinho 4:5 no meio da página, com legenda e avisos disputando
 * espaço embaixo: o botão de disparo sobrava num lugar qualquer da tela,
 * longe do polegar, e tirar selfie virava ginástica. Aqui o disparo mora
 * na faixa de baixo, onde a mão já está.
 */

/**
 * O recorte do quadro que está realmente aparecendo na tela.
 *
 * O vídeo é desenhado com `object-cover`: numa tela alta e estreita, boa
 * parte das laterais de um quadro 4:3 fica de fora. Capturar o quadro
 * inteiro entregaria uma foto com gente e parede que a pessoa nunca viu
 * ao enquadrar — então a captura recorta igual à tela.
 */
export function recorteVisivel(
  larguraQuadro: number,
  alturaQuadro: number,
  aspectoTela: number,
): { sx: number; sy: number; sw: number; sh: number } {
  let sw = larguraQuadro
  let sh = alturaQuadro
  if (larguraQuadro / alturaQuadro > aspectoTela) {
    sw = Math.round(alturaQuadro * aspectoTela)
  } else {
    sh = Math.round(larguraQuadro / aspectoTela)
  }
  return {
    sx: Math.round((larguraQuadro - sw) / 2),
    sy: Math.round((alturaQuadro - sh) / 2),
    sw,
    sh,
  }
}

/**
 * Onde a foto vai viver: o feed mostra todo check-in em 4:5.
 *
 * Por isso a câmera marca essa área. Capturar a tela cheia (num celular
 * moderno, quase 9:19) entregaria uma foto que o feed cortaria pela
 * metade — a pessoa enquadraria o rosto no alto e ele sumiria depois.
 */
export const ASPECTO_FOTO = '4 / 5'

/**
 * Desenha o recorte no canvas, espelhando quando a fonte está espelhada
 * na tela.
 *
 * A câmera frontal é mostrada em espelho (como todo app de selfie faz —
 * sem isso, mover a mão para a direita a faz ir para a esquerda na tela
 * e enquadrar vira um exercício de paciência). Só que a captura vinha do
 * quadro cru, sem espelho: a foto saía invertida em relação ao que a
 * pessoa tinha acabado de ver. Aqui a foto passa a ser o que estava na
 * tela.
 */
export function desenharQuadro(
  ctx: CanvasRenderingContext2D,
  fonte: CanvasImageSource,
  recorte: { sx: number; sy: number; sw: number; sh: number },
  espelhar: boolean,
) {
  if (espelhar) {
    ctx.translate(recorte.sw, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(
    fonte,
    recorte.sx,
    recorte.sy,
    recorte.sw,
    recorte.sh,
    0,
    0,
    recorte.sw,
    recorte.sh,
  )
}

export function CameraCapture({
  onCapture,
  onFechar,
  topo,
  permitirFotoTeste = false,
}: {
  onCapture: (foto: Blob) => void
  /** Sair da câmera sem tirar foto. */
  onFechar: () => void
  /** Avisos desenhados por cima da imagem, no alto da tela. */
  topo?: ReactNode
  /** Modo demo: oferece uma foto gerada quando a câmera não está disponível. */
  permitirFotoTeste?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const guiaRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [erro, setErro] = useState<string | null>(null)
  const [pronta, setPronta] = useState(false)

  const abrirCamera = useCallback(async (modo: 'environment' | 'user') => {
    setErro(null)
    setPronta(false)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: modo,
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setPronta(true)
      }
    } catch (e) {
      const name = (e as DOMException).name
      setErro(
        name === 'NotAllowedError'
          ? 'Permita o acesso à câmera para fazer o check-in. A foto só pode ser tirada na hora — regra do desafio! 😉'
          : name === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste aparelho.'
            : 'Não foi possível abrir a câmera. Confira as permissões do navegador.',
      )
    }
  }, [])

  useEffect(() => {
    if (!window.isSecureContext) {
      // getUserMedia só funciona em HTTPS (ou localhost) — acontece se
      // alguém abrir o app por um IP da rede local em http://
      setErro(
        'A câmera só funciona em conexão segura (https). Abra o app pelo endereço oficial, não por um IP da rede local.',
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não suporta câmera. Tente o Chrome ou o Safari.')
      return
    }
    void abrirCamera(facing)
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [abrirCamera, facing])

  // Enquanto a câmera está aberta a página de trás não deve rolar: o
  // dedo encostando na tela para enquadrar arrastaria o conteúdo.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  const capturar = async () => {
    const video = videoRef.current
    if (!video || !pronta) return
    // Dois passos: primeiro o que a tela mostra do quadro (object-cover
    // corta as laterais), depois a fatia que a moldura 4:5 marca dentro
    // disso. A moldura é MEDIDA, não recalculada: assim a foto é sempre
    // exatamente o que estava dentro dela, dê o CSS o tamanho que der.
    const visivel = recorteVisivel(
      video.videoWidth,
      video.videoHeight,
      video.clientWidth / video.clientHeight,
    )
    const rv = video.getBoundingClientRect()
    const rg = guiaRef.current?.getBoundingClientRect() ?? rv
    const recorte = {
      sx: Math.round(visivel.sx + ((rg.left - rv.left) / rv.width) * visivel.sw),
      sy: Math.round(visivel.sy + ((rg.top - rv.top) / rv.height) * visivel.sh),
      sw: Math.round((rg.width / rv.width) * visivel.sw),
      sh: Math.round((rg.height / rv.height) * visivel.sh),
    }
    const canvas = document.createElement('canvas')
    canvas.width = recorte.sw
    canvas.height = recorte.sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mesma condição do CSS do <video>: é isso que garante que a foto
    // saia igual à pré-visualização.
    desenharQuadro(ctx, video, recorte, facing === 'user')
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    )
    if (blob) onCapture(blob)
  }

  const gerarFotoTeste = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1350
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = ctx.createLinearGradient(0, 0, 1080, 1350)
    g.addColorStop(0, '#DE5300')
    g.addColorStop(1, '#024565')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1080, 1350)
    ctx.textAlign = 'center'
    ctx.font = '380px serif'
    ctx.fillText('💃', 540, 760)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = 'bold 52px sans-serif'
    ctx.fillText('foto de teste — modo demo', 540, 1140)
    ctx.fillText(new Date().toLocaleString('pt-BR'), 540, 1220)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    if (blob) onCapture(blob)
  }

  const botaoFechar = (
    <button
      onClick={onFechar}
      aria-label="Fechar câmera"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/50 text-lg text-white backdrop-blur transition active:scale-90"
    >
      ✕
    </button>
  )

  if (erro) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black text-white"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        }}
      >
        <div className="px-4">{botaoFechar}</div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="text-5xl">📷</span>
          <p className="text-sm text-white/80">{erro}</p>
          <button
            className="rounded-xl bg-white/15 px-5 py-2.5 text-sm font-bold backdrop-blur"
            onClick={() => void abrirCamera(facing)}
          >
            Tentar de novo
          </button>
          {permitirFotoTeste && (
            <button className="btn-primary" onClick={() => void gerarFotoTeste()}>
              Usar foto de teste (demo) 📸
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${
          facing === 'user' ? '-scale-x-100' : ''
        }`}
      />

      {/* Moldura do que entra na foto. O escurecido de fora é uma sombra
          gigante da própria moldura — assim ele acompanha qualquer
          tamanho que o CSS dê a ela, sem conta repetida. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        {/* Numa tela alta (todo celular em pé) manda a largura e a altura
            é deduzida; numa tela larga inverte, senão o 4:5 se perderia e
            a foto sairia fora do formato — a captura é medida DAQUI. */}
        <div
          ref={guiaRef}
          className="w-full ring-1 ring-inset ring-white/25 [@media(min-aspect-ratio:4/5)]:h-full [@media(min-aspect-ratio:4/5)]:w-auto"
          style={{
            aspectRatio: ASPECTO_FOTO,
            boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)',
          }}
        />
      </div>

      {!pronta && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60">
          <span className="animate-pulse text-3xl">📷</span>
        </div>
      )}

      {/* Faixa de cima: sair da câmera e os avisos, sobre um degradê que
          garante leitura seja qual for a cena atrás. */}
      <div
        className="relative z-10 flex items-start gap-3 bg-gradient-to-b from-black/70 via-black/40 to-transparent px-4 pb-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {botaoFechar}
        <div className="flex-1 space-y-2">{topo}</div>
      </div>

      {/* Empurra os controles para baixo sem capturar toques */}
      <div className="pointer-events-none flex-1" />

      <div
        className="relative z-10 flex items-center justify-center gap-10 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-6 pt-12"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
      >
        <button
          onClick={() =>
            setFacing((f) => (f === 'user' ? 'environment' : 'user'))
          }
          aria-label="Virar câmera"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-xl backdrop-blur transition active:scale-90"
        >
          🔄
        </button>
        <button
          onClick={() => void capturar()}
          disabled={!pronta}
          aria-label="Tirar foto"
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white transition active:scale-90 disabled:opacity-40"
        >
          <span className="block h-14 w-14 rounded-full bg-white" />
        </button>
        {/* Contrapeso do botão de virar, para o disparo ficar centrado */}
        <span className="h-12 w-12" aria-hidden />
      </div>
    </div>
  )
}
