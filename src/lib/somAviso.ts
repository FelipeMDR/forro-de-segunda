/**
 * O som dos avisos do Modo Resistência, MISTURADO com a música.
 *
 * O aviso não pode pausar nem abaixar o Spotify: a pausa quebra a
 * troca e o ritmo da dança. Um <audio> comum faz o iPhone tratar o som
 * como "o áudio principal", e o iOS interrompe o Spotify (que não volta
 * sozinho). Por isso:
 *
 *  - `navigator.audioSession.type = 'ambient'` (iOS 16.4+): o som da
 *    página vira som de fundo, que se mistura com os outros apps. Como
 *    todo som de fundo do iPhone, ele obedece à chave de silencioso;
 *  - o áudio toca pela Web Audio (AudioContext), não por <audio>, que
 *    também não entra no "tocando agora" da tela de bloqueio.
 *
 * Sem gravação, toca um apito gerado aqui mesmo. A voz sintética do
 * celular (speechSynthesis) ficou de fora: ela pede o som só para si.
 */

interface SessaoDeAudio {
  type: string
}

let ctx: AudioContext | null = null

function contexto(): AudioContext {
  ctx ??= new AudioContext()
  return ctx
}

function sessaoDeAudio(tipo: 'ambient' | 'auto') {
  const sessao = (navigator as Navigator & { audioSession?: SessaoDeAudio }).audioSession
  if (!sessao || sessao.type === tipo) return
  try {
    sessao.type = tipo
  } catch {
    // navegador antigo: segue sem
  }
}

/**
 * iPhone sem a sessão "de fundo" (iOS anterior ao 16.4): lá o aviso
 * ainda pausaria a música, e a tela avisa para atualizar.
 */
export function iPhoneSemMistura(): boolean {
  return ehIPhone() && !('audioSession' in navigator)
}

/** iPhone ou iPad (o iPad se apresenta como Mac, mas tem toque). */
export function ehIPhone(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

/**
 * Antes de gravar: o microfone precisa do modo normal. O "de fundo"
 * volta sozinho no próximo som tocado.
 */
export function modoGravacao() {
  sessaoDeAudio('auto')
}

/**
 * Chamar DENTRO de um toque da pessoa (Começar, Ouvir): o navegador do
 * celular só libera o som depois de um toque.
 */
export function prepararSom() {
  sessaoDeAudio('ambient')
  const c = contexto()
  if (c.state !== 'running') void c.resume()
}

export async function decodificar(audio: Blob): Promise<AudioBuffer | null> {
  try {
    return await contexto().decodeAudioData(await audio.arrayBuffer())
  } catch (e) {
    console.warn('[som] não deu para ler o áudio', e)
    return null
  }
}

function tocar(montar: (c: AudioContext) => AudioScheduledSourceNode): Promise<void> {
  sessaoDeAudio('ambient')
  const c = contexto()
  if (c.state !== 'running') void c.resume()
  return new Promise((ok) => {
    const fonte = montar(c)
    fonte.onended = () => ok()
    setTimeout(ok, 8_000)
  })
}

export function tocarBuffer(buf: AudioBuffer): Promise<void> {
  return tocar((c) => {
    const f = c.createBufferSource()
    f.buffer = buf
    f.connect(c.destination)
    f.start()
    return f
  })
}

/** Apito curto: dois toques no "voltou", um longo no "trocou". */
export function apito(longo: boolean): Promise<void> {
  return tocar((c) => {
    const osc = c.createOscillator()
    const vol = c.createGain()
    osc.type = 'square'
    osc.frequency.value = 2_200
    const t = c.currentTime
    const dur = longo ? 0.9 : 0.5
    vol.gain.setValueAtTime(0, t)
    if (longo) {
      vol.gain.linearRampToValueAtTime(0.35, t + 0.02)
      vol.gain.setValueAtTime(0.35, t + dur - 0.05)
    } else {
      vol.gain.linearRampToValueAtTime(0.35, t + 0.02)
      vol.gain.setValueAtTime(0.35, t + 0.18)
      vol.gain.linearRampToValueAtTime(0, t + 0.2)
      vol.gain.setValueAtTime(0, t + 0.3)
      vol.gain.linearRampToValueAtTime(0.35, t + 0.32)
      vol.gain.setValueAtTime(0.35, t + dur - 0.05)
    }
    vol.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(vol).connect(c.destination)
    osc.start(t)
    osc.stop(t + dur)
    return osc
  })
}
