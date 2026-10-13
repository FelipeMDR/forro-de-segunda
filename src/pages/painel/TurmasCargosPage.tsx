import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Icone } from '../../components/Icone'
import { BotaoAcao, Cabecalho, Confirmar } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { CARGO_DJ, LIMITE_DJS } from '../../lib/dj'
import { ordenarTurmas } from '../../lib/forrodex'
import type { Profile } from '../../lib/types'
import { Dica, EscolherPessoa, usePainel } from './contexto'

/** Etiqueta de pessoa com o ✕ para tirar. */
function PessoaChip({ p, onRemover, rotulo }: { p: Profile; onRemover?: () => void; rotulo: string }) {
  return (
    <span className="flex h-[38px] items-center gap-1.5 rounded-full bg-chip pl-1 text-sm font-extrabold">
      <Avatar nome={p.nome} url={p.avatar_url} tamanho={30} borda={false} />
      {p.nome.split(' ')[0]}
      {onRemover ? (
        <button
          type="button"
          onClick={onRemover}
          aria-label={rotulo}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-ink3"
        >
          <Icone nome="fechar" tamanho={14} traco={3} />
        </button>
      ) : (
        <span className="w-2.5" />
      )}
    </span>
  )
}

function BotaoAdicionar({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-[38px] rounded-full border-[1.5px] border-dashed border-linha px-3 text-sm font-extrabold text-ink disabled:opacity-40"
    >
      + Adicionar
    </button>
  )
}

/** Campo + botão "Criar" em linha. */
function CriarEmLinha({
  placeholder,
  cor,
  onCriar,
}: {
  placeholder: string
  cor: string
  onCriar: (nome: string) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    await onCriar(nome.trim())
    setNome('')
  }
  return (
    <form onSubmit={(e) => void enviar(e)} className="flex gap-2">
      <input
        className="input"
        placeholder={placeholder}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        required
      />
      <button
        type="submit"
        className="h-[54px] shrink-0 rounded-2xl border-2 border-preto px-4 text-[15px] font-extrabold text-preto"
        style={{ background: cor }}
      >
        Criar
      </button>
    </form>
  )
}

export function TurmasPage() {
  const { api } = useAuth()
  const toast = useToast()
  const { turmas, perfis, recarregar } = usePainel()
  const [escolhendo, setEscolhendo] = useState<string | null>(null)
  const [apagando, setApagando] = useState<{ id: string; nome: string } | null>(null)

  const professores = (t: string) => perfis.filter((p) => p.turmas_ensino.includes(t))
  const alunos = (t: string) => perfis.filter((p) => p.turmas.some((m) => m.turma === t)).length
  const ordenadas = ordenarTurmas(turmas.map((t) => t.nome))
    .map((nome) => turmas.find((t) => t.nome === nome)!)
    .filter(Boolean)

  const agir = async (f: () => Promise<void>, msg?: string) => {
    try {
      await f()
      await recarregar.pessoas()
      if (msg) toast(msg)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Turmas do semestre" sobretitulo="Pessoas" fallback="/organizador/pessoas" />
      <div className="flex flex-col gap-3 px-4 pt-3.5">
        <Dica>
          Elas aparecem em todos os cadastros e na agenda. Quem dá aula numa turma vê os alunos
          dela em "Minha turma" no feed, sem contar como matrícula.
        </Dica>
        {ordenadas.map((t) => (
          <div key={t.id} className="flex flex-col gap-3 rounded-[20px] border border-linha bg-sf p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-extrabold">{t.nome}</span>
              <span className="flex items-center gap-1 text-[13px] text-ink3">
                {alunos(t.nome)} {alunos(t.nome) === 1 ? 'aluno' : 'alunos'}
                <button
                  type="button"
                  aria-label={`Apagar a turma ${t.nome}`}
                  onClick={() => setApagando(t)}
                  className="flex h-9 w-9 items-center justify-center text-ink3"
                >
                  <Icone nome="lixo" tamanho={18} />
                </button>
              </span>
            </div>
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
              Dá aula nesta turma
            </span>
            <div className="flex flex-wrap gap-1.5">
              {professores(t.nome).map((p) => (
                <PessoaChip
                  key={p.id}
                  p={p}
                  rotulo={`${p.nome} não dá mais aula em ${t.nome}`}
                  onRemover={() => void agir(() => api.removeTurmaEnsino(p.id, t.nome))}
                />
              ))}
              <BotaoAdicionar onClick={() => setEscolhendo(t.nome)} />
            </div>
          </div>
        ))}
        <CriarEmLinha
          placeholder="Nova turma (ex.: Iniciante 03)"
          cor="#9BC22D"
          onCriar={async (nome) => {
            try {
              await api.saveTurma(nome)
              await recarregar.turmas()
              toast('Turma criada!')
            } catch (e) {
              toast((e as Error).message, 'erro')
            }
          }}
        />
      </div>

      <EscolherPessoa
        aberta={escolhendo !== null}
        titulo={`Quem dá aula em ${escolhendo ?? ''}?`}
        excluir={escolhendo ? professores(escolhendo).map((p) => p.id) : []}
        onFechar={() => setEscolhendo(null)}
        onEscolher={(p) => {
          const t = escolhendo!
          setEscolhendo(null)
          void agir(() => api.addTurmaEnsino(p.id, t), `${p.nome.split(' ')[0]} dá aula em ${t}`)
        }}
      />
      <Confirmar
        aberto={apagando !== null}
        titulo={`Apagar a turma ${apagando?.nome ?? ''}?`}
        texto="Ela some dos cadastros e da agenda. Para virar o semestre, use Encerrar semestre."
        ok="Apagar"
        onOk={() => {
          const t = apagando!
          setApagando(null)
          void (async () => {
            try {
              await api.deleteTurma(t.id)
              await recarregar.turmas()
            } catch (e) {
              toast((e as Error).message, 'erro')
            }
          })()
        }}
        onVoltar={() => setApagando(null)}
      />
    </div>
  )
}

export function CargosPage() {
  const { api } = useAuth()
  const toast = useToast()
  const { cargos, perfis, recarregar } = usePainel()
  const [escolhendo, setEscolhendo] = useState<string | null>(null)
  const [apagando, setApagando] = useState<{ id: string; nome: string } | null>(null)
  const [tirandoDJ, setTirandoDJ] = useState<Profile | null>(null)

  const titulares = (c: string) => perfis.filter((p) => p.cargos.includes(c))
  const djs = titulares(CARGO_DJ)

  const agir = async (f: () => Promise<void>, msg?: string) => {
    try {
      await f()
      await recarregar.pessoas()
      if (msg) toast(msg)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Cargos do projeto" sobretitulo="Pessoas" fallback="/organizador/pessoas" />
      <div className="flex flex-col gap-2.5 px-4 pt-3.5">
        <Dica>
          Aparecem em destaque no perfil de quem ocupa. Ao trocar a gestão, tire o cargo de
          uma pessoa e dê para outra.
        </Dica>
        {cargos.map((c) => {
          const dj = c.nome === CARGO_DJ
          const lotado = dj && djs.length >= LIMITE_DJS
          return (
            <div key={c.id} className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-sf px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-extrabold">{c.nome}</span>
                {dj ? (
                  <span className="text-xs font-bold text-ink3">
                    {djs.length}/{LIMITE_DJS} · vem do Spotify
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Apagar o cargo ${c.nome}`}
                    onClick={() => setApagando(c)}
                    className="flex h-9 w-9 items-center justify-center text-ink3"
                  >
                    <Icone nome="lixo" tamanho={18} />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {titulares(c.nome).map((p) => (
                  <PessoaChip
                    key={p.id}
                    p={p}
                    rotulo={`Tirar o cargo ${c.nome} de ${p.nome}`}
                    onRemover={() =>
                      dj
                        ? setTirandoDJ(p)
                        : void agir(() => api.removeCargoAluno(p.id, c.nome))
                    }
                  />
                ))}
                <BotaoAdicionar disabled={lotado} onClick={() => setEscolhendo(c.nome)} />
              </div>
              {lotado && (
                <span className="text-[13px] text-ink3">
                  Vagas preenchidas. Para pôr outra pessoa, tire alguém antes — e troque também
                  na lista do painel do Spotify.
                </span>
              )}
            </div>
          )
        })}
        <CriarEmLinha
          placeholder="Novo cargo"
          cor="#F97316"
          onCriar={async (nome) => {
            try {
              await api.saveCargo(nome)
              await recarregar.cargos()
              toast('Cargo criado!')
            } catch (e) {
              toast((e as Error).message, 'erro')
            }
          }}
        />
      </div>

      <EscolherPessoa
        aberta={escolhendo !== null}
        titulo={`Dar o cargo ${escolhendo ?? ''} a…`}
        excluir={escolhendo ? titulares(escolhendo).map((p) => p.id) : []}
        onFechar={() => setEscolhendo(null)}
        onEscolher={(p) => {
          const c = escolhendo!
          setEscolhendo(null)
          void agir(() => api.addCargoAluno(p.id, c), `${p.nome.split(' ')[0]} agora é ${c}`)
        }}
      />
      <Confirmar
        aberto={tirandoDJ !== null}
        titulo={`Tirar o cargo de DJ de ${tirandoDJ?.nome.split(' ')[0] ?? ''}?`}
        texto="O Spotify dessa pessoa é desconectado do app, e o Modo DJ dela fecha se estiver ligado."
        ok="Tirar"
        onOk={() => {
          const p = tirandoDJ!
          setTirandoDJ(null)
          void agir(() => api.removeCargoAluno(p.id, CARGO_DJ), `${p.nome.split(' ')[0]} não é mais DJ`)
        }}
        onVoltar={() => setTirandoDJ(null)}
      />
      <Confirmar
        aberto={apagando !== null}
        titulo={`Apagar o cargo ${apagando?.nome ?? ''}?`}
        texto="Ele sai do perfil de quem ocupa."
        ok="Apagar"
        onOk={() => {
          const c = apagando!
          setApagando(null)
          void (async () => {
            try {
              await api.deleteCargo(c.id)
              await Promise.all([recarregar.cargos(), recarregar.pessoas()])
            } catch (e) {
              toast((e as Error).message, 'erro')
            }
          })()
        }}
        onVoltar={() => setApagando(null)}
      />
    </div>
  )
}

/**
 * Vira o semestre: tira todo mundo das turmas (as que estuda e as que
 * ensina) para a matrícula nova entrar limpa. É o corte que zera a
 * Forródex e libera a Retrospectiva. Pede a palavra digitada porque é
 * o botão mais pesado do app.
 */
export function SemestrePage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { perfis, recarregar } = usePainel()
  const [texto, setTexto] = useState('')
  const [encerrando, setEncerrando] = useState(false)
  const comTurma = perfis.filter((p) => p.turmas.length > 0 || p.turmas_ensino.length > 0).length
  const pronto = texto.trim().toUpperCase() === 'ENCERRAR'

  const encerrar = async () => {
    setEncerrando(true)
    try {
      const n = await api.encerrarSemestre()
      await recarregar.pessoas()
      toast(
        n === 0
          ? 'Semestre encerrado. Ninguém estava em turma nenhuma.'
          : `Semestre encerrado: ${n} pessoa(s) ficaram sem turma. Agora importe a matrícula nova e remarque quem dá aula.`,
      )
      navigate('/organizador/pessoas')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setEncerrando(false)
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Encerrar semestre" sobretitulo="Pessoas" fallback="/organizador/pessoas" />
      <div className="flex flex-col gap-3.5 px-4 pt-3.5">
        <div className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-brasa-500 bg-sf p-4">
          <span className="text-lg font-extrabold">Ao encerrar:</span>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink2">
            <li>
              as <b className="text-ink">{comTurma}</b> pessoas com turma saem delas — inclusive quem
              dá aula
            </li>
            <li>a Forródex de todo mundo zera e a Retrospectiva do semestre é liberada</li>
            <li>a matrícula nova precisa ser importada, e quem dá aula remarcado</li>
            <li>contas, pontos, check-ins e distintivos não são tocados</li>
          </ul>
          <span className="text-sm font-extrabold text-or-t">Não dá para desfazer.</span>
        </div>
        <span className="px-1 text-sm font-extrabold text-ink2">Digite ENCERRAR para confirmar</span>
        <input
          className="input font-extrabold tracking-[.08em]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="ENCERRAR"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <BotaoAcao tamanho="g" bloco disabled={!pronto || encerrando} onClick={() => void encerrar()}>
          {encerrando ? 'Encerrando…' : 'Encerrar semestre'}
        </BotaoAcao>
      </div>
    </div>
  )
}
