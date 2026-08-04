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
      await api.createCheckin(foto, legenda)
      toast(
        aindaPontuam.length > 0
          ? `Check-in confirmado! Valeu ponto em ${aindaPontuam.length} ${
              aindaPontuam.length === 1 ? 'desafio' : 'desafios'
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

      {aindaPontuam.length > 0 && (
        <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          ✅ Valendo ponto agora:{' '}
          <strong>{aindaPontuam.map((c) => c.titulo).join(', ')}</strong>
        </div>
      )}

      {jaPontuaram.length > 0 && (
        <div className="rounded-2xl bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
          👍 Você já pontuou nesta janela em{' '}
          <strong>{jaPontuaram.map((c) => c.titulo).join(', ')}</strong>. Vale
          1 ponto por janela, então esta foto entra no feed mas{' '}
          <strong>não conta ponto de novo</strong>.
        </div>
      )}

      {aindaPontuam.length === 0 && jaPontuaram.length === 0 && (
        <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠️ Nenhum desafio seu está com janela de check-in aberta agora. Você
          pode postar mesmo assim, mas a foto <strong>não marcará ponto</strong>.
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
        <>
          <CameraCapture
            onCapture={(b) => void aoCapturar(b)}
            permitirFotoTeste={api.mode === 'demo'}
          />
          <p className="px-2 text-center text-xs text-stone-500">
            A foto é tirada na hora, dentro do app — nada de foto antiga da
            galeria 😉
          </p>
        </>
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
        disabled={!foto || enviando}
        onClick={() => void publicar()}
      >
        {enviando ? 'Publicando…' : 'Publicar check-in 🎉'}
      </button>
    </div>
  )
}
