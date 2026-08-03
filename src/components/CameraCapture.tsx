import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Câmera dentro do app — a foto do check-in só pode ser tirada na hora
 * (sem galeria), para evitar fotos antigas. Usa getUserMedia; exige
 * HTTPS (ou localhost) e permissão de câmera.
 */
export function CameraCapture({
  onCapture,
  permitirFotoTeste = false,
}: {
  onCapture: (foto: Blob) => void
  /** Modo demo: oferece uma foto gerada quando a câmera não está disponível. */
  permitirFotoTeste?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
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

  const capturar = async () => {
    const video = videoRef.current
    if (!video || !pronta) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
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
    g.addColorStop(0, '#ff7a2f')
    g.addColorStop(1, '#e64980')
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

  if (erro) {
    return (
      <div className="card flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-white/10 p-6 text-center text-stone-400">
        <span className="text-5xl">📷</span>
        <p className="text-sm">{erro}</p>
        <button className="btn-ghost" onClick={() => void abrirCamera(facing)}>
          Tentar de novo
        </button>
        {permitirFotoTeste && (
          <button
            className="btn-primary"
            onClick={() => void gerarFotoTeste()}
          >
            Usar foto de teste (demo) 📸
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="card relative overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`aspect-[4/5] w-full bg-noite-950 object-cover ${
          facing === 'user' ? '-scale-x-100' : ''
        }`}
      />
      {!pronta && (
        <div className="absolute inset-0 flex items-center justify-center text-stone-500">
          <span className="animate-pulse text-3xl">📷</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/70 to-transparent p-4">
        <button
          onClick={() =>
            setFacing((f) => (f === 'user' ? 'environment' : 'user'))
          }
          aria-label="Virar câmera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl backdrop-blur transition active:scale-90"
        >
          🔄
        </button>
        <button
          onClick={() => void capturar()}
          disabled={!pronta}
          aria-label="Tirar foto"
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/25 backdrop-blur transition active:scale-90 disabled:opacity-40"
        >
          <span className="block h-11 w-11 rounded-full bg-white" />
        </button>
        <span className="h-11 w-11" aria-hidden />
      </div>
    </div>
  )
}
