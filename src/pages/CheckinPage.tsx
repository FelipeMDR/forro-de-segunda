import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { challengePhase, desafiosQueContam } from '../lib/dates'
import { compressImage } from '../lib/image'
import type { Challenge } from '../lib/types'

export function CheckinPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [foto, setFoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    void api.listChallenges().then(setDesafios)
  }, [api])

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
        valendoAgora.length > 0
          ? `Check-in confirmado! Valeu ponto em ${valendoAgora.length} ${
              valendoAgora.length === 1 ? 'desafio' : 'desafios'
            } 🎉`
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

      {valendoAgora.length > 0 ? (
        <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          ✅ Valendo ponto agora:{' '}
          <strong>{valendoAgora.map((c) => c.titulo).join(', ')}</strong>
        </div>
      ) : (
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
            galeria 😉 Ela é comprimida no seu celular antes de subir.
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
