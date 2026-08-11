import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  fraseDaRetrospectiva,
  inicioDoSemestre,
  montarRetrospectiva,
  type Retrospectiva,
} from '../lib/retrospectiva'

/** Cores da identidade, para desenhar a imagem sem depender do CSS. */
const BRASA = '#DE5300'
const AZUL = '#024565'
const PAPEL = '#F5F4F2'
const TINTA = '#000507'

/**
 * Desenha o card quadrado do Instagram (1080×1080).
 *
 * Em canvas e não em HTML: o objetivo é sair do app como arquivo, e
 * transformar DOM em imagem exigiria uma biblioteca inteira para fazer
 * pior. São seis linhas de texto — cabe à mão.
 */
function desenharCard(r: Retrospectiva, nome: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1080
  c.height = 1080
  const ctx = c.getContext('2d')!

  ctx.fillStyle = PAPEL
  ctx.fillRect(0, 0, 1080, 1080)

  // Faixa superior com a cor da marca
  ctx.fillStyle = BRASA
  ctx.fillRect(0, 0, 1080, 22)

  ctx.textAlign = 'center'
  ctx.fillStyle = AZUL
  ctx.font = 'bold 40px Poppins, system-ui, sans-serif'
  ctx.fillText('FORRÓ DE SEGUNDA', 540, 130)

  ctx.fillStyle = TINTA
  ctx.font = 'bold 74px Poppins, system-ui, sans-serif'
  ctx.fillText(nome.split(/\s+/).slice(0, 2).join(' '), 540, 235)

  ctx.fillStyle = '#5c6367'
  ctx.font = '38px Poppins, system-ui, sans-serif'
  ctx.fillText(r.rotuloPeriodo, 540, 295)

  const numeros: Array<[string, string]> = [
    [String(r.presencas), r.presencas === 1 ? 'presença' : 'presenças'],
    [String(r.parceiros), r.parceiros === 1 ? 'dupla' : 'duplas'],
    [String(r.streak), r.streak === 1 ? 'semana seguida' : 'semanas seguidas'],
  ]
  numeros.forEach(([valor, rotulo], i) => {
    const y = 440 + i * 175
    ctx.fillStyle = BRASA
    ctx.font = 'bold 116px Poppins, system-ui, sans-serif'
    ctx.fillText(valor, 540, y)
    ctx.fillStyle = '#4a5155'
    ctx.font = '40px Poppins, system-ui, sans-serif'
    ctx.fillText(rotulo.toUpperCase(), 540, y + 56)
  })

  ctx.fillStyle = AZUL
  ctx.font = 'bold 36px Poppins, system-ui, sans-serif'
  ctx.fillText(fraseDaRetrospectiva(r), 540, 1000)

  return c
}

export function RetrospectivaPage() {
  const { api, userId, profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [r, setR] = useState<Retrospectiva | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const cardRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    void (async () => {
      try {
        const desde = inicioDoSemestre().toISOString()
        const [checkins, parceiros] = await Promise.all([
          api.checkinsComReacoes(userId, desde),
          api.parceirosDe(userId).catch(() => []),
        ])
        if (cancelado) return
        setR(montarRetrospectiva(checkins, parceiros))
      } catch (e) {
        if (cancelado) return
        console.error('[retrospectiva] falha ao carregar', e)
        setErro((e as Error).message || 'Erro desconhecido')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [api, userId])

  const compartilhar = async () => {
    if (!r || !profile) return
    setGerando(true)
    try {
      const canvas = desenharCard(r, profile.nome)
      cardRef.current = canvas
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/png'),
      )
      if (!blob) throw new Error('Não foi possível gerar a imagem')
      const arquivo = new File([blob], 'forro-de-segunda.png', {
        type: 'image/png',
      })
      // No celular, compartilhar manda direto para o Instagram; no
      // computador não existe, então baixa o arquivo.
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'forro-de-segunda.png'
        a.click()
        URL.revokeObjectURL(url)
        toast('Imagem baixada! É só postar 📸')
      }
    } catch (e) {
      // Cancelar o compartilhamento não é erro
      if ((e as Error).name !== 'AbortError') {
        toast((e as Error).message, 'erro')
      }
    } finally {
      setGerando(false)
    }
  }

  if (erro) return <ErrorState erro={erro} onRetry={() => navigate(0)} />
  if (!r) return <Spinner texto="Somando sua temporada…" />

  const numeros: Array<[string, string]> = [
    [String(r.presencas), r.presencas === 1 ? 'presença' : 'presenças'],
    [String(r.parceiros), r.parceiros === 1 ? 'dupla' : 'duplas'],
    [String(r.streak), 'semanas seguidas'],
    [String(r.reacoesRecebidas), 'reações recebidas'],
  ]

  return (
    <div className="space-y-4">
      <button
        className="text-sm font-bold text-tinta-600"
        onClick={() => navigate(-1)}
      >
        ← Voltar
      </button>

      <div className="card space-y-4 p-6 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-azul-700">
            Sua temporada
          </p>
          <h1 className="text-2xl font-extrabold">{r.rotuloPeriodo}</h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {numeros.map(([valor, rotulo]) => (
            <div key={rotulo} className="rounded-2xl bg-fundo px-3 py-4">
              <p className="text-3xl font-extrabold text-brasa-700">{valor}</p>
              <p className="text-[11px] font-bold uppercase text-tinta-500">
                {rotulo}
              </p>
            </div>
          ))}
        </div>

        <p className="text-sm font-bold text-azul-700">
          {fraseDaRetrospectiva(r)}
        </p>
      </div>

      {r.parceiroTop && (
        <div className="card flex items-center gap-3 p-5">
          <Avatar
            nome={r.parceiroTop.nome}
            url={r.parceiroTop.avatar_url}
            tamanho={48}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-tinta-500">
              Sua dupla mais frequente
            </p>
            <p className="truncate font-bold">{r.parceiroTop.nome}</p>
            <p className="text-xs text-tinta-500">
              {r.parceiroTop.noites}{' '}
              {r.parceiroTop.noites === 1 ? 'noite' : 'noites'} juntos
            </p>
          </div>
        </div>
      )}

      {r.destaque && (
        <div className="card overflow-hidden">
          <p className="px-5 pt-4 text-xs font-bold uppercase text-tinta-500">
            Sua foto mais curtida
          </p>
          {r.destaque.foto_url ? (
            <img
              src={r.destaque.foto_url}
              alt={r.destaque.legenda ?? 'Sua foto mais curtida'}
              className="mt-3 aspect-square w-full object-cover"
            />
          ) : (
            <p className="px-5 pb-4 pt-2 text-sm text-tinta-500">
              A foto já foi arquivada, mas as {r.destaque.reacoes} reações
              ficaram 😉
            </p>
          )}
          {r.destaque.legenda && (
            <p className="px-5 py-3 text-sm">"{r.destaque.legenda}"</p>
          )}
        </div>
      )}

      <button
        className="btn-primary w-full py-3.5"
        disabled={gerando}
        onClick={() => void compartilhar()}
      >
        {gerando ? 'Gerando…' : 'Compartilhar no Instagram 📸'}
      </button>
      <p className="px-4 text-center text-xs text-tinta-500">
        Gera uma imagem quadrada com seus números. Marca a gente:
        <strong> @fds.itajuba</strong>
      </p>
    </div>
  )
}
