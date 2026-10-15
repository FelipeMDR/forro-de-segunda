import { useNavigate } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import { nivelDoAluno, situacaoDoNivel } from '../lib/trilha'
import { useTrilha } from '../lib/useTrilha'
import { Icone } from './Icone'

/** Passo mais recente aberto e o próximo fechado do nível do aluno. */
export function CartaoTrilha() {
  const navigate = useNavigate()
  const { dados } = useTrilha()
  if (!dados) return null
  const nivel = nivelDoAluno(dados.ctx)
  if (!nivel) return null
  const lista = situacaoDoNivel(nivel, dados.ctx)
  const atual = [...lista].reverse().find((s) => s.estado === 'aberto')
  const proximo = lista.find((s) => s.estado !== 'aberto')
  if (!atual && !proximo) return null
  const porChave = dados.saldo.pontosPorChave
  const pontosNaVez = porChave - dados.saldo.faltam

  return (
    <button
      type="button"
      onClick={() => navigate('/trilha')}
      className="flex w-full flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4 text-left"
    >
      <span className="text-[13px] font-extrabold uppercase tracking-[.06em] text-or-t">Sua trilha</span>
      {atual && (
        <span className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marinho-500 text-branco">
            <Icone nome="play" className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <b className="text-base">{atual.passo.nome}</b>
            <span className="text-xs text-ink2">{atual.data ? `Aula de ${formatDate(atual.data)}` : 'Aberto'}</span>
          </span>
        </span>
      )}
      {proximo && (
        <span className="flex items-center gap-3 rounded-2xl bg-fundo px-3.5 py-3">
          <Icone nome={proximo.estado === 'chave' ? 'chave' : 'cadeado'} className="h-5 w-5 text-ink2" />
          <span className="flex flex-1 flex-col">
            <b className="text-sm">Próximo: {proximo.passo.nome}</b>
            <span className="text-xs text-ink2">
              {proximo.data ? `Libera ${formatDate(proximo.data)}` : 'Abre com a turma'}
              {proximo.estado === 'chave' ? ' · ou agora com 1 chave' : ''}
            </span>
          </span>
        </span>
      )}
      <span className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs font-bold text-ink2">
          <span>Presença e parceria até a próxima chave</span>
          <span>
            {pontosNaVez} de {porChave}
          </span>
        </span>
        <span className="h-2 overflow-hidden rounded-full bg-chip">
          <span className="block h-full rounded-full bg-brasa-500" style={{ width: `${(pontosNaVez / porChave) * 100}%` }} />
        </span>
      </span>
    </button>
  )
}
