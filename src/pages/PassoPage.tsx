import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BotaoAcao, Cabecalho, Segmentado, Tela } from '../components/ui'
import { NIVEIS, situacaoDoNivel, urlDoEmbed } from '../lib/trilha'
import { useTrilha } from '../lib/useTrilha'

type Angulo = 'frente' | 'condutor' | 'conduzida'

const CHAVE_PRATICADOS = 'fds-trilha-praticados'

function lerPraticados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PRATICADOS) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function PassoPage() {
  const { id } = useParams()
  const { dados } = useTrilha()
  const [angulo, setAngulo] = useState<Angulo>('frente')
  const [praticados, setPraticados] = useState(lerPraticados)

  const todos = dados ? NIVEIS.flatMap((n) => situacaoDoNivel(n, dados.ctx)) : []
  const i = todos.findIndex((s) => s.passo.id === id)
  const s = i >= 0 ? todos[i] : null
  const proximo = i >= 0 ? todos[i + 1] : undefined

  if (dados && (!s || s.estado !== 'aberto' || !s.passo.video_frente)) {
    return (
      <Tela>
        <Cabecalho titulo="Passo" fallback="/trilha" />
        <p className="px-5 pt-4 text-[15px] text-ink2">Esse passo ainda não abriu para você.</p>
      </Tela>
    )
  }
  if (!s) return null

  const videos: Record<Angulo, string | null> = {
    frente: s.passo.video_frente,
    condutor: s.passo.video_condutor,
    conduzida: s.passo.video_conduzida,
  }
  const angulos = (['frente', 'condutor', 'conduzida'] as const).filter((a) => videos[a])
  const video = videos[angulo] ?? s.passo.video_frente!
  const praticado = praticados.includes(s.passo.id)

  const alternarPraticado = () => {
    const novo = praticado ? praticados.filter((x) => x !== s.passo.id) : [...praticados, s.passo.id]
    setPraticados(novo)
    try {
      localStorage.setItem(CHAVE_PRATICADOS, JSON.stringify(novo))
    } catch {
      // Sem armazenamento (aba anônima): vale só nesta visita
    }
  }

  return (
    <Tela>
      <Cabecalho titulo={s.passo.nome} sobretitulo={`Aula ${s.numero}`} fallback="/trilha" />
      <div className="aspect-video w-full bg-preto">
        <iframe
          key={video}
          src={urlDoEmbed(video)}
          title={`Vídeo: ${s.passo.nome}`}
          className="h-full w-full"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4">
        {angulos.length > 1 && (
          <Segmentado
            opcoes={angulos.map((a) => ({
              valor: a,
              rotulo: a === 'frente' ? 'De frente' : a === 'condutor' ? 'Condutor' : 'Conduzida',
            }))}
            valor={angulo}
            onChange={setAngulo}
          />
        )}
        {s.passo.dica && (
          <div className="rounded-2xl border border-linha bg-sf p-4">
            <div className="text-sm font-extrabold">Dica do professor</div>
            <p className="mt-1 text-sm leading-snug text-ink2">{s.passo.dica}</p>
          </div>
        )}
        <div className="flex gap-2.5">
          <BotaoAcao cor={praticado ? 'verde' : 'claro'} sombra={false} className="flex-1" onClick={alternarPraticado}>
            {praticado ? 'Praticado' : 'Marcar como praticado'}
          </BotaoAcao>
          {proximo && proximo.estado === 'aberto' && proximo.passo.video_frente && (
            <Link to={`/trilha/${proximo.passo.id}`} className="flex items-center rounded-2xl bg-preto px-4 font-extrabold text-branco">
              Próximo
            </Link>
          )}
        </div>
      </div>
    </Tela>
  )
}
