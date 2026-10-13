import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChallengeForm } from '../components/ChallengeForm'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { Cabecalho, Etiqueta, RotuloSecao } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { challengePhase, daysLeft } from '../lib/dates'
import { faixasDeHorario, periodoCurto } from '../lib/horarios'
import { defModalidade, type Challenge } from '../lib/types'
import { useLembrado } from '../lib/memoriaTelas'

/** "Presença e Parcerias" */
export function nomesModalidades(c: Challenge): string {
  const nomes = c.modalidades.map((m) => defModalidade(m).nome)
  return nomes.length > 1
    ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
    : nomes[0]
}

/** Quanto falta, na voz da fase: "Termina em 19 dias", "Começa em 3 dias". */
export function statusDoDesafio(c: Challenge): { texto: string; cor: string } {
  const fase = challengePhase(c)
  if (fase === 'ativo') {
    const n = daysLeft(c.data_fim)
    return {
      texto: n <= 1 ? 'Termina hoje' : `Termina em ${n} dias`,
      cor: 'text-or-t',
    }
  }
  if (fase === 'futuro') {
    const n = Math.ceil(
      (new Date(`${c.data_inicio}T00:00:00`).getTime() - Date.now()) / 86_400_000,
    )
    return {
      texto: n <= 1 ? 'Começa amanhã' : `Começa em ${n} dias`,
      cor: 'text-bl-t',
    }
  }
  return { texto: 'Encerrado', cor: 'text-ink3' }
}

function CartaoDesafio({ c }: { c: Challenge }) {
  const fase = challengePhase(c)
  const status = statusDoDesafio(c)
  return (
    <Link
      to={`/desafios/${c.id}`}
      className={`flex flex-col gap-2.5 rounded-[22px] border-[1.5px] bg-sf p-4 text-ink ${
        fase === 'encerrado' ? 'opacity-70' : ''
      }`}
      style={{
        borderColor: c.sou_membro && fase === 'ativo' ? '#9BC22D' : 'var(--line)',
      }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-xl font-extrabold leading-tight">{c.titulo}</span>
        {c.sou_membro && <Etiqueta cor="verde" className="shrink-0 text-xs">Participando</Etiqueta>}
      </div>
      <span className="text-sm text-ink3">
        {periodoCurto(c.data_inicio, c.data_fim)} · {nomesModalidades(c)} ·{' '}
        {c.participantes} {c.participantes === 1 ? 'pessoa' : 'pessoas'}
      </span>
      {c.janelas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {faixasDeHorario(c.janelas).map((h) => (
            <span key={h} className="rounded-[10px] bg-chip px-2.5 py-[5px] text-[13px] font-bold">
              {h}
            </span>
          ))}
        </div>
      )}
      <span className={`text-sm font-extrabold ${status.cor}`}>{status.texto}</span>
    </Link>
  )
}

export function ChallengesPage() {
  const { api, papel } = useAuth()
  const [desafios, setDesafios] = useLembrado<Challenge[] | null>('desafios', null)
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setErro(null)
      setDesafios(await api.listChallenges())
    } catch (e) {
      console.error('[desafios] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const grupos = desafios
    ? ([
        ['Rolando agora', desafios.filter((c) => challengePhase(c) === 'ativo')],
        ['Em breve', desafios.filter((c) => challengePhase(c) === 'futuro')],
        ['Encerrados', desafios.filter((c) => challengePhase(c) === 'encerrado')],
      ] as const)
    : []

  return (
    <div className="anima-tela">
      <Cabecalho
        titulo="Desafios"
        acao={
          papel === 'organizador' && (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="h-11 shrink-0 rounded-[14px] border-2 border-preto bg-brasa-500 px-3.5 text-sm font-extrabold text-preto"
            >
              + Novo
            </button>
          )
        }
      />
      {erro ? (
        <div className="px-4">
          <ErrorState
            titulo="Não consegui carregar os desafios"
            erro={erro}
            onRetry={() => void carregar()}
          />
        </div>
      ) : desafios === null ? (
        <Spinner texto="Carregando desafios…" />
      ) : desafios.length === 0 ? (
        <p className="px-6 py-10 text-center text-[15px] text-ink3">
          {papel === 'organizador'
            ? 'Nenhum desafio ainda. Crie o primeiro para animar a turma!'
            : 'Nenhum desafio por enquanto. A organização avisa quando lançar um.'}
        </p>
      ) : (
        <div className="flex flex-col gap-[22px] px-4 pt-1">
          {grupos.map(
            ([rotulo, lista]) =>
              lista.length > 0 && (
                <section key={rotulo} className="flex flex-col gap-2.5">
                  <RotuloSecao>{rotulo}</RotuloSecao>
                  {lista.map((c) => (
                    <CartaoDesafio key={c.id} c={c} />
                  ))}
                </section>
              ),
          )}
        </div>
      )}

      {criando && (
        <ChallengeForm onClose={() => setCriando(false)} onSaved={() => void carregar()} />
      )}
    </div>
  )
}
