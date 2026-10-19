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

/**
 * Força do aviso. A música não pode baixar, então quem sobe é a voz:
 * quanto maior, mais a fala é "encorpada" (saturação suave), ocupando
 * mais volume por cima da música, à custa de soar mais rasgada.
 */
export type Forca = 'normal' | 'forte' | 'maximo'
export const SATURACAO: Record<Forca, number> = { normal: 1, forte: 4, maximo: 10 }

/** Abaixo desta fração do pico, o começo e o fim da gravação são silêncio. */
const LIMIAR_SILENCIO = 0.05

/**
 * Deixa a fala o mais alta possível: corta o silêncio do começo e do fim
 * (o aviso sai na hora, e o chiado não é amplificado), leva o pico ao
 * máximo do celular e satura com tanh, que sobe o volume médio sem
 * passar do máximo. Pura: recebe e devolve as amostras.
 */
export function realcar(
  canais: Float32Array[],
  saturacao: number,
): Float32Array<ArrayBuffer>[] {
  let pico = 0
  for (const c of canais) for (const x of c) pico = Math.max(pico, Math.abs(x))
  if (pico < 1e-4 || canais.length === 0) return canais.map((c) => Float32Array.from(c))

  const tamanho = canais[0].length
  const alto = (i: number) => canais.some((c) => Math.abs(c[i]) >= pico * LIMIAR_SILENCIO)
  let ini = 0
  while (ini < tamanho - 1 && !alto(ini)) ini++
  let fim = tamanho - 1
  while (fim > ini && !alto(fim)) fim--

  const k = Math.max(saturacao, 1e-3)
  const escala = Math.tanh(k)
  return canais.map((c) => {
    const saida = new Float32Array(fim - ini + 1)
    for (let i = ini; i <= fim; i++) saida[i - ini] = Math.tanh((k * c[i]) / pico) / escala
    return saida
  })
}

export function tocarBuffer(buf: AudioBuffer, forca: Forca): Promise<void> {
  return tocar((c) => {
    const canais = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
    const prontos = realcar(canais, SATURACAO[forca])
    const alto = c.createBuffer(prontos.length, prontos[0].length, buf.sampleRate)
    prontos.forEach((canal, i) => alto.copyToChannel(canal, i))
    const f = c.createBufferSource()
    f.buffer = alto
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
      vol.gain.linearRampToValueAtTime(0.9, t + 0.02)
      vol.gain.setValueAtTime(0.9, t + dur - 0.05)
    } else {
      vol.gain.linearRampToValueAtTime(0.9, t + 0.02)
      vol.gain.setValueAtTime(0.9, t + 0.18)
      vol.gain.linearRampToValueAtTime(0, t + 0.2)
      vol.gain.setValueAtTime(0, t + 0.3)
      vol.gain.linearRampToValueAtTime(0.9, t + 0.32)
      vol.gain.setValueAtTime(0.9, t + dur - 0.05)
    }
    vol.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(vol).connect(c.destination)
    osc.start(t)
    osc.stop(t + dur)
    return osc
  })
}
