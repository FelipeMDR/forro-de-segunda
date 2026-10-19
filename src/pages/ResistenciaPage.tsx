import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icone } from '../components/Icone'
import { LinhaPedido } from '../components/LinhaPedido'
import { Spinner } from '../components/Spinner'
import { BotaoAcao, BotaoSuave, Cabecalho, Segmentado } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  AVISO_ANTES_MS,
  avisosCruzados,
  marcarMomento,
  minutoSegundo,
  momentosDeTroca,
  type Fala,
} from '../lib/resistencia'
import {
  apagarGravacao,
  guardarGravacao,
  guardarMarcas,
  guardarParceiros,
  lerGravacao,
  lerMarcas,
  lerParceiros,
} from '../lib/resistenciaLocal'
import type { ConexaoDJ, PlayerAgora } from '../lib/types'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'

const FRASES: Record<Fala, string> = {
  voltou: 'Voltou pra roda',
  trocou: 'Agradeceu, beijou e trocou',
}

/** De quanto em quanto tempo pergunta ao Spotify onde a música está. */
const LEITURA_MS = 4_000
/** Entre leituras, o progresso é estimado pelo relógio, nesta cadência. */
const TIQUE_MS = 200
/**
 * Gravação curta de propósito: no Android, um som de até ~5 s faz o
 * Spotify só abaixar o volume enquanto ele toca; mais longo, o Spotify
 * pausa (e o app teria de dar play de novo).
 */
const GRAVACAO_MAX_MS = 4_000
/** Quanto o aviso fica escrito na tela. */
const DESTAQUE_MS = 3_500
/** O toque na estrela vem um pouco depois do momento: compensa. */
const ATRASO_DO_TOQUE_MS = 500

const PARCEIROS = [
  { valor: '3', rotulo: '3 parceiros' },
  { valor: '4', rotulo: '4 parceiros' },
] as const

interface Leitura {
  player: PlayerAgora | null
  /** performance.now() da leitura, para estimar o progresso depois. */
  em: number
}

function progressoEstimado(l: Leitura, agora: number): number {
  const p = l.player
  if (!p?.faixa) return 0
  const andou = p.tocando ? agora - l.em : 0
  return Math.min(p.faixa.duracao_ms, p.progresso_ms + andou)
}

/**
 * Modo Resistência: aula em roda em que os avançados trocam de par no
 * meio da música. A tela acompanha o Spotify do professor e, em cada
 * divisa, toca "Voltou pra roda" e "Agradeceu, beijou e trocou" na voz
 * gravada (ou na voz do celular, sem gravação).
 *
 * Precisa ficar ABERTA no celular ligado na caixa: o aviso sai daqui.
 */
export function ResistenciaPage() {
  const { api } = useAuth()
  const toast = useToast()
  const pode = usePodeSerDJ()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [parceiros, setParceiros] = useState<3 | 4>(lerParceiros)
  const [gravacoes, setGravacoes] = useState<Record<Fala, Blob | null>>({
    voltou: null,
    trocou: null,
  })
  const [ligado, setLigado] = useState(false)
  const [leitura, setLeitura] = useState<Leitura>({ player: null, em: 0 })
  const [agora, setAgora] = useState(() => performance.now())
  const [marcas, setMarcas] = useState<number[]>([])
  const [destaque, setDestaque] = useState<Fala | null>(null)
  const [semSpotify, setSemSpotify] = useState(false)

  useEffect(() => {
    if (!pode) return
    api
      .minhaConexaoDJ()
      .then(setConexao)
      .catch(() => setConexao({ conectado: false, spotify_nome: null, plano: null }))
    void Promise.all([lerGravacao('voltou'), lerGravacao('trocou')]).then(([voltou, trocou]) =>
      setGravacoes({ voltou, trocou }),
    )
  }, [api, pode])

  // Os áudios ficam prontos antes da hora, e são "destravados" no toque
  // em Começar: o navegador do celular só deixa tocar som depois de um
  // toque da pessoa
  const audios = useRef<Partial<Record<Fala, HTMLAudioElement>>>({})
  useEffect(() => {
    const urls: string[] = []
    for (const fala of ['voltou', 'trocou'] as const) {
      const b = gravacoes[fala]
      if (!b) {
        delete audios.current[fala]
        continue
      }
      const url = URL.createObjectURL(b)
      urls.push(url)
      audios.current[fala] = new Audio(url)
    }
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [gravacoes])

  const uri = leitura.player?.faixa?.uri ?? null
  const duracao = leitura.player?.faixa?.duracao_ms ?? 0
  useEffect(() => {
    setMarcas(uri ? lerMarcas(uri) : [])
  }, [uri])
  const trocas = useMemo(
    () => (duracao ? momentosDeTroca(duracao, parceiros, marcas) : []),
    [duracao, parceiros, marcas],
  )

  // --- Ler o Spotify ---------------------------------------------------
  const ler = useCallback(async () => {
    try {
      const player = await api.playerAgora()
      setLeitura({ player, em: performance.now() })
      setSemSpotify(player === null)
      return player
    } catch (e) {
      console.warn('[resistencia] leitura falhou', e)
      return undefined
    }
  }, [api])

  useEffect(() => {
    if (!ligado) return
    void ler()
    const t = setInterval(() => void ler(), LEITURA_MS)
    return () => clearInterval(t)
  }, [ligado, ler])

  // --- Falar -----------------------------------------------------------
  const tocarFala = useCallback((fala: Fala): Promise<void> => {
    const el = audios.current[fala]
    if (el) {
      el.currentTime = 0
      return new Promise((ok) => {
        const fim = () => ok()
        el.onended = fim
        el.onerror = fim
        setTimeout(fim, GRAVACAO_MAX_MS + 3_000)
        el.play().catch(fim)
      })
    }
    // Sem gravação: a voz do próprio celular
    return new Promise((ok) => {
      if (!('speechSynthesis' in window)) return ok()
      const u = new SpeechSynthesisUtterance(FRASES[fala])
      u.lang = 'pt-BR'
      u.rate = 1.05
      u.onend = () => ok()
      u.onerror = () => ok()
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
      setTimeout(ok, 6_000)
    })
  }, [])

  const avisar = useCallback(
    async (fala: Fala) => {
      const tocavaAntes = leitura.player?.tocando === true
      setDestaque(fala)
      setTimeout(() => setDestaque((d) => (d === fala ? null : d)), DESTAQUE_MS)
      navigator.vibrate?.(200)
      await tocarFala(fala)
      // Se o celular pausou o Spotify por causa do som, dá play de novo
      if (!tocavaAntes) return
      const depois = await ler()
      if (depois && !depois.tocando) {
        await api.playSpotify().catch((e) => console.warn('[resistencia] play falhou', e))
        void ler()
      }
    },
    [api, ler, leitura.player?.tocando, tocarFala],
  )

  // --- O relógio: estima o progresso e solta os avisos ----------------
  const anterior = useRef<{ uri: string | null; ms: number }>({ uri: null, ms: 0 })
  const jaTocou = useRef(new Set<string>())
  useEffect(() => {
    if (!ligado) return
    const t = setInterval(() => setAgora(performance.now()), TIQUE_MS)
    return () => clearInterval(t)
  }, [ligado])

  const progresso = progressoEstimado(leitura, agora)
  useEffect(() => {
    if (!ligado) return
    const antes = anterior.current
    anterior.current = { uri, ms: progresso }
    if (!uri || antes.uri !== uri || progresso < antes.ms - 10_000) {
      // Música nova (ou a mesma de novo, do começo): o que já passou não toca
      jaTocou.current.clear()
      return
    }
    for (const a of avisosCruzados(trocas, antes.ms, progresso)) {
      const chave = `${a.troca}:${a.fala}`
      if (jaTocou.current.has(chave)) continue
      jaTocou.current.add(chave)
      void avisar(a.fala)
    }
  }, [ligado, uri, progresso, trocas, avisar])

  // --- Tela ligada -----------------------------------------------------
  useEffect(() => {
    if (!ligado || !('wakeLock' in navigator)) return
    let trava: WakeLockSentinel | null = null
    const pedir = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock
        .request('screen')
        .then((t) => (trava = t))
        .catch(() => {})
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      document.removeEventListener('visibilitychange', pedir)
      void trava?.release()
    }
  }, [ligado])

  const comecar = () => {
    // Destrava o som dentro do toque (exigência do navegador do celular)
    for (const el of Object.values(audios.current)) {
      if (!el) continue
      el.muted = true
      void el
        .play()
        .then(() => {
          el.pause()
          el.currentTime = 0
        })
        .catch(() => {})
        .finally(() => (el.muted = false))
    }
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    anterior.current = { uri: null, ms: 0 }
    setLigado(true)
  }

  // Troca na mão, fora da divisa: as duas falas, no mesmo intervalo
  const avisarAgora = () => {
    void avisar('voltou')
    setTimeout(() => void avisar('trocou'), AVISO_ANTES_MS)
  }

  const marcar = () => {
    if (!uri) return
    const novas = marcarMomento(marcas, progresso - ATRASO_DO_TOQUE_MS)
    if (novas.length === marcas.length) {
      toast('Esse momento já está marcado')
      return
    }
    setMarcas(novas)
    guardarMarcas(uri, novas)
    toast(`Momento marcado em ${minutoSegundo(progresso - ATRASO_DO_TOQUE_MS)}`)
  }

  const desmarcar = (m: number) => {
    if (!uri) return
    const novas = marcas.filter((x) => x !== m)
    setMarcas(novas)
    guardarMarcas(uri, novas)
  }

  if (pode === null || (pode && conexao === null)) {
    return <Spinner texto="Carregando o Modo Resistência…" />
  }
  if (!pode || !conexao?.conectado) {
    return (
      <div className="anima-tela">
        <Cabecalho titulo="Resistência" fallback="/dj" />
        <p className="mx-4 rounded-[20px] border border-linha bg-sf p-5 text-[15px] leading-relaxed text-ink2">
          {pode
            ? 'Conecte o seu Spotify no Modo DJ para usar o Modo Resistência.'
            : 'O Modo Resistência é para quem tem o cargo de DJ.'}
        </p>
      </div>
    )
  }

  const proxima = trocas.find((t) => t > progresso)
  const faixa = leitura.player?.faixa

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Resistência" sobretitulo="Modo DJ" fallback="/dj" />

      {destaque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-preto/85 p-6">
          <span className="text-center text-[44px] font-extrabold leading-[1.05] tracking-[-.02em] text-branco">
            {FRASES[destaque]}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-4 pt-1">
        {!ligado ? (
          <>
            <p className="text-[15px] leading-snug text-ink2">
              Dê play na playlist no Spotify deste celular, ligado na caixa. Em cada troca
              toca “{FRASES.voltou}” e, {AVISO_ANTES_MS / 1000} s depois, “{FRASES.trocou}”.
            </p>
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[15px] font-extrabold">Parceiros por música</span>
              <Segmentado
                valor={String(parceiros) as '3' | '4'}
                opcoes={PARCEIROS}
                onChange={(v) => {
                  const n = v === '4' ? 4 : 3
                  setParceiros(n)
                  guardarParceiros(n)
                }}
              />
            </div>
            <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
              <div className="px-3.5 pt-3 text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
                As vozes
              </div>
              {(['voltou', 'trocou'] as const).map((fala) => (
                <LinhaGravacao
                  key={fala}
                  fala={fala}
                  gravacao={gravacoes[fala]}
                  onOuvir={() => void tocarFala(fala)}
                  onMudou={(b) => setGravacoes((g) => ({ ...g, [fala]: b }))}
                />
              ))}
            </div>
            <BotaoAcao bloco onClick={comecar}>
              <Icone nome="play" tamanho={22} traco={2.3} />
              Começar a resistência
            </BotaoAcao>
            <span className="text-center text-[13px] leading-snug text-ink3">
              Deixe esta tela aberta durante a aula: o aviso sai daqui.
            </span>
          </>
        ) : (
          <>
            {semSpotify && (
              <p className="rounded-2xl border-[1.5px] border-brasa-500 bg-sf px-4 py-3 text-sm leading-snug">
                Nada tocando no Spotify. Abra o Spotify neste celular e dê play na playlist.
              </p>
            )}

            <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
              <div className="px-3.5 pt-3 text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
                Tocando agora
              </div>
              {faixa ? (
                <>
                  <LinhaPedido
                    className="px-3.5 py-3"
                    titulo={faixa.titulo}
                    artista={faixa.artista}
                    capaUrl={faixa.capa_url}
                    tamanhoCapa={64}
                  />
                  <BarraDaMusica
                    duracao={faixa.duracao_ms}
                    progresso={progresso}
                    trocas={trocas}
                    marcas={marcas}
                  />
                </>
              ) : (
                <p className="px-3.5 py-3 text-sm text-ink3">Lendo o Spotify…</p>
              )}
            </div>

            {faixa && (
              <div className="rounded-[20px] border-[1.5px] border-brasa-500 bg-sf px-4 py-3.5 text-center">
                <div className="text-xs font-extrabold uppercase tracking-[.06em] text-or-t">
                  {proxima !== undefined ? 'Próxima troca em' : 'Sem mais trocas nesta música'}
                </div>
                {proxima !== undefined && (
                  <div className="text-[44px] font-extrabold leading-none tracking-[-.03em] tabular-nums">
                    {minutoSegundo(proxima - progresso + 999)}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={!faixa}
              onClick={marcar}
              className="flex h-[76px] items-center justify-center gap-2.5 rounded-[18px] border-2 border-preto bg-azul-500 text-xl font-extrabold text-preto shadow-[0_4px_0_#000507] active:scale-[.97] disabled:opacity-45"
            >
              <Icone nome="estrela" tamanho={26} traco={2.3} />
              Momento bom aqui
            </button>
            <span className="-mt-1.5 px-1 text-[13px] leading-snug text-ink3">
              Toque na pausa ou na virada: a troca foge desse ponto, nesta e nas próximas
              aulas.
            </span>

            {marcas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {marcas.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => desmarcar(m)}
                    className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3 text-sm font-extrabold text-ink2"
                    aria-label={`Apagar o momento em ${minutoSegundo(m)}`}
                  >
                    <Icone nome="estrela" tamanho={14} /> {minutoSegundo(m)}
                    <Icone nome="fechar" tamanho={14} />
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <BotaoSuave bloco onClick={avisarAgora}>
                Trocar agora
              </BotaoSuave>
              <BotaoSuave bloco onClick={() => setLigado(false)}>
                Parar
              </BotaoSuave>
            </div>
            <span className="text-center text-[13px] leading-snug text-ink3">
              Deixe esta tela aberta durante a aula: o aviso sai daqui.
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/** A música em uma linha: onde estamos, as trocas e os momentos marcados. */
function BarraDaMusica({
  duracao,
  progresso,
  trocas,
  marcas,
}: {
  duracao: number
  progresso: number
  trocas: number[]
  marcas: number[]
}) {
  const pct = (ms: number) => `${Math.min(100, (ms / duracao) * 100)}%`
  return (
    <div className="px-3.5 pb-3.5">
      <div className="relative h-3 rounded-full bg-chip">
        <div className="absolute inset-y-0 left-0 rounded-full bg-ink/25" style={{ width: pct(progresso) }} />
        {marcas.map((m) => (
          <span
            key={`m${m}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-preto bg-azul-500"
            style={{ left: pct(m) }}
          />
        ))}
        {trocas.map((t) => (
          <span
            key={`t${t}`}
            className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full bg-brasa-500"
            style={{ left: pct(t) }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-bold tabular-nums text-ink3">
        <span>{minutoSegundo(progresso)}</span>
        <span>{minutoSegundo(duracao)}</span>
      </div>
    </div>
  )
}

/** Uma das duas vozes: gravar no celular, enviar um arquivo, ouvir, apagar. */
function LinhaGravacao({
  fala,
  gravacao,
  onOuvir,
  onMudou,
}: {
  fala: Fala
  gravacao: Blob | null
  onOuvir: () => void
  onMudou: (b: Blob | null) => void
}) {
  const toast = useToast()
  const [gravando, setGravando] = useState(false)
  const gravador = useRef<MediaRecorder | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const salvar = async (b: Blob) => {
    try {
      await guardarGravacao(fala, b)
      onMudou(b)
      toast('Voz guardada neste celular')
    } catch (e) {
      console.error('[resistencia]', e)
      toast('Não deu para guardar a gravação', 'erro')
    }
  }

  const gravar = async () => {
    if (gravando) {
      gravador.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      const pedacos: Blob[] = []
      r.ondataavailable = (e) => pedacos.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setGravando(false)
        void salvar(new Blob(pedacos, { type: r.mimeType }))
      }
      gravador.current = r
      r.start()
      setGravando(true)
      setTimeout(() => r.state === 'recording' && r.stop(), GRAVACAO_MAX_MS)
    } catch (e) {
      console.warn('[resistencia] microfone', e)
      toast('O celular não liberou o microfone', 'erro')
    }
  }

  const enviar = (f: File | undefined) => {
    if (!f) return
    const el = new Audio(URL.createObjectURL(f))
    el.onloadedmetadata = () => {
      if (el.duration > 5) {
        toast('Áudio longo: com mais de 5 s o Spotify pode pausar no aviso', 'erro')
      }
      URL.revokeObjectURL(el.src)
    }
    void salvar(f)
  }

  const apagar = async () => {
    await apagarGravacao(fala).catch(() => {})
    onMudou(null)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-linha px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[16px] font-extrabold">“{FRASES[fala]}”</span>
        <span className={`text-xs font-bold ${gravacao ? 'text-verde-700' : 'text-ink3'}`}>
          {gravacao ? 'gravada' : 'voz do celular'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <BotaoSuave tamanho="p" onClick={() => void gravar()}>
          {gravando ? 'Parar' : gravacao ? 'Regravar' : 'Gravar'}
        </BotaoSuave>
        <BotaoSuave tamanho="p" onClick={() => arquivo.current?.click()}>
          Enviar áudio
        </BotaoSuave>
        <BotaoSuave tamanho="p" onClick={onOuvir}>
          Ouvir
        </BotaoSuave>
        {gravacao && (
          <BotaoSuave tamanho="p" perigo onClick={() => void apagar()}>
            Apagar
          </BotaoSuave>
        )}
      </div>
      {gravando && (
        <span className="text-[13px] font-bold text-or-t">
          Gravando… fala curta, até {GRAVACAO_MAX_MS / 1000} s
        </span>
      )}
      <input
        ref={arquivo}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          enviar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
