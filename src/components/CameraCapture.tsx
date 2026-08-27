import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DicaInstalarParaPermissao } from './DicaInstalarParaPermissao'

/**
 * Câmera dentro do app — a foto do check-in só pode ser tirada na hora
 * (sem galeria), para evitar fotos antigas. Usa getUserMedia; exige
 * HTTPS (ou localhost) e permissão de câmera.
 *
 * Ocupa a tela inteira, com o disparo na faixa de baixo, onde o polegar
 * já está — antes era um cartãozinho no meio da página, com legenda e
 * avisos disputando espaço embaixo, e o botão sobrava num ponto qualquer
 * da tela.
 *
 * O quadro aparece INTEIRO, com faixas claras em volta, como na câmera
 * do celular. Esticá-lo para preencher a tela (`object-cover`) obrigava
 * a cortar as laterais — num aparelho alto isso vira um zoom de verdade,
 * e enquadrar o próprio rosto ficava impossível.
 */

/**
 * O maior recorte central do quadro num dado formato.
 *
 * Não depende de layout nenhum: é conta com as dimensões da câmera. Por
 * isso a moldura desenhada na tela e a foto salva saem sempre iguais —
 * as duas saem daqui.
 */
export function recorteCentral(
  larguraQuadro: number,
  alturaQuadro: number,
  aspecto: number,
): { sx: number; sy: number; sw: number; sh: number } {
  let sw = larguraQuadro
  let sh = alturaQuadro
  if (larguraQuadro / alturaQuadro > aspecto) {
    sw = Math.round(alturaQuadro * aspecto)
  } else {
    sh = Math.round(larguraQuadro / aspecto)
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
 * A câmera marca essa área e escurece o resto. Sem a marca, a pessoa
 * enquadraria o rosto junto da borda e ele sumiria no feed depois.
 */
export const ASPECTO_FOTO = 4 / 5

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
  onResolvida,
}: {
  onCapture: (foto: Blob) => void
  /** Sair da câmera sem tirar foto. */
  onFechar: () => void
  /** Avisos mostrados na faixa de cima. */
  topo?: ReactNode
  /** Modo demo: oferece uma foto gerada quando a câmera não está disponível. */
  permitirFotoTeste?: boolean
  /**
   * Avisa quando o pedido de câmera terminou — liberado ou não.
   *
   * Quem chama usa isso para só então pedir OUTRA permissão (o GPS). Os
   * dois pedidos disparando juntos empilhavam dois diálogos do sistema
   * na cara de quem só queria tirar uma foto, e um deles costumava ser
   * respondido no chute só para sumir da tela.
   */
  onResolvida?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [erro, setErro] = useState<string | null>(null)
  const [pronta, setPronta] = useState(false)
  // Dimensões do quadro que a câmera está entregando. Só dá para saber
  // depois que o vídeo carrega, e mudam ao virar a câmera.
  const [quadro, setQuadro] = useState<{ w: number; h: number } | null>(null)

  // `useRef` e não dependência: o callback muda de identidade a cada
  // render de quem chama, e como dependência ele reabriria a câmera —
  // um novo `getUserMedia` a cada render, que é exatamente o tipo de
  // coisa que faz o navegador perguntar de novo.
  const aoResolver = useRef(onResolvida)
  aoResolver.current = onResolvida

  const abrirCamera = useCallback(async (modo: 'environment' | 'user') => {
    setErro(null)
    setPronta(false)
    setQuadro(null)
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
    } finally {
      // Liberado ou negado, o diálogo da câmera saiu da frente: agora dá
      // para pedir o GPS sem empilhar dois avisos do sistema.
      aoResolver.current?.()
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
    const recorte = recorteCentral(
      video.videoWidth,
      video.videoHeight,
      ASPECTO_FOTO,
    )
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-preto/5 text-lg text-tinta-700 transition active:scale-90"
    >
      ✕
    </button>
  )

  /** Faixa de cima: sair da câmera, e o aviso centrado na tela. */
  const faixaDeCima = (
    <div
      className="relative shrink-0 px-4 pb-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      <div
        className="absolute left-4"
        style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {botaoFechar}
      </div>
      {topo && (
        <div className="mx-auto flex max-w-[calc(100%-6rem)] flex-col items-center gap-2 text-center">
          {topo}
        </div>
      )}
    </div>
  )

  if (erro) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-fundo"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {faixaDeCima}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="text-5xl">📷</span>
          <p className="text-sm text-tinta-600">{erro}</p>
          <button
            className="btn-ghost"
            onClick={() => void abrirCamera(facing)}
          >
            Tentar de novo
          </button>
          {/* Quem chegou aqui é exatamente quem se cansou de liberar a
              câmera toda vez — é o melhor momento para contar que
              instalar resolve. Some sozinho para quem já instalou. */}
          <div className="w-full max-w-sm text-left">
            <DicaInstalarParaPermissao />
          </div>
          {permitirFotoTeste && (
            <button className="btn-primary" onClick={() => void gerarFotoTeste()}>
              Usar foto de teste (demo) 📸
            </button>
          )}
        </div>
      </div>
    )
  }

  // A moldura sai da MESMA conta da captura, em coordenadas do quadro. O
  // SVG com `meet` encolhe igual ao `object-contain` do vídeo, então ela
  // cai exatamente sobre a imagem sem ninguém medir pixel de tela.
  const recorte = quadro
    ? recorteCentral(quadro.w, quadro.h, ASPECTO_FOTO)
    : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fundo">
      {faixaDeCima}

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedMetadata={(e) =>
            setQuadro({
              w: e.currentTarget.videoWidth,
              h: e.currentTarget.videoHeight,
            })
          }
          className={`h-full w-full object-contain ${
            facing === 'user' ? '-scale-x-100' : ''
          }`}
        />

        {quadro && recorte && (
          <svg
            viewBox={`0 0 ${quadro.w} ${quadro.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {/* Escurece tudo menos o recorte (regra par-ímpar) */}
            <path
              fillRule="evenodd"
              fill="rgba(0,0,0,0.45)"
              d={`M0 0 H${quadro.w} V${quadro.h} H0 Z M${recorte.sx} ${recorte.sy} H${
                recorte.sx + recorte.sw
              } V${recorte.sy + recorte.sh} H${recorte.sx} Z`}
            />
            <rect
              x={recorte.sx}
              y={recorte.sy}
              width={recorte.sw}
              height={recorte.sh}
              fill="none"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={Math.max(2, quadro.w / 400)}
            />
          </svg>
        )}

        {!pronta && (
          <div className="absolute inset-0 flex items-center justify-center text-tinta-400">
            <span className="animate-pulse text-3xl">📷</span>
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-10 px-6 pt-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <button
          onClick={() =>
            setFacing((f) => (f === 'user' ? 'environment' : 'user'))
          }
          aria-label="Virar câmera"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-preto/5 text-xl transition active:scale-90"
        >
          🔄
        </button>
        <button
          onClick={() => void capturar()}
          disabled={!pronta}
          aria-label="Tirar foto"
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-preto/15 transition active:scale-90 disabled:opacity-40"
        >
          <span className="block h-14 w-14 rounded-full bg-gradient-to-br from-brasa-500 to-brasa-700" />
        </button>
        {/* Contrapeso do botão de virar, para o disparo ficar centrado */}
        <span className="h-12 w-12" aria-hidden />
      </div>
    </div>
  )
}
