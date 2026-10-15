import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotaoAcao, Cabecalho, ChipEscolha, Tela } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatDate } from '../../lib/dates'
import { cronogramaDeTurma, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { AgendaEvent, Feriado, NivelTrilha, PassoTrilha, Turma } from '../../lib/types'
import { Campo } from './contexto'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function CronogramaPage() {
  const { api } = useAuth()
  const toast = useToast()
  const [base, setBase] = useState<{ turmas: Turma[]; passos: PassoTrilha[]; eventos: AgendaEvent[]; feriados: Feriado[] } | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ nivel: NivelTrilha | ''; inicio: string }>({ nivel: '', inicio: '' })

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
  const aulasNaAgenda = base.eventos.filter((e) => e.turma === escolhida && e.dia_semana !== null && !e.data)

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
          {linhas.map((l, i) => (
            <div
              key={`${l.aula.data}-${l.aula.tipo}`}
              className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-t border-linha' : ''} ${
                l.aula.tipo === 'cancelada' ? 'bg-brasa-300/20' : l.aula.tipo === 'reposicao' ? 'bg-azul-300/20' : ''
              }`}
            >
              <span className="w-[72px] shrink-0 text-sm font-extrabold">{formatDate(l.aula.data)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className={`text-[15px] ${l.passo ? '' : 'text-ink3'}`}>
                  {l.passo?.nome ?? (l.aula.tipo === 'cancelada' ? 'Aula cancelada na agenda' : 'Sem passo')}
                </b>
                <span className="text-xs text-ink2">
                  {l.aula.tipo === 'cancelada'
                    ? l.aula.reposicaoEm
                      ? `Reposta em ${formatDate(l.aula.reposicaoEm)} · trilha não atrasa`
                      : `${l.aula.motivo ?? 'Cancelada'} · trilha andou uma semana`
                    : l.aula.tipo === 'reposicao'
                      ? 'Reposição'
                      : 'Aula'}
                </span>
              </span>
            </div>
          ))}
        </div>
        )}
        <p className="px-1 text-[13px] leading-snug text-ink2">
          Para mudar uma data, cancele a aula na <b className="text-ink">Agenda</b>. Sem reposição, os passos seguintes andam uma semana. Com reposição, o passo vai para o dia marcado e nada mais muda.
        </p>
      </div>
    </Tela>
  )
}
