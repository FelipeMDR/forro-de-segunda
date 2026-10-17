import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Icone } from '../components/Icone'
import { Cabecalho, Segmentado, Tela, useVoltar } from '../components/ui'
import { alternarPraticado, lerPraticados } from '../lib/praticados'
import { comoAbriu } from '../lib/textosTrilha'
import {
  ehDrive,
  NIVEIS,
  NOME_NIVEL,
  situacaoDoNivel,
  urlDoEmbed,
} from '../lib/trilha'
import { professoresDo, useTrilha } from '../lib/useTrilha'

type Angulo = 'frente' | 'condutor' | 'conduzida'

const NOME_ANGULO: Record<Angulo, string> = {
  frente: 'De frente',
  condutor: 'Condutor',
  conduzida: 'Conduzida',
}

const VELOCIDADES = [0.5, 0.75, 1] as const

export function PassoPage() {
  const { id } = useParams()
  const { dados } = useTrilha()
  const voltar = useVoltar('/trilha')
  const player = useRef<HTMLIFrameElement>(null)
  const [angulo, setAngulo] = useState<Angulo>('frente')
  const [velocidade, setVelocidade] = useState<number>(1)
  const [praticados, setPraticados] = useState(lerPraticados)

  // Passo novo começa de frente e na velocidade normal
  useEffect(() => {
    setAngulo('frente')
    setVelocidade(1)
  }, [id])

  // Procura o passo no nível dele: "Próximo" nunca pula para outro nível
  const nivel = dados ? NIVEIS.find((n) => dados.ctx.passos.some((p) => p.id === id && p.nivel === n)) : undefined
  const lista = dados && nivel ? situacaoDoNivel(nivel, dados.ctx) : []
  const i = lista.findIndex((s) => s.passo.id === id)
  const s = i >= 0 ? lista[i] : null
  const proximo = i >= 0 ? lista[i + 1] : undefined



  if (dados && (!s || s.estado !== 'aberto' || !s.passo.video_frente)) {
    return (
      <Tela>
        <Cabecalho titulo="Passo" fallback="/trilha" />
        <p className="px-5 pt-4 text-[15px] text-ink2">Esse passo ainda não abriu para você.</p>
      </Tela>
    )
  }
  if (!s || !nivel) return null

  const videos: Record<Angulo, string | null> = {
    frente: s.passo.video_frente,
    condutor: s.passo.video_condutor,
    conduzida: s.passo.video_conduzida,
  }
  const angulos = (Object.keys(videos) as Angulo[]).filter((a) => videos[a])
  const video = videos[angulo] ?? s.passo.video_frente!
  const praticado = praticados.has(s.passo.id)
  const proximoAberto = proximo && proximo.estado === 'aberto' && proximo.passo.video_frente ? proximo : null

  // Velocidade pela API do player (o embed tem enablejsapi=1)
  const mudarVelocidade = (v: number) => {
    setVelocidade(v)
    player.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [v] }),
      '*',
    )
  }

  return (
    <Tela className="pb-6">
      <div className="bg-preto text-branco">
        <div className="flex items-center justify-between px-2 py-2">
          <button
            type="button"
            onClick={voltar}
            aria-label="Voltar para a trilha"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Icone nome="voltar" className="h-6 w-6" />
          </button>
          <span className="text-[13px] font-bold text-[#c3c8cb]">
            {NOME_NIVEL[nivel]} · Passo {s.numero} de {lista.length}
          </span>
          <span className="w-11" />
        </div>
        <div className="aspect-video w-full bg-marinho-500">
          <iframe
            ref={player}
            key={video}
            src={urlDoEmbed(video)}
            title={`Vídeo: ${s.passo.nome} (${NOME_ANGULO[angulo]})`}
            className="h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => !ehDrive(video) && velocidade !== 1 && mudarVelocidade(velocidade)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-[18px]">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.01em]">{s.passo.nome}</h1>
          <span className="text-sm text-ink2">{comoAbriu(s)}</span>
        </div>

        {dados && professoresDo(s.passo, dados).length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">Quem ensinou</span>
            <div className="flex flex-wrap gap-2">
              {professoresDo(s.passo, dados).map((p) => (
                <Link
                  key={p.id}
                  to={`/perfil/${p.id}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-full border border-linha bg-sf py-1.5 pr-4 pl-1.5"
                >
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={36} borda={false} />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[11px] font-bold uppercase tracking-[.05em] text-ink3">Professor(a)</span>
                    <span className="text-[15px] font-extrabold">{p.nome}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {angulos.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">Ângulo</span>
            <Segmentado
              opcoes={angulos.map((a) => ({ valor: a, rotulo: NOME_ANGULO[a] }))}
              valor={angulos.includes(angulo) ? angulo : 'frente'}
              onChange={setAngulo}
            />
          </div>
        )}

        {/* Velocidade só no YouTube: o player do Drive não aceita o comando */}
        {!ehDrive(video) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">Velocidade</span>
          <div className="flex gap-2">
            {VELOCIDADES.map((v) => {
              const ativo = v === velocidade
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => mudarVelocidade(v)}
                  className={`min-h-11 rounded-full border-[1.5px] px-4 text-sm font-extrabold ${
                    ativo ? 'border-preto bg-preto text-branco' : 'border-linha bg-transparent text-ink'
                  }`}
                >
                  {String(v).replace('.', ',')}x
                </button>
              )
            })}
          </div>
        </div>
        )}

        {s.passo.dica && (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-linha bg-sf p-3.5">
            <span className="text-sm font-extrabold">Dica do professor</span>
            <p className="text-sm leading-snug text-ink2">{s.passo.dica}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setPraticados(alternarPraticado(s.passo.id))}
            className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold ${
              praticado ? 'bg-verde-700 text-branco' : 'bg-chip text-ink'
            }`}
          >
            <Icone nome="check" traco={2.6} className="h-[18px] w-[18px]" />
            {praticado ? 'Praticado' : 'Marcar como praticado'}
          </button>
          {proximoAberto && (
            <Link
              to={`/trilha/${proximoAberto.passo.id}`}
              className="flex min-h-[52px] items-center gap-1.5 rounded-2xl bg-preto px-4 text-[15px] font-extrabold text-branco"
            >
              Próximo
              <Icone nome="avancar" className="h-[18px] w-[18px]" />
            </Link>
          )}
        </div>
      </div>
    </Tela>
  )
}
