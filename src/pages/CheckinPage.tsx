import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  challengePhase,
  desafiosQueContam,
  janelaDoCheckin,
} from '../lib/dates'
import { compressImage } from '../lib/image'
import {
  distanciaLegivel,
  distanciaMetros,
  obterPosicao,
  type PosicaoObtida,
} from '../lib/geo'
import {
  esperaLegivel,
  limiteCheckin,
  LIMITE_POR_JANELA,
} from '../lib/limites'
import type { Challenge } from '../lib/types'

export function CheckinPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [meusCheckins, setMeusCheckins] = useState<Date[]>([])
  const [foto, setFoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Muda sozinho com o tempo (o respiro de 5 min vence), então precisa
  // de um tique para a tela destravar sem o aluno recarregar a página.
  const [agora, setAgora] = useState(() => new Date())
  const [posicao, setPosicao] = useState<PosicaoObtida | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [buscandoLocal, setBuscandoLocal] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 20_000)
    return () => clearInterval(t)
  }, [])

  const limite = useMemo(
    () => limiteCheckin(meusCheckins, agora),
    [meusCheckins, agora],
  )

  useEffect(() => {
    void api.listChallenges().then(setDesafios).catch(() => setDesafios([]))
    if (userId) {
      void api
        .checkinsDe(userId)
        .then((cs) => setMeusCheckins(cs.map((c) => new Date(c.criado_em))))
        .catch(() => setMeusCheckins([]))
    }
  }, [api, userId])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  // Desafios (que eu participo) cuja janela está aberta agora
  const valendoAgora = useMemo(
    () =>
      desafiosQueContam(
        new Date(),
        desafios.filter((c) => c.sou_membro && challengePhase(c) === 'ativo'),
      ),
    [desafios],
  )

  // Cada janela vale 1 ponto por desafio: separa os que ainda vão pontuar
  // agora dos que já pontuaram nesta janela. Usa a janela (não a data do
  // calendário) para não se perder em desafios que cruzam a meia-noite
  // (ex.: 21:00–02:00) — check-in às 23h e outro à 01h são a MESMA janela.
  const { aindaPontuam, jaPontuaram } = useMemo(() => {
    const agora = new Date()
    const aindaPontuam: Challenge[] = []
    const jaPontuaram: Challenge[] = []
    for (const c of valendoAgora) {
      const janelaAtual = janelaDoCheckin(agora, c)
      const jaContou =
        janelaAtual !== null &&
        meusCheckins.some((d) => janelaDoCheckin(d, c) === janelaAtual)
      if (jaContou) jaPontuaram.push(c)
      else aindaPontuam.push(c)
    }
    return { aindaPontuam, jaPontuaram }
  }, [valendoAgora, meusCheckins])

  // Desafios abertos agora que exigem estar no local
  const comLocal = useMemo(
    () => valendoAgora.filter((c) => c.local),
    [valendoAgora],
  )

  // Só pede GPS se algum desafio realmente precisar — pedir permissão
  // sem motivo é o tipo de coisa que faz o aluno negar pra sempre.
  const buscarLocal = async () => {
    setBuscandoLocal(true)
    setErroLocal(null)
    try {
      setPosicao(await obterPosicao())
    } catch (e) {
      setErroLocal((e as Error).message)
    } finally {
      setBuscandoLocal(false)
    }
  }

  useEffect(() => {
    if (comLocal.length > 0 && !posicao && !erroLocal && !buscandoLocal) {
      void buscarLocal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comLocal.length])

  /** Situação de cada desafio com local: dentro do raio ou não. */
  const situacaoLocal = useMemo(
    () =>
      comLocal.map((c) => {
        const distancia = posicao ? distanciaMetros(posicao, c.local!) : null
        return {
          desafio: c,
          distancia,
          dentro: distancia !== null && distancia <= c.local!.raio_m,
        }
      }),
    [comLocal, posicao],
  )

  /** Dos que ainda pontuam, os que a localização não barra. */
  const aindaPontuamAqui = useMemo(
    () =>
      aindaPontuam.filter(
        (c) =>
          !c.local ||
          situacaoLocal.find((s) => s.desafio.id === c.id)?.dentro === true,
      ),
    [aindaPontuam, situacaoLocal],
  )

  const aoCapturar = async (blob: Blob) => {
    try {
      const comprimida = await compressImage(blob)
      setFoto(comprimida)
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(comprimida)
      })
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const publicar = async () => {
    if (!foto) return
    setEnviando(true)
    try {
      await api.createCheckin(foto, legenda, posicao)
      toast(
        aindaPontuamAqui.length > 0
          ? `Check-in confirmado! Valeu ponto em ${aindaPontuamAqui.length} ${
              aindaPontuamAqui.length === 1 ? 'desafio' : 'desafios'
            } 🎉`
          : jaPontuaram.length > 0
            ? 'Foto publicada! O ponto de hoje já tinha sido contado 😉'
            : 'Foto publicada! (nenhum desafio com janela aberta agora)',
      )
      navigate('/')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Check-in da aula 📸</h1>

      {aindaPontuamAqui.length > 0 && (
        <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          ✅ Valendo ponto agora:{' '}
          <strong>{aindaPontuamAqui.map((c) => c.titulo).join(', ')}</strong>
        </div>
      )}

      {comLocal.length > 0 && (
        <div className="rounded-2xl bg-preto/5 px-4 py-3 text-sm">
          {buscandoLocal && (
            <p className="text-tinta-600">📍 Conferindo onde você está…</p>
          )}

          {erroLocal && (
            <div className="space-y-2">
              <p className="text-amber-700">
                📍 {erroLocal}. Estes desafios só contam ponto para quem
                está no local:{' '}
                <strong>{comLocal.map((c) => c.titulo).join(', ')}</strong>.
                Você ainda pode postar, mas não vai marcar ponto neles.
              </p>
              <button className="btn-ghost" onClick={() => void buscarLocal()}>
                Tentar de novo
              </button>
            </div>
          )}

          {posicao && (
            <ul className="space-y-1.5">
              {situacaoLocal.map(({ desafio, distancia, dentro }) => (
                <li key={desafio.id} className="flex items-start gap-2">
                  <span>{dentro ? '📍' : '🚫'}</span>
                  <span className={dentro ? 'text-emerald-800' : 'text-amber-700'}>
                    {dentro ? (
                      <>
                        Você está em{' '}
                        <strong>
                          {desafio.local?.nome || 'local do desafio'}
                        </strong>{' '}
                        — <strong>{desafio.titulo}</strong> conta ponto.
                      </>
                    ) : (
                      <>
                        Você está a{' '}
                        <strong>{distanciaLegivel(distancia ?? 0)}</strong> de{' '}
                        <strong>
                          {desafio.local?.nome || 'local do desafio'}
                        </strong>
                        . <strong>{desafio.titulo}</strong> só conta ponto lá.
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {jaPontuaram.length > 0 && (
        <div className="rounded-2xl bg-azul-500/10 px-4 py-3 text-sm text-azul-700">
          👍 Você já pontuou nesta janela em{' '}
          <strong>{jaPontuaram.map((c) => c.titulo).join(', ')}</strong>. Vale
          1 ponto por janela, então esta foto entra no feed mas{' '}
          <strong>não conta ponto de novo</strong>.
        </div>
      )}

      {aindaPontuam.length === 0 && jaPontuaram.length === 0 && (
        <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          ⚠️ Nenhum desafio seu está com janela de check-in aberta agora. Você
          pode postar mesmo assim, mas a foto <strong>não marcará ponto</strong>.
        </div>
      )}

      {!limite.pode && limite.liberaEm && (
        <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {limite.motivo === 'intervalo' ? (
            <>
              ⏳ Calma no pé! Dá pra postar de novo em{' '}
              <strong>{esperaLegivel(limite.liberaEm, agora)}</strong>.
            </>
          ) : (
            <>
              ⏳ Você já postou {LIMITE_POR_JANELA} check-ins nas últimas
              horas. Libera de novo em{' '}
              <strong>{esperaLegivel(limite.liberaEm, agora)}</strong> — a
              presença de hoje já está registrada 😉
            </>
          )}
        </div>
      )}

      {preview ? (
        <div className="card overflow-hidden">
          <img
            src={preview}
            alt="Prévia do check-in"
            className="aspect-[4/5] w-full object-cover"
          />
          <button
            className="btn-ghost m-3"
            onClick={() => {
              setFoto(null)
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old)
                return null
              })
            }}
          >
            Tirar outra 🔄
          </button>
        </div>
      ) : (
        limite.pode && (
          <>
            <CameraCapture
              onCapture={(b) => void aoCapturar(b)}
              permitirFotoTeste={api.mode === 'demo'}
            />
            <p className="px-2 text-center text-xs text-tinta-500">
              A foto é tirada na hora, dentro do app — nada de foto antiga da
              galeria 😉
              {limite.restantes <= 2 && (
                <>
                  {' '}
                  Você ainda pode postar{' '}
                  <strong>
                    {limite.restantes}{' '}
                    {limite.restantes === 1 ? 'foto' : 'fotos'}
                  </strong>{' '}
                  nas próximas horas.
                </>
              )}
            </p>
          </>
        )
      )}

      <div>
        <label className="label" htmlFor="legenda">
          Legenda (opcional)
        </label>
        <textarea
          id="legenda"
          className="input resize-none"
          rows={2}
          maxLength={200}
          placeholder="Como foi a aula de hoje?"
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
        />
      </div>

      <button
        className="btn-primary w-full py-3.5 text-base"
        disabled={!foto || enviando || !limite.pode}
        onClick={() => void publicar()}
      >
        {enviando ? 'Publicando…' : 'Publicar check-in 🎉'}
      </button>
    </div>
  )
}
