import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Icone } from '../../components/Icone'
import { Spinner } from '../../components/Spinner'
import {
  BotaoAcao,
  Cabecalho,
  CampoBusca,
  ChipEscolha,
  Confirmar,
  Folha,
  RotuloSecao,
  Segmentado,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { combinaBusca } from '../../lib/busca'
import { ordenarTurmas } from '../../lib/forrodex'
import { ateAPosicao } from '../../lib/ranking'
import {
  defModalidade,
  turmaLabel,
  type DistintivoDef,
  type DistintivoRecebedor,
  type Modalidade,
} from '../../lib/types'
import { Campo, Dica, usePainel } from './contexto'
import { useLembrado } from '../../lib/memoriaTelas'

/**
 * Catálogo dos distintivos personalizados. Os de presença, rodízio, DJ,
 * cargo e turma são automáticos; aqui ficam os que a organização cria e
 * entrega à mão — por qualquer motivo, não só vencer um desafio.
 */
export function DistintivosPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [lista, setLista] = useLembrado<DistintivoDef[] | null>('painel:distintivos', null)
  const [busca, setBusca] = useState('')
  const [entregando, setEntregando] = useState<DistintivoDef | null>(null)
  const [apagando, setApagando] = useState<DistintivoDef | null>(null)

  const carregar = useCallback(async () => {
    setLista(await api.listDistintivos())
  }, [api])
  useEffect(() => {
    void carregar().catch((e) => toast((e as Error).message, 'erro'))
  }, [carregar, toast])

  const apagar = async () => {
    if (!apagando) return
    try {
      await api.deleteDistintivo(apagando.id)
      setApagando(null)
      await carregar()
      toast('Distintivo apagado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const filtrados = (lista ?? []).filter((d) => combinaBusca(busca, [d.titulo, d.descricao]))

  return (
    <div className="anima-tela">
      <Cabecalho
        titulo="Distintivos"
        sobretitulo="Painel"
        fallback="/organizador"
        acao={
          <button
            type="button"
            onClick={() => navigate('/organizador/distintivos/novo')}
            className="h-11 shrink-0 rounded-[14px] border-2 border-preto bg-verde-300 px-3.5 text-sm font-extrabold text-preto"
          >
            + Novo
          </button>
        }
      />
      <div className="flex flex-col gap-2.5 px-4 pt-3.5">
        <Dica>
          Os de presença, rodízio, DJ, cargo e turma são automáticos. Aqui ficam os
          personalizados.
        </Dica>
        {lista && lista.length > 5 && (
          <CampoBusca
            placeholder="Buscar distintivo"
            aria-label="Buscar distintivo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        )}
        {lista === null ? (
          <Spinner />
        ) : lista.length === 0 ? (
          <Dica>Nenhum distintivo criado ainda.</Dica>
        ) : (
          filtrados.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-[18px] border border-linha bg-sf py-3 pl-3 pr-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-chip text-[26px]">
                {d.emoji}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-extrabold">{d.titulo}</span>
                <span className="line-clamp-2 text-[13px] text-ink3">
                  {d.descricao ? `${d.descricao} · ` : ''}
                  {d.concedidos === 0
                    ? 'ninguém recebeu'
                    : `${d.concedidos} ${d.concedidos === 1 ? 'pessoa' : 'pessoas'}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEntregando(d)}
                className="h-11 shrink-0 rounded-[14px] border-2 border-preto bg-verde-500 px-3 text-sm font-extrabold text-preto"
              >
                Entregar
              </button>
              <button
                type="button"
                onClick={() => setApagando(d)}
                aria-label={`Apagar ${d.titulo}`}
                className="flex h-11 w-10 shrink-0 items-center justify-center text-ink3"
              >
                <Icone nome="lixo" tamanho={20} />
              </button>
            </div>
          ))
        )}
      </div>

      {entregando && (
        <FolhaEntrega distintivo={entregando} onFechar={() => setEntregando(null)} onMudou={() => void carregar()} />
      )}
      <Confirmar
        aberto={apagando !== null}
        titulo={`Apagar “${apagando?.titulo ?? ''}”?`}
        texto="Ele sai do catálogo e do perfil de todo mundo que recebeu."
        ok="Apagar"
        onOk={() => void apagar()}
        onVoltar={() => setApagando(null)}
      />
    </div>
  )
}

/** Entregar para uma pessoa, uma turma inteira ou o topo de um desafio. */
function FolhaEntrega({
  distintivo,
  onFechar,
  onMudou,
}: {
  distintivo: DistintivoDef
  onFechar: () => void
  onMudou: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const { perfis, turmas, desafios } = usePainel()
  const [modo, setModo] = useState<'pessoa' | 'turma' | 'top'>('pessoa')
  const [recebedores, setRecebedores] = useLembrado<DistintivoRecebedor[] | null>(
    `painel:distintivo:${distintivo.id}`,
    null,
  )
  const [busca, setBusca] = useState('')
  const [turma, setTurma] = useState<string | null>(null)
  const [desafioId, setDesafioId] = useState<string | null>(null)
  const [modalidade, setModalidade] = useState<Modalidade>('checkin')
  const [topN, setTopN] = useState(3)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    setRecebedores(await api.listRecebedores(distintivo.id))
  }, [api, distintivo.id])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const jaTem = (id: string) => recebedores?.some((r) => r.user_id === id) ?? false

  const entregar = async (ids: string[], msg: string) => {
    setOcupado(true)
    try {
      await api.concederDistintivo(distintivo.id, ids)
      await carregar()
      onMudou()
      toast(msg)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const revogar = async (id: string) => {
    try {
      await api.revogarDistintivo(distintivo.id, id)
      await carregar()
      onMudou()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  // Turma inteira (ex.: quem se formou no semestre), sem repetir quem já tem
  const daTurma = turma ? perfis.filter((p) => p.turmas.some((t) => t.turma === turma)) : []
  const novosDaTurma = daTurma.filter((p) => !jaTem(p.id))

  const desafio = desafios.find((d) => d.id === desafioId)
  const entregarTop = async () => {
    if (!desafio) return
    // Desafio de uma disputa só ignora o seletor (que nem aparece)
    const mod = desafio.modalidades.includes(modalidade) ? modalidade : desafio.modalidades[0]
    setOcupado(true)
    try {
      // Respeita empate: cortar no índice escolheria um dos empatados
      // por ordem alfabética, o que seria arbitrário.
      const premiados = ateAPosicao(await api.getRanking(desafio, mod), topN)
      if (premiados.length === 0) {
        toast('Esse desafio ainda não tem ninguém no ranking', 'erro')
        return
      }
      await api.concederDistintivo(distintivo.id, premiados.map((r) => r.user_id))
      await carregar()
      onMudou()
      const onde = desafio.modalidades.length > 1 ? `${desafio.titulo} · ${defModalidade(mod).nome}` : desafio.titulo
      toast(
        premiados.length > topN
          ? `Entregue para ${premiados.length} pessoas — o Top ${topN} de "${onde}" tem empate`
          : `Entregue para o Top ${premiados.length} de "${onde}"!`,
      )
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const pessoas = perfis
    .filter((p) => !jaTem(p.id) && combinaBusca(busca, [p.nome, p.telefone, ...p.turmas.map((t) => t.turma)]))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 40)

  return (
    <Folha
      aberta
      alta
      onFechar={onFechar}
      titulo={
        <span className="flex items-center gap-2.5">
          <span className="text-[26px]">{distintivo.emoji}</span>
          Entregar “{distintivo.titulo}”
        </span>
      }
    >
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-sf px-4 pb-2">
        <Segmentado
          valor={modo}
          onChange={setModo}
          opcoes={[
            { valor: 'pessoa', rotulo: 'Pessoa' },
            { valor: 'turma', rotulo: 'Turma' },
            { valor: 'top', rotulo: 'Top N' },
          ]}
        />
        {modo === 'pessoa' && (
          <CampoBusca
            placeholder="Buscar pessoa"
            aria-label="Buscar pessoa"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        )}
      </div>

      {modo === 'pessoa' && (
        <div className="px-3 pb-6">
          {pessoas.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={ocupado}
              onClick={() => void entregar([p.id], `${p.nome.split(' ')[0]} recebeu o distintivo!`)}
              className="flex min-h-[58px] w-full items-center gap-3 border-b border-linha p-2 text-left text-ink disabled:opacity-50"
            >
              <Avatar nome={p.nome} url={p.avatar_url} tamanho={42} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-extrabold">{p.nome}</span>
                <span className="truncate text-[13px] text-ink3">{turmaLabel(p.turmas) ?? 'Sem turma'}</span>
              </span>
              <span className="text-sm font-extrabold text-gr-t">Entregar</span>
            </button>
          ))}
          {recebedores && recebedores.length > 0 && (
            <div className="flex flex-col gap-1 px-2 pt-5">
              <RotuloSecao className="px-0">Já receberam · {recebedores.length}</RotuloSecao>
              {recebedores.map((r) => (
                <div key={r.user_id} className="flex items-center justify-between border-b border-linha py-2.5 text-[15px]">
                  <span className="truncate font-bold">{r.nome}</span>
                  <button
                    type="button"
                    onClick={() => void revogar(r.user_id)}
                    className="shrink-0 text-sm font-extrabold text-or-t"
                  >
                    Revogar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modo === 'turma' && (
        <div className="flex flex-col gap-3 px-5 pb-8 pt-1">
          <div className="flex flex-wrap gap-2">
            {ordenarTurmas(turmas.map((t) => t.nome)).map((t) => (
              <ChipEscolha key={t} ativo={turma === t} onClick={() => setTurma(t)}>
                {t}
              </ChipEscolha>
            ))}
          </div>
          {turma && (
            <Dica>
              {daTurma.length === 0
                ? 'Nenhum aluno com conta nessa turma ainda.'
                : novosDaTurma.length === 0
                  ? 'Todo mundo dessa turma já recebeu.'
                  : `${novosDaTurma.length} de ${daTurma.length} vão receber${
                      daTurma.length !== novosDaTurma.length ? ` (${daTurma.length - novosDaTurma.length} já tinham)` : ''
                    }.`}
            </Dica>
          )}
          <BotaoAcao
            cor="verde"
            tamanho="g"
            sombra={false}
            bloco
            disabled={!turma || novosDaTurma.length === 0 || ocupado}
            onClick={() =>
              void entregar(
                novosDaTurma.map((p) => p.id),
                `Turma ${turma}: ${novosDaTurma.length} ${novosDaTurma.length === 1 ? 'pessoa recebeu' : 'pessoas receberam'}!`,
              )
            }
          >
            {turma ? `Entregar para ${novosDaTurma.length} de ${turma}` : 'Escolha a turma'}
          </BotaoAcao>
        </div>
      )}

      {modo === 'top' && (
        <div className="flex flex-col gap-3 px-5 pb-8 pt-1">
          <Campo rotulo="Desafio">
            <div className="flex flex-wrap gap-2">
              {desafios.map((d) => (
                <ChipEscolha key={d.id} ativo={desafioId === d.id} onClick={() => setDesafioId(d.id)}>
                  {d.titulo}
                </ChipEscolha>
              ))}
            </div>
          </Campo>
          {/* Com mais de uma disputa, "top 3" seria ambíguo */}
          {desafio && desafio.modalidades.length > 1 && (
            <Segmentado
              valor={desafio.modalidades.includes(modalidade) ? modalidade : desafio.modalidades[0]}
              onChange={setModalidade}
              opcoes={desafio.modalidades.map((m) => ({ valor: m, rotulo: defModalidade(m).nome }))}
            />
          )}
          <Campo rotulo="Quantas pessoas do topo">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                aria-label="Menos"
                onClick={() => setTopN((n) => Math.max(1, n - 1))}
                className="h-[52px] w-[52px] rounded-2xl border-[1.5px] border-linha bg-sf text-2xl font-extrabold text-ink"
              >
                −
              </button>
              <span className="min-w-10 text-center text-[28px] font-extrabold">{topN}</span>
              <button
                type="button"
                aria-label="Mais"
                onClick={() => setTopN((n) => n + 1)}
                className="h-[52px] w-[52px] rounded-2xl border-[1.5px] border-linha bg-sf text-2xl font-extrabold text-ink"
              >
                +
              </button>
              <span className="text-sm text-ink3">empate entra junto</span>
            </div>
          </Campo>
          <BotaoAcao cor="verde" tamanho="g" sombra={false} bloco disabled={!desafio || ocupado} onClick={() => void entregarTop()}>
            Entregar para o Top {topN}
          </BotaoAcao>
        </div>
      )}
    </Folha>
  )
}

const EMOJIS = ['🌙', '🫶', '🏆', '⭐', '🔥', '💃', '🕺', '🪗', '🎉', '👑', '🌻', '🎯']

export function NovoDistintivoPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [emoji, setEmoji] = useState('🌙')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const criar = async () => {
    setSalvando(true)
    try {
      await api.saveDistintivo({ emoji, titulo: titulo.trim(), descricao: descricao.trim() })
      toast('Distintivo criado!')
      navigate('/organizador/distintivos', { replace: true })
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Novo distintivo" sobretitulo="Distintivos" fallback="/organizador/distintivos" />
      <div className="flex flex-col gap-4 px-4 pt-3.5">
        <div className="flex flex-col items-center gap-2 self-center py-2">
          <span className="flex h-[84px] w-[84px] items-center justify-center rounded-3xl bg-chip text-[46px]">
            {emoji}
          </span>
          <span className="text-[17px] font-extrabold">{titulo.trim() || 'Título do distintivo'}</span>
        </div>
        <Campo rotulo="Emoji" dica="Ou digite outro no campo ao lado.">
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                className="aspect-square rounded-[14px] border-2 bg-sf text-2xl"
                style={{ borderColor: emoji === e ? '#DE5300' : 'var(--line)' }}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            className="input w-24 text-center text-xl"
            aria-label="Outro emoji"
            maxLength={4}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Título">
          <input className="input" placeholder="Ex.: Última a sair" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <Campo rotulo="Descrição">
          <input
            className="input"
            placeholder="Ex.: Ficou até o salão fechar"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>
        <div className="h-1" />
        <BotaoAcao tamanho="g" bloco disabled={salvando || titulo.trim().length < 2 || !emoji} onClick={() => void criar()}>
          {salvando ? 'Criando…' : 'Criar distintivo'}
        </BotaoAcao>
      </div>
    </div>
  )
}
