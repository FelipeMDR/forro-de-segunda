import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotaoAcao, Cabecalho, ChipEscolha, Confirmar, Etiqueta, Folha, Tela } from '../../components/ui'
import { Icone } from '../../components/Icone'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { diaDaNoite, formatDate } from '../../lib/dates'
import { linhaCronograma, type TomLinha } from '../../lib/textosTrilha'
import { cronogramaDeTurma, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { AgendaEvent, AulaSemVideo, AulaSemVideoInput, Feriado, NivelTrilha, PassoTrilha, Turma } from '../../lib/types'
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
  const [base, setBase] = useState<{
    turmas: Turma[]
    passos: PassoTrilha[]
    eventos: AgendaEvent[]
    feriados: Feriado[]
    semVideo: AulaSemVideo[]
  } | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ nivel: NivelTrilha | ''; inicio: string }>({ nivel: '', inicio: '' })
  const [desfazendo, setDesfazendo] = useState<Feriado | null>(null)
  // Aula sem vídeo sendo criada (sem id) ou editada
  const [aulaSemVideo, setAulaSemVideo] = useState<AulaSemVideoInput | null>(null)

  const carregar = useCallback(async () => {
    const [turmas, passos, eventos, feriados, semVideo] = await Promise.all([
      api.listTurmas(), api.listPassosTrilha(), api.listEvents(), api.listFeriados(), api.listAulasSemVideo(),
    ])
    setBase({ turmas, passos, eventos, feriados, semVideo })
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
  const linhas = turma ? cronogramaDeTurma(turma, base.passos, base.eventos, base.feriados, base.semVideo) : []
  const hoje = diaDaNoite(new Date())
  // A próxima aula que ainda vai acontecer (a de hoje já abriu o vídeo)
  const proxima = linhas.find((l) => (l.passo || l.semVideo) && l.aula.tipo !== 'cancelada' && l.aula.data > hoje)
  const dadas = linhas.filter((l) => l.aula.tipo !== 'cancelada')

  // Nova aula sem vídeo: por padrão no nível da turma, no lugar da próxima aula
  const novaAulaSemVideo = () => {
    const posicao = proxima ? dadas.indexOf(proxima) + 1 : dadas.length + 1
    setAulaSemVideo({ nivel: turma?.nivel ?? 'iniciante', ordem: Math.max(1, posicao), nome: '', descricao: null })
  }

  const salvarAulaSemVideo = async () => {
    if (!aulaSemVideo) return
    if (!aulaSemVideo.nome.trim()) {
      toast('Dê um nome para a aula', 'erro')
      return
    }
    try {
      await api.salvarAulaSemVideo(aulaSemVideo)
      await carregar()
      toast(aulaSemVideo.id ? 'Aula salva' : 'Aula sem vídeo adicionada')
      setAulaSemVideo(null)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const removerAulaSemVideo = async () => {
    if (!aulaSemVideo?.id) return
    try {
      await api.removerAulaSemVideo(aulaSemVideo.id)
      await carregar()
      toast('Aula tirada · os passos voltam uma semana')
      setAulaSemVideo(null)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }
  const aulasNaAgenda = base.eventos.filter((e) => e.turma === escolhida && e.dia_semana !== null && !e.data)

  // A linha cancelada vem de um feriado da Agenda (da turma ou de todas)
  const feriadoDaLinha = (data: string) =>
    base.feriados.find((f) => f.cancela_aulas && f.data === data && (f.turma === null || f.turma === escolhida)) ?? null

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
      <Cabecalho titulo="Cronograma" sobretitulo="Agenda" fallback="/organizador/agenda" />
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
            <div className="flex flex-col gap-3">
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
            <div className="flex items-center justify-between gap-3 rounded-xl bg-fundo px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <b>Aula na agenda: </b>
                {aulasNaAgenda.length
                  ? aulasNaAgenda.map((e) => `${DIAS[e.dia_semana!]} ${e.hora ?? ''}`.trim()).join(' · ')
                  : 'nenhuma aula semanal'}
              </span>
              <Link to="/organizador/agenda/aulas" className="shrink-0 font-extrabold text-or-t">
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
        {turma?.nivel && (
          <BotaoAcao cor="claro" tamanho="m" sombra={false} onClick={novaAulaSemVideo} className="border-[1.5px] border-preto">
            <Icone nome="mais" className="h-5 w-5" />
            Aula sem vídeo
          </BotaoAcao>
        )}
        {linhas.length > 0 && (
        <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
          {linhas.map((l, i) => {
            const { texto, tom } = linhaCronograma(l, hoje, l === proxima)
            const dia = new Date(`${l.aula.data}T12:00:00`)
            const sv = l.semVideo
            return (
              <div
                key={`${l.aula.data}-${l.aula.tipo}`}
                role={sv ? 'button' : undefined}
                tabIndex={sv ? 0 : undefined}
                onClick={sv ? () => setAulaSemVideo(sv) : undefined}
                onKeyDown={sv ? (e) => e.key === 'Enter' && setAulaSemVideo(sv) : undefined}
                className={`flex items-center gap-3 py-2.5 pr-3 pl-3.5 ${i > 0 ? 'border-t border-linha' : ''} ${FUNDO_TOM[tom]} ${sv ? 'cursor-pointer' : ''}`}
              >
                <span className="flex w-[46px] shrink-0 flex-col items-center leading-none">
                  <span className={`text-[19px] font-extrabold ${COR_DATA[tom]}`}>{String(dia.getDate()).padStart(2, '0')}</span>
                  <span className="text-[11px] font-bold uppercase text-ink3">
                    {dia.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className={`text-[15px] leading-tight ${l.passo || sv ? '' : 'text-ink3'}`}>
                    {l.passo?.nome ?? sv?.nome ?? (l.aula.tipo === 'cancelada' ? 'Aula cancelada na agenda' : 'Sem passo')}
                  </b>
                  <span className={`text-xs font-bold ${COR_TEXTO[tom]}`}>{texto}</span>
                </span>
                {sv && (
                  <Etiqueta cor="chip" className="shrink-0">
                    Sem vídeo
                  </Etiqueta>
                )}
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
        <p className="px-1 text-[13px] leading-snug text-ink2">
          A <b className="text-ink">aula sem vídeo</b> vale para todas as turmas do nível e empurra os passos seguintes uma semana. Ela aparece na agenda do aluno, mas não na trilha de vídeos.
        </p>
      </div>
      <Folha
        aberta={aulaSemVideo !== null}
        onFechar={() => setAulaSemVideo(null)}
        titulo={aulaSemVideo?.id ? 'Aula sem vídeo' : 'Nova aula sem vídeo'}
      >
        {aulaSemVideo && (
          <div className="flex flex-col gap-3 px-5 pb-8">
            <Campo rotulo="Nome da aula">
              <input
                className="input"
                placeholder="Ex.: Musicalidade"
                value={aulaSemVideo.nome}
                onChange={(e) => setAulaSemVideo({ ...aulaSemVideo, nome: e.target.value })}
              />
            </Campo>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo rotulo="Nível">
                <select
                  className="input"
                  value={aulaSemVideo.nivel}
                  onChange={(e) => setAulaSemVideo({ ...aulaSemVideo, nivel: e.target.value as NivelTrilha })}
                >
                  {NIVEIS.map((n) => (
                    <option key={n} value={n}>
                      {NOME_NIVEL[n]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Aula nº na trilha">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={aulaSemVideo.ordem}
                  onChange={(e) => setAulaSemVideo({ ...aulaSemVideo, ordem: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Campo>
            </div>
            <Campo rotulo="O que vai ser ensinado (opcional)">
              <textarea
                className="input min-h-[80px] py-2.5"
                placeholder="Ex.: Como ouvir o tempo forte da música"
                value={aulaSemVideo.descricao ?? ''}
                onChange={(e) => setAulaSemVideo({ ...aulaSemVideo, descricao: e.target.value })}
              />
            </Campo>
            <p className="text-[13px] leading-snug text-ink2">
              Vale para todas as turmas do {NOME_NIVEL[aulaSemVideo.nivel]}: vira a aula nº {aulaSemVideo.ordem}, e os passos dali para frente andam uma semana.
            </p>
            <BotaoAcao cor="preto" tamanho="m" sombra={false} onClick={() => void salvarAulaSemVideo()}>
              {aulaSemVideo.id ? 'Salvar aula' : 'Adicionar ao cronograma'}
            </BotaoAcao>
            {aulaSemVideo.id && (
              <button
                type="button"
                onClick={() => void removerAulaSemVideo()}
                className="h-11 rounded-xl text-[15px] font-extrabold text-or-t"
              >
                Tirar do cronograma
              </button>
            )}
          </div>
        )}
      </Folha>
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
