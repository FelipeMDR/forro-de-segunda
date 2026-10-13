import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { estadoDaPermissao } from '../lib/permissoes'
import { DicaInstalarParaPermissao } from './DicaInstalarParaPermissao'
import { Icone } from './Icone'
import { BotaoAcao } from './ui'

/**
 * A câmera já foi aberta com sucesso nesta sessão?
 *
 * Fica fora do componente porque a tela de check-in monta e desmonta o
 * tempo todo (ir ao feed e voltar, tirar outra foto). Sem isto, cada
 * volta cairia de novo no aviso de "abrir a câmera" mesmo já tendo
 * liberado há dez segundos.
 *
 * Some quando a aba é fechada — de propósito: é exatamente o mesmo
 * tempo de vida da permissão de sessão do Safari, que é quem manda aqui.
 */
let abriuNestaSessao = false

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
  abrirDireto = false,
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
  /**
   * A pessoa acabou de tocar em "Abrir câmera" (no cartaz do check-in):
   * o toque já aconteceu, então não há por que pedir outro.
   */
  abrirDireto?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [erro, setErro] = useState<string | null>(null)
  const [pronta, setPronta] = useState(false)

  // `useRef` e não dependência: o callback muda de identidade a cada
  // render de quem chama, e como dependência ele reabriria a câmera —
  // um novo `getUserMedia` a cada render, que é exatamente o tipo de
  // coisa que faz o navegador perguntar de novo.
  const aoResolver = useRef(onResolvida)
  aoResolver.current = onResolvida

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
      abriuNestaSessao = true
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

  /**
   * Esperando um toque para só então pedir a câmera.
   *
   * `null` = ainda decidindo (não pisca nada na tela). Começa esperando
   * quando a câmera nunca abriu nesta sessão, e o efeito abaixo libera
   * na hora se descobrir que a permissão já está dada.
   */
  const [aguardandoToque, setAguardandoToque] = useState<boolean | null>(null)

  // Decide UMA vez, na montagem: abrir sozinho ou esperar o toque.
  //
  // Esta é a diferença que faz o app parar de perguntar "toda vez que
  // entro": antes bastava a tela de check-in aparecer para o navegador
  // disparar o pedido de câmera, mesmo que a pessoa só estivesse
  // passando por ali. Agora o pedido só sai quando ela toca — e quem já
  // liberou não vê diferença nenhuma, porque aí abre direto.
  useEffect(() => {
    let cancelado = false
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
    void (async () => {
      // `liberada` = o navegador já guardou o sim, então abrir não faz
      // aparecer diálogo nenhum. Safari não responde por 'camera' e cai
      // em `desconhecido`: aí esperamos o toque, que é justamente onde
      // o pedido repetido mais incomoda.
      const jaPode =
        abrirDireto ||
        abriuNestaSessao ||
        (await estadoDaPermissao('camera')) === 'liberada'
      if (cancelado) return
      setAguardandoToque(!jaPode)
    })()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Abre (e reabre ao virar a câmera) só depois de liberado o caminho.
  useEffect(() => {
    if (aguardandoToque !== false) return
    void abrirCamera(facing)
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [abrirCamera, facing, aguardandoToque])

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

  const [flash, setFlash] = useState(false)
  const disparar = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 260)
    void capturar()
  }

  const botaoFechar = (
    <button
      type="button"
      onClick={onFechar}
      aria-label="Fechar câmera"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-branco/12 text-branco transition active:scale-90"
    >
      <Icone nome="fechar" tamanho={20} traco={2.4} />
    </button>
  )

  /** Faixa de cima: sair da câmera e, no meio, o aviso do check-in. */
  const faixaDeCima = (
    <div
      className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-3.5 pb-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
    >
      {botaoFechar}
      <div className="flex min-w-0 flex-1 justify-center">
        {topo ?? <span className="text-base font-extrabold">Check-in</span>}
      </div>
      <span className="w-11 shrink-0" aria-hidden />
    </div>
  )

  // Esperando o toque: nenhum pedido de permissão saiu ainda, e é esse
  // o ponto — entrar na tela não pode disparar diálogo do sistema.
  if (!erro && aguardandoToque) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-preto text-branco"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {faixaDeCima}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-branco/10">
            <Icone nome="camera" tamanho={36} traco={2} />
          </span>
          <p className="text-[15px] text-branco/75">
            Toque para abrir a câmera e registrar sua presença.
          </p>
          <BotaoAcao tamanho="m" sombra={false} onClick={() => setAguardandoToque(false)}>
            Abrir a câmera
          </BotaoAcao>
          <div className="w-full max-w-sm" data-theme="dark">
            <DicaInstalarParaPermissao />
          </div>
          {permitirFotoTeste && (
            <button
              type="button"
              className="text-sm font-bold text-branco/70 underline underline-offset-4"
              onClick={() => void gerarFotoTeste()}
            >
              Usar foto de teste (demo)
            </button>
          )}
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-preto text-branco"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {faixaDeCima}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-branco/10">
            <Icone nome="camera" tamanho={36} traco={2} />
          </span>
          <p className="text-[15px] leading-snug text-branco/75">{erro}</p>
          <button
            type="button"
            className="h-12 rounded-2xl border-[1.5px] border-branco/25 px-5 text-[15px] font-bold"
            onClick={() => void abrirCamera(facing)}
          >
            Tentar de novo
          </button>
          {/* Quem chegou aqui é exatamente quem se cansou de liberar a
              câmera toda vez — é o melhor momento para contar que
              instalar resolve. Some sozinho para quem já instalou. */}
          <div className="w-full max-w-sm" data-theme="dark">
            <DicaInstalarParaPermissao />
          </div>
          {permitirFotoTeste && (
            <BotaoAcao tamanho="m" sombra={false} onClick={() => void gerarFotoTeste()}>
              Usar foto de teste (demo)
            </BotaoAcao>
          )}
        </div>
      </div>
    )
  }

  // O visor tem o formato da publicação (4:5) e o vídeo o preenche com
  // `object-cover`, centrado. É exatamente o recorte de `recorteCentral`
  // — o que aparece no quadro é o que vai para o feed, sem zoom além do
  // corte que a foto vai ter de qualquer jeito.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-preto text-branco">
      {faixaDeCima}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          className="relative aspect-[4/5] overflow-hidden bg-[#141B1F]"
          style={{ width: 'min(100%, calc((100dvh - 290px) * 0.8))' }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-cover ${
              facing === 'user' ? '-scale-x-100' : ''
            }`}
          />
          {/* Regra dos terços e cantos do quadro */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(245,244,242,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(245,244,242,.12) 1px,transparent 1px)',
              backgroundSize: '33.333% 33.333%',
            }}
          />
          <span aria-hidden className="absolute left-2.5 top-2.5 h-[26px] w-[26px] rounded-tl-lg border-l-[3px] border-t-[3px] border-branco" />
          <span aria-hidden className="absolute right-2.5 top-2.5 h-[26px] w-[26px] rounded-tr-lg border-r-[3px] border-t-[3px] border-branco" />
          <span aria-hidden className="absolute bottom-2.5 left-2.5 h-[26px] w-[26px] rounded-bl-lg border-b-[3px] border-l-[3px] border-branco" />
          <span aria-hidden className="absolute bottom-2.5 right-2.5 h-[26px] w-[26px] rounded-br-lg border-b-[3px] border-r-[3px] border-branco" />
          {!pronta && (
            <div className="absolute inset-0 flex items-center justify-center text-branco/50">
              <span className="animate-pulse">
                <Icone nome="camera" tamanho={36} />
              </span>
            </div>
          )}
          {flash && (
            <div
              className="absolute inset-0 bg-branco"
              style={{ animation: 'flash-some .25s ease forwards' }}
            />
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 flex-col items-center gap-4 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <span className="text-[13px] font-semibold text-branco/70">
          Tudo dentro do quadro entra na publicação
        </span>
        <div className="flex w-full items-center justify-around">
          <span className="h-[52px] w-[52px]" aria-hidden />
          <button
            type="button"
            onClick={disparar}
            disabled={!pronta}
            aria-label="Tirar foto"
            className="flex h-[84px] w-[84px] rounded-full border-[5px] border-branco p-[5px] transition active:scale-[.94] disabled:opacity-40"
          >
            <span className="flex-1 rounded-full bg-brasa-500" />
          </button>
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label="Alternar câmera"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-branco/14 transition active:scale-90"
          >
            <Icone nome="girar" tamanho={24} traco={2} />
          </button>
        </div>
      </div>
    </div>
  )
}
