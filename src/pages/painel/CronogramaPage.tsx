import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotaoAcao, Cabecalho, ChipEscolha, Confirmar, Tela } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { diaDaNoite, formatDate } from '../../lib/dates'
import { linhaCronograma, type TomLinha } from '../../lib/textosTrilha'
import { cronogramaDeTurma, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { AgendaEvent, Feriado, NivelTrilha, PassoTrilha, Turma } from '../../lib/types'
import { Campo } from './contexto'

const FUNDO_TOM: Record<TomLinha, string> = {
  feito: '',
  proxima: 'bg-brasa-300/25',
  normal: '',
  cancelada: 'bg-brasa-300/15',
  reposicao: 'bg-azul-300/20',
}
const COR_TEXTO: Record<TomLinha, string> = {
  feito: 'text-gr-t',
  proxima: 'text-or-t',
  normal: 'text-ink2',
  cancelada: 'text-or-t',
  reposicao: 'text-bl-t',
}
const COR_DATA: Record<TomLinha, string> = {
  feito: '',
  proxima: 'text-or-t',
  normal: '',
  cancelada: 'text-ink3',
  reposicao: 'text-bl-t',
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function CronogramaPage() {
  const { api } = useAuth()
  const toast = useToast()
  const [base, setBase] = useState<{ turmas: Turma[]; passos: PassoTrilha[]; eventos: AgendaEvent[]; feriados: Feriado[] } | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ nivel: NivelTrilha | ''; inicio: string }>({ nivel: '', inicio: '' })
  const [desfazendo, setDesfazendo] = useState<Feriado | null>(null)

  const carregar = useCallback(async () => {
    const [turmas, passos, eventos, feriados] = await Promise.all([
      api.listTurmas(), api.listPassosTrilha(), api.listEvents(), api.listFeriados(),
    ])
    setBase({ turmas, passos, eventos, feriados })
    setEscolhida((atual) => atual ?? turmas[0]?.nome ?? null)
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const turma = base?.turmas.find((t) => t.nome === escolhida) ?? null
  useEffect(() => {
    if (turma) setEdicao({ nivel: turma.nivel ?? '', inicio: turma.trilha_inicio ?? '' })
  }, [turma])

  if (!base) return null
  const linhas = turma ? cronogramaDeTurma(turma, base.passos, base.eventos, base.feriados) : []
  const hoje = diaDaNoite(new Date())
  // A próxima aula que ainda vai acontecer (a de hoje já abriu o vídeo)
  const proxima = linhas.find((l) => l.passo && l.aula.tipo !== 'cancelada' && l.aula.data > hoje)
  const aulasNaAgenda = base.eventos.filter((e) => e.turma === escolhida && e.dia_semana !== null && !e.data)

  // A linha cancelada vem de um feriado da Agenda (da turma ou de todas)
  const feriadoDaLinha = (data: string) =>
    base.feriados.find((f) => f.data === data && (f.turma === null || f.turma === escolhida)) ?? null

  const desfazerCancelamento = async () => {
    if (!desfazendo) return
    try {
      // A reposição da aula (se houve) sai junto com o cancelamento
      await api.deleteFeriado(desfazendo.id)
      await carregar()
      toast(`${desfazendo.turma ? `Aula de ${desfazendo.turma}` : 'O dia'} volta a valer`)
      setDesfazendo(null)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const salvar = async () => {
    if (!turma) return
    try {
      await api.definirTrilhaDaTurma(turma.nome, edicao.nivel || null, edicao.inicio || null)
      await carregar()
      toast('Turma salva')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <Tela>
      <Cabecalho titulo="Cronograma" sobretitulo="Vídeo-aulas" fallback="/organizador/videoaulas" />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
        <p className="px-1 text-sm text-ink2">Cada turma anda no seu ritmo. A trilha do nível é a mesma, só as datas mudam.</p>
        <div className="flex flex-wrap gap-2">
          {base.turmas.map((t) => (
            <ChipEscolha key={t.id} ativo={t.nome === escolhida} onClick={() => setEscolhida(t.nome)}>
              {t.nome}
            </ChipEscolha>
          ))}
        </div>
        {turma && (
          <div className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <Campo rotulo="Nível da trilha">
                <select
                  className="input"
                  value={edicao.nivel}
                  onChange={(e) => setEdicao({ ...edicao, nivel: e.target.value as NivelTrilha | '' })}
                >
                  <option value="">Fora da trilha</option>
                  {NIVEIS.map((n) => (
                    <option key={n} value={n}>
                      {NOME_NIVEL[n]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Primeira aula">
                <input
                  type="date"
                  className="input"
                  value={edicao.inicio}
                  onChange={(e) => setEdicao({ ...edicao, inicio: e.target.value })}
                />
              </Campo>
            </div>
            <BotaoAcao cor="preto" tamanho="m" sombra={false} onClick={() => void salvar()}>
              Salvar turma
            </BotaoAcao>
            <div className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2.5 text-sm">
              <span>
                <b>Aula na agenda: </b>
                {aulasNaAgenda.length
                  ? aulasNaAgenda.map((e) => `${DIAS[e.dia_semana!]} ${e.hora ?? ''}`.trim()).join(' · ')
                  : 'nenhuma aula semanal'}
              </span>
              <Link to="/organizador/agenda" className="font-extrabold text-or-t">
                Abrir agenda
              </Link>
            </div>
          </div>
        )}
        {turma && linhas.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            Defina o nível e a primeira aula, e confira se a turma tem a aula semanal na Agenda.
          </p>
        )}
        {linhas.length > 0 && (
        <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
          {linhas.map((l, i) => {
            const { texto, tom } = linhaCronograma(l, hoje, l === proxima)
            const dia = new Date(`${l.aula.data}T12:00:00`)
            return (
              <div
                key={`${l.aula.data}-${l.aula.tipo}`}
                className={`flex items-center gap-3 py-2.5 pr-3 pl-3.5 ${i > 0 ? 'border-t border-linha' : ''} ${FUNDO_TOM[tom]}`}
              >
                <span className="flex w-[46px] shrink-0 flex-col items-center leading-none">
                  <span className={`text-[19px] font-extrabold ${COR_DATA[tom]}`}>{String(dia.getDate()).padStart(2, '0')}</span>
                  <span className="text-[11px] font-bold uppercase text-ink3">
                    {dia.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className={`text-[15px] leading-tight ${l.passo ? '' : 'text-ink3'}`}>
                    {l.passo?.nome ?? (l.aula.tipo === 'cancelada' ? 'Aula cancelada na agenda' : 'Sem passo')}
                  </b>
                  <span className={`text-xs font-bold ${COR_TEXTO[tom]}`}>{texto}</span>
                </span>
                {l.aula.tipo === 'cancelada' && feriadoDaLinha(l.aula.data) && (
                  <button
                    type="button"
                    onClick={() => setDesfazendo(feriadoDaLinha(l.aula.data))}
                    className="h-9 shrink-0 rounded-xl border-[1.5px] border-linha bg-chip px-3 text-[13px] font-extrabold text-ink"
                  >
                    Desfazer
                  </button>
                )}
              </div>
            )
          })}
        </div>
        )}
        <p className="px-1 text-[13px] leading-snug text-ink2">
          Para mudar uma data, cancele a aula na <b className="text-ink">Agenda</b>. Sem reposição, os passos seguintes andam uma semana. Com reposição, o passo vai para o dia marcado e nada mais muda.
        </p>
      </div>
      <Confirmar
        aberto={desfazendo !== null}
        titulo="Desfazer o cancelamento?"
        texto={
          desfazendo?.turma
            ? `A aula de ${desfazendo.turma} em ${formatDate(desfazendo.data)} volta a valer e a trilha volta uma semana.`
            : `O dia ${desfazendo ? formatDate(desfazendo.data) : ''} volta a valer para todas as turmas${desfazendo?.suspende_desafios ? ', e os desafios contam de novo nesse dia' : ''}.`
        }
        ok="Desfazer"
        onOk={() => void desfazerCancelamento()}
        onVoltar={() => setDesfazendo(null)}
      />
    </Tela>
  )
}
