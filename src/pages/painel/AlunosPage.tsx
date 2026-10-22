import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Icone } from '../../components/Icone'
import {
  BotaoAcao,
  BotaoSuave,
  Cabecalho,
  CampoBusca,
  ChipEscolha,
  Confirmar,
  LinhaPessoa,
  Segmentado,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { combinaBusca } from '../../lib/busca'
import { CARGO_DJ } from '../../lib/dj'
import { ordenarTurmas } from '../../lib/forrodex'
import { ehEmailSintetico, telefoneValido } from '../../lib/phone'
import { NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import { ehEquipeDoProjeto, turmaLabel, type NivelTrilha, type PapelDanca, type Profile } from '../../lib/types'
import { Campo, Dica, usePainel } from './contexto'

/** Turmas marcadas e o papel em cada uma (null = sem papel definido). */
type MapaTurmas = Record<string, PapelDanca | null>

/**
 * Uma turma por cartão: marcar a turma abre o seletor de papel logo
 * embaixo. Papel é por turma porque é comum conduzir numa e ser
 * conduzido em outra.
 */
function SeletorTurmas({
  turmas,
  valor,
  onChange,
}: {
  turmas: string[]
  valor: MapaTurmas
  onChange: (v: MapaTurmas) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {turmas.map((t) => {
        const on = t in valor
        return (
          <div
            key={t}
            className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] bg-sf px-3 py-2.5"
            style={{ borderColor: on ? '#DE5300' : 'var(--line)' }}
          >
            <button
              type="button"
              aria-pressed={on}
              onClick={() => {
                const n = { ...valor }
                if (on) delete n[t]
                else n[t] = null
                onChange(n)
              }}
              className="flex items-center justify-between py-1 text-base font-extrabold text-ink"
            >
              {t}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 border-preto text-preto ${
                  on ? 'bg-brasa-500' : 'bg-transparent'
                }`}
              >
                {on && <Icone nome="check" tamanho={16} traco={3.2} />}
              </span>
            </button>
            {on && (
              <Segmentado
                valor={(valor[t] ?? 'nenhum') as PapelDanca | 'nenhum'}
                onChange={(p) => onChange({ ...valor, [t]: p === 'nenhum' ? null : p })}
                opcoes={[
                  { valor: 'Condutor(a)', rotulo: 'Condutor(a)' },
                  { valor: 'Conduzido(a)', rotulo: 'Conduzido(a)' },
                ]}
                className="[&_button]:h-[38px] [&_button]:text-sm"
              />
            )}
          </div>
        )
      })}
      {turmas.length === 0 && <Dica>Nenhuma turma criada ainda. Crie em Turmas do semestre.</Dica>}
    </div>
  )
}

/** Busca e lista de quem tem conta no app. */
export function AlunosPage() {
  const navigate = useNavigate()
  const { api } = useAuth()
  const { perfis, turmas, alunos } = usePainel()
  const [acessos, setAcessos] = useState<Record<string, NivelTrilha>>({})
  const [busca, setBusca] = useState('')
  const [turma, setTurma] = useState<string | null>(null)
  const nomesTurmas = ordenarTurmas(turmas.map((t) => t.nome))

  const lista = useMemo(
    () =>
      perfis
        .filter((p) => !turma || p.turmas.some((t) => t.turma === turma))
        .filter((p) =>
          combinaBusca(busca, [
            p.nome,
            p.telefone,
            ...p.cargos,
            ...p.turmas.map((t) => t.turma),
            ...p.turmas_ensino,
          ]),
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [perfis, busca, turma],
  )
  const naChamada = alunos?.length ?? 0

  useEffect(() => {
    api.listAcessosTrilha().then(setAcessos).catch(() => {})
  }, [api])

  const subtitulo = (p: Profile) => {
    if (p.turmas.length === 0 && p.turmas_ensino.length === 0 && acessos[p.id]) {
      return [p.cargos[0], `Sem turma · vídeos até ${NOME_NIVEL[acessos[p.id]]}`].filter(Boolean).join(' · ')
    }
    return [p.cargos[0], turmaLabel(p.turmas)].filter(Boolean).join(' · ') || 'Sem turma'
  }

  return (
    <div className="anima-tela">
      <Cabecalho
        titulo="Alunos"
        sobretitulo="Pessoas"
        fallback="/organizador/pessoas"
        acao={
          <button
            type="button"
            onClick={() => navigate('/organizador/alunos/novo')}
            className="h-11 shrink-0 rounded-[14px] border-2 border-preto bg-brasa-300 px-3.5 text-sm font-extrabold text-preto"
          >
            + Novo aluno
          </button>
        }
      />
      <div className="px-4 pb-1.5 pt-3">
        <CampoBusca
          placeholder="Nome, turma ou cargo"
          aria-label="Buscar alunos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {nomesTurmas.length > 0 && (
        <div className="sem-barra flex gap-2 overflow-x-auto px-4 py-2">
          <ChipEscolha ativo={turma === null} cor="preto" onClick={() => setTurma(null)} className="h-[38px]">
            Todas
          </ChipEscolha>
          {nomesTurmas.map((t) => (
            <ChipEscolha key={t} ativo={turma === t} cor="preto" onClick={() => setTurma(t)} className="h-[38px]">
              {t}
            </ChipEscolha>
          ))}
        </div>
      )}
      <div className="px-5 pb-1 text-[13px] font-extrabold text-ink3">
        {lista.length} {lista.length === 1 ? 'pessoa no app' : 'pessoas no app'}
        {naChamada > 0 && (
          <button
            type="button"
            className="ml-1 font-extrabold text-bl-t"
            onClick={() => navigate('/organizador/importar')}
          >
            · lista de chamada
          </button>
        )}
      </div>
      <div className="px-3">
        {lista.map((p) => (
          <LinhaPessoa
            key={p.id}
            onClick={() => navigate(`/organizador/alunos/${p.id}`)}
            avatar={<Avatar nome={p.nome} url={p.avatar_url} tamanho={42} />}
            nome={p.nome}
            sub={subtitulo(p)}
          />
        ))}
        {lista.length === 0 && (
          <p className="px-2 py-8 text-center text-[15px] text-ink3">Ninguém encontrado.</p>
        )}
      </div>
    </div>
  )
}

/** Editar as turmas, o papel, os cargos e onde a pessoa dá aula. */
export function AlunoPage() {
  const { id } = useParams<{ id: string }>()
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { perfis, turmas, cargos, recarregar } = usePainel()
  const perfil: Profile | undefined = perfis.find((p) => p.id === id)
  const nomesTurmas = ordenarTurmas(turmas.map((t) => t.nome))

  const [mapa, setMapa] = useState<MapaTurmas>({})
  const [cargosSel, setCargosSel] = useState<Set<string>>(new Set())
  const [ensino, setEnsino] = useState<Set<string>>(new Set())
  // Até que nível vão os vídeos se ficar sem turma (migração 040)
  const [acessoSalvo, setAcessoSalvo] = useState<NivelTrilha>('iniciante')
  const [acesso, setAcesso] = useState<NivelTrilha>('iniciante')
  const [salvando, setSalvando] = useState(false)
  const [confirmarRemocao, setConfirmarRemocao] = useState(false)

  // Rascunho = o que está no perfil, até salvar
  useEffect(() => {
    if (!perfil) return
    setMapa(Object.fromEntries(perfil.turmas.map((t) => [t.turma, t.papel_danca])))
    setCargosSel(new Set(perfil.cargos))
    setEnsino(new Set(perfil.turmas_ensino))
  }, [perfil])

  useEffect(() => {
    if (!id) return
    api
      .listAcessosTrilha()
      .then((todos) => {
        setAcessoSalvo(todos[id] ?? 'iniciante')
        setAcesso(todos[id] ?? 'iniciante')
      })
      .catch(() => {})
  }, [api, id])

  if (!perfil) {
    return (
      <div className="anima-tela">
        <Cabecalho titulo="Aluno" sobretitulo="Editar aluno" fallback="/organizador/alunos" />
        <p className="px-5 py-10 text-center text-[15px] text-ink3">Carregando…</p>
      </div>
    )
  }

  const mostrarEnsino = ehEquipeDoProjeto([...cargosSel]) || ensino.size > 0

  const salvar = async () => {
    setSalvando(true)
    try {
      const antes = Object.fromEntries(perfil.turmas.map((t) => [t.turma, t.papel_danca]))
      for (const t of Object.keys(antes)) {
        if (!(t in mapa)) await api.removeTurmaAluno(perfil.id, t)
      }
      for (const [t, papel] of Object.entries(mapa)) {
        // upsert: entra na turma ou troca o papel
        if (!(t in antes) || antes[t] !== papel) await api.addTurmaAluno(perfil.id, t, papel)
      }
      for (const c of perfil.cargos) if (!cargosSel.has(c)) await api.removeCargoAluno(perfil.id, c)
      for (const c of cargosSel) if (!perfil.cargos.includes(c)) await api.addCargoAluno(perfil.id, c)
      for (const t of perfil.turmas_ensino) if (!ensino.has(t)) await api.removeTurmaEnsino(perfil.id, t)
      for (const t of ensino) if (!perfil.turmas_ensino.includes(t)) await api.addTurmaEnsino(perfil.id, t)
      if (acesso !== acessoSalvo) await api.setAcessoTrilha(perfil.id, acesso)
      await recarregar.pessoas()
      toast('Alterações salvas')
      navigate('/organizador/alunos')
    } catch (e) {
      toast((e as Error).message, 'erro')
      await recarregar.pessoas().catch(() => {})
    } finally {
      setSalvando(false)
    }
  }

  const removerDoSemestre = async () => {
    setSalvando(true)
    try {
      for (const t of perfil.turmas) await api.removeTurmaAluno(perfil.id, t.turma)
      for (const t of perfil.turmas_ensino) await api.removeTurmaEnsino(perfil.id, t)
      await recarregar.pessoas()
      setConfirmarRemocao(false)
      toast(`${perfil.nome.split(' ')[0]} saiu das turmas do semestre`)
      navigate('/organizador/alunos')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const alternar = (s: Set<string>, v: string, set: (x: Set<string>) => void) => {
    const n = new Set(s)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    set(n)
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo={perfil.nome} sobretitulo="Editar aluno" fallback="/organizador/alunos" />
      <div className="flex flex-col gap-4 px-4 pt-3.5">
        <div className="flex items-center gap-3 rounded-[18px] border border-linha bg-sf p-3">
          <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho={48} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-extrabold">{perfil.nome}</span>
            <span className="text-[13px] text-ink3">
              {perfil.telefone ?? 'sem telefone'}
              {perfil.email && !ehEmailSintetico(perfil.email) ? ` · ${perfil.email}` : ''}
            </span>
          </div>
        </div>
        <Dica>Telefone e e-mail não aparecem para outras pessoas. O nome, quem troca é a própria pessoa.</Dica>

        <Campo rotulo="Turmas e papel de dança">
          <SeletorTurmas turmas={nomesTurmas} valor={mapa} onChange={setMapa} />
        </Campo>

        {Object.keys(mapa).length === 0 && (
          <Campo
            rotulo="Vídeos da trilha sem turma"
            dica="Vê só os passos que a última turma do nível já teve em aula, sem chave. Vale até o próximo Encerrar semestre, que guarda o maior nível de quem estava em turma; quem já estava sem turma volta para Iniciante."
          >
            <Segmentado
              opcoes={NIVEIS.map((n) => ({ valor: n, rotulo: NOME_NIVEL[n] }))}
              valor={acesso}
              onChange={setAcesso}
            />
          </Campo>
        )}

        <Campo rotulo="Cargos" dica="O cargo de DJ vem sozinho quando a pessoa conecta o Spotify (veja Cargos do projeto).">
          <div className="flex flex-wrap gap-2">
            {cargos
              .filter((c) => c.nome !== CARGO_DJ || cargosSel.has(CARGO_DJ))
              .map((c) => (
                <ChipEscolha
                  key={c.id}
                  ativo={cargosSel.has(c.nome)}
                  onClick={() => alternar(cargosSel, c.nome, setCargosSel)}
                >
                  {c.nome}
                </ChipEscolha>
              ))}
          </div>
        </Campo>

        {/* Turmas em que a pessoa DÁ AULA — não em que estuda. É o que
            faz a turma aparecer em "Minhas turmas" no feed de quem
            ensina, sem contar como matrícula em ranking ou chamada. */}
        {mostrarEnsino && (
          <Campo rotulo="Dá aula em">
            <div className="flex flex-wrap gap-2">
              {nomesTurmas.map((t) => (
                <ChipEscolha key={t} ativo={ensino.has(t)} onClick={() => alternar(ensino, t, setEnsino)}>
                  {t}
                </ChipEscolha>
              ))}
            </div>
          </Campo>
        )}

        <div className="h-1.5" />
        <BotaoAcao tamanho="g" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </BotaoAcao>
        {(perfil.turmas.length > 0 || perfil.turmas_ensino.length > 0) && (
          <BotaoSuave tamanho="m" perigo bloco onClick={() => setConfirmarRemocao(true)}>
            Remover do semestre
          </BotaoSuave>
        )}
      </div>
      <Confirmar
        aberto={confirmarRemocao}
        titulo={`Tirar ${perfil.nome.split(' ')[0]} das turmas?`}
        texto="Sai das turmas em que estuda e das em que dá aula. Conta, pontos, check-ins e distintivos não são tocados."
        ok="Remover"
        ocupado={salvando}
        onOk={() => void removerDoSemestre()}
        onVoltar={() => setConfirmarRemocao(false)}
      />
    </div>
  )
}

/** Pôr alguém na lista de chamada, uma linha por turma. */
export function NovoAlunoPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { turmas, recarregar } = usePainel()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mapa, setMapa] = useState<MapaTurmas>({})
  const [salvando, setSalvando] = useState(false)
  const pronto = nome.trim().length >= 2 && telefoneValido(telefone)

  const salvar = async () => {
    if (!pronto) {
      toast('Preencha o nome e o celular com DDD', 'erro')
      return
    }
    setSalvando(true)
    try {
      const linhas = Object.entries(mapa)
      // Sem turma = veterano: uma linha só, para liberar o cadastro
      if (linhas.length === 0) {
        await api.saveAlunoCadastrado({ nome, telefone, turma: null, papel_danca: null })
      } else {
        for (const [turma, papel] of linhas) {
          await api.saveAlunoCadastrado({ nome, telefone, turma, papel_danca: papel })
        }
      }
      await recarregar.pessoas()
      toast(
        linhas.length === 0
          ? 'Adicionado sem turma — já pode criar conta no app'
          : 'Aluno adicionado à lista de chamada!',
      )
      navigate('/organizador/alunos')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Novo aluno" sobretitulo="Pessoas · Alunos" fallback="/organizador/alunos" />
      <div className="flex flex-col gap-4 px-4 pt-3.5">
        <Dica>
          A pessoa entra na lista de chamada. Quando ela criar a conta com este celular, nome e
          turmas já vêm preenchidos.
        </Dica>
        <Campo rotulo="Nome completo">
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Ana Beatriz Rocha"
            autoComplete="off"
          />
        </Campo>
        <Campo rotulo="Celular" dica="Nunca aparece para outras pessoas.">
          <input
            type="tel"
            className="input"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(35) 9 0000-0000"
          />
        </Campo>
        <Campo rotulo="Turmas e papel de dança" dica="Sem turma = veterano: pode criar conta, mas não entra em turma nenhuma.">
          <SeletorTurmas
            turmas={ordenarTurmas(turmas.map((t) => t.nome))}
            valor={mapa}
            onChange={setMapa}
          />
        </Campo>
        <div className="h-1" />
        <BotaoAcao tamanho="g" bloco disabled={salvando || !pronto} onClick={() => void salvar()}>
          {salvando ? 'Adicionando…' : 'Adicionar à lista de chamada'}
        </BotaoAcao>
      </div>
    </div>
  )
}
