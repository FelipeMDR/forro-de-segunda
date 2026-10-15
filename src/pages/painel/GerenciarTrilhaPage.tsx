import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BotaoAcao, Cabecalho, CartaoAtalho, Etiqueta, Segmentado, Tela } from '../../components/ui'
import { Icone } from '../../components/Icone'
import { useApi } from '../../context/AuthContext'
import { NIVEIS, NOME_NIVEL, ordenarPassos } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilha, RegrasTrilha } from '../../lib/types'

export function GerenciarTrilhaPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [passos, setPassos] = useState<PassoTrilha[] | null>(null)
  const [nivel, setNivel] = useState<NivelTrilha>('iniciante')
  const [regras, setRegras] = useState<RegrasTrilha | null>(null)

  useEffect(() => {
    void api.listPassosTrilha().then(setPassos)
    void api.regrasTrilha().then(setRegras)
  }, [api])

  const lista = ordenarPassos((passos ?? []).filter((p) => p.nivel === nivel))

  return (
    <Tela>
      <Cabecalho titulo="Vídeo-aulas" sobretitulo="Painel" fallback="/organizador" />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-24">
        <p className="px-1 text-sm text-ink2">Uma trilha por nível. As datas ficam no cronograma de cada turma.</p>
        <CartaoAtalho
          icone="agenda"
          cor="#DE5300"
          titulo="Cronogramas das turmas"
          descricao="Nível, primeira aula e datas de cada passo"
          onClick={() => navigate('/organizador/videoaulas/cronograma')}
        />
        <CartaoAtalho
          icone="chave"
          cor="#FFB98C"
          titulo="Regras das chaves"
          descricao={
            regras
              ? `${regras.pontos_por_chave} pontos = 1 chave · até ${regras.antecedencia_dias} dias antes`
              : 'Pontos por chave e antecedência'
          }
          onClick={() => navigate('/organizador/videoaulas/regras')}
        />
        <Segmentado
          opcoes={NIVEIS.map((n) => ({ valor: n, rotulo: NOME_NIVEL[n] }))}
          valor={nivel}
          onChange={setNivel}
        />
        {passos && lista.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">Nenhum passo neste nível ainda.</p>
        )}
        <div className="overflow-hidden rounded-[18px] border border-linha bg-sf">
          {lista.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/organizador/videoaulas/passo/${p.id}`)}
              className={`flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left ${i > 0 ? 'border-t border-linha' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip font-extrabold">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <b className="text-[15px]">{p.nome}</b>
                <Etiqueta cor={p.video_frente ? 'verde' : 'pessego'} className="self-start">
                  {p.video_frente ? 'Vídeo ok' : 'Falta o link'}
                </Etiqueta>
              </span>
            </button>
          ))}
        </div>
      </div>
      <BotaoAcao
        className="fixed right-[max(1rem,calc(50%-14rem+1rem))] bottom-[calc(env(safe-area-inset-bottom)+84px)] z-20 rounded-full px-5"
        onClick={() => navigate(`/organizador/videoaulas/passo/novo?nivel=${nivel}`)}
      >
        <Icone nome="mais" className="h-5 w-5" />
        Novo passo
      </BotaoAcao>
    </Tela>
  )
}
