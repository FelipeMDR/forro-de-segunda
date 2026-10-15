import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BotaoAcao, Cabecalho, CartaoAtalho, Etiqueta, Segmentado, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { NIVEIS, NOME_NIVEL, ordenarPassos } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilha } from '../../lib/types'

export function GerenciarTrilhaPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [passos, setPassos] = useState<PassoTrilha[] | null>(null)
  const [nivel, setNivel] = useState<NivelTrilha>('iniciante')

  useEffect(() => {
    void api.listPassosTrilha().then(setPassos)
  }, [api])

  const lista = ordenarPassos((passos ?? []).filter((p) => p.nivel === nivel))

  return (
    <Tela>
      <Cabecalho titulo="Vídeo-aulas" sobretitulo="Trilha" fallback="/perfil" />
      <div className="flex flex-col gap-3 px-4 pt-2">
        <p className="px-1 text-sm text-ink2">Uma trilha por nível. As datas ficam no cronograma de cada turma.</p>
        <CartaoAtalho
          icone="agenda"
          cor="#DE5300"
          titulo="Cronogramas das turmas"
          descricao="Nível, primeira aula e datas de cada passo"
          onClick={() => navigate('/trilha/gerenciar/cronograma')}
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
              onClick={() => navigate(`/trilha/gerenciar/passo/${p.id}`)}
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
        <BotaoAcao bloco onClick={() => navigate(`/trilha/gerenciar/passo/novo?nivel=${nivel}`)}>
          Novo passo
        </BotaoAcao>
      </div>
    </Tela>
  )
}
