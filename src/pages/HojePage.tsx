import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AceiteTermos } from '../components/AceiteTermos'
import { Avatar } from '../components/Avatar'
import { Equalizador, Icone } from '../components/Icone'
import { InstallPrompt } from '../components/InstallPrompt'
import { Logo } from '../components/Logo'
import { PedirNome } from '../components/PedirNome'
import { BotaoIcone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { horaCurta, rotuloDaNoite, useNoite } from '../context/NoiteContext'
import {
  challengePhase,
  daysLeft,
  proximasOcorrenciasAgenda,
  type OcorrenciaAgenda,
} from '../lib/dates'
import { colocacoes } from '../lib/ranking'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'
import { defModalidade } from '../lib/types'
import type {
  AgendaEvent,
  Challenge,
  PresenteNoite,
  SessaoDJ,
} from '../lib/types'
import { useLembrado } from '../lib/memoriaTelas'

/**
 * A tela de abertura, pensada para os dois minutos de quem está no
 * salão: o check-in no topo, em tamanho de cartaz, e em volta só o que
 * importa naquela noite — música, desafio, quem está lá, o próximo
 * compromisso.
 */
export function HojePage() {
  const { api, userId, profile } = useAuth()
  const navigate = useNavigate()
  const noite = useNoite()
  const podeSerDJ = usePodeSerDJ()
  const [sessao, setSessao] = useLembrado<SessaoDJ | null>('hoje:sessao', null)
  const [fila, setFila] = useLembrado('hoje:fila', 0)
  const [presentes, setPresentes] = useLembrado<PresenteNoite[] | null>(
    'hoje:presentes',
    null,
  )
  const [eventos, setEventos] = useLembrado<AgendaEvent[]>('agenda:eventos', [])
  const [posicao, setPosicao] = useLembrado<{ desafio: Challenge; pos: number } | null>(
    'hoje:posicao',
    null,
  )

  // Sessão de DJ e fila: o que diz se dá para pedir música agora
  useEffect(() => {
    let vivo = true
    void api
      .sessaoDJAberta()
      .then(async (s) => {
        if (!vivo) return
        setSessao(s)
        if (s) {
          const f = await api.filaDaNoite().catch(() => [])
          if (vivo) setFila(f.length)
        }
      })
      // Sem a migração 029, simplesmente não há música
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [api])

  useEffect(() => {
    let vivo = true
    void api
      .presentesDaNoite(noite.noite)
      .then((p) => vivo && setPresentes(p))
      .catch(() => vivo && setPresentes([]))
    return () => {
      vivo = false
    }
    // Recarrega quando a minha foto entra (a situação muda)
  }, [api, noite.noite, noite.situacao])

  useEffect(() => {
    let vivo = true
    void api
      .listEvents()
      .then((e) => vivo && setEventos(e))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [api])

  // Minha colocação no desafio de que participo e que acaba primeiro
  const meuDesafio = useMemo(
    () =>
      noite.desafios
        .filter((c) => c.sou_membro && challengePhase(c, noite.agora) === 'ativo')
        .sort((a, b) => a.data_fim.localeCompare(b.data_fim))[0] ?? null,
    [noite.desafios, noite.agora],
  )
  const rolando = noite.desafios.filter(
    (c) => challengePhase(c, noite.agora) === 'ativo',
  ).length

  useEffect(() => {
    if (!meuDesafio || !userId) {
      setPosicao(null)
      return
    }
    let vivo = true
    void api
      .getRanking(meuDesafio, meuDesafio.modalidades[0])
      .then((r) => {
        const eu = colocacoes(r).find((c) => c.entrada.user_id === userId)
        if (vivo) setPosicao(eu ? { desafio: meuDesafio, pos: eu.posicao } : null)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [api, meuDesafio, userId, noite.situacao])

  // Próximo compromisso nas minhas turmas (as que estudo e as que ensino)
  const proximo = useMemo<OcorrenciaAgenda | null>(() => {
    const minhas = new Set([
      ...(profile?.turmas.map((t) => t.turma) ?? []),
      ...(profile?.turmas_ensino ?? []),
    ])
    const relevantes = eventos.filter((e) => !e.turma || minhas.has(e.turma))
    return (
      proximasOcorrenciasAgenda(relevantes, noite.feriados, noite.agora).find(
        (o) => !o.cancelada,
      ) ?? null
    )
  }, [eventos, noite.feriados, noite.agora, profile])

  const souDJdaSessao = sessao?.dj_user_id === userId
  const mostrarDJ = podeSerDJ === true || souDJdaSessao

  return (
    <div className="anima-tela">
      <div className="flex items-center justify-between pb-2 pl-[18px] pr-4 pt-0.5">
        <Logo altura={42} />
        <BotaoIcone
          icone="buscar"
          rotulo="Buscar pessoas"
          variante="cartao"
          tamanhoIcone={20}
          onClick={() => navigate('/buscar')}
        />
      </div>

      <div className="px-5 pb-3 pt-1 text-[15px] font-bold text-or-t">
        {rotuloDaNoite(noite.noite)}
      </div>

      <div className="flex flex-col gap-3 px-4">
        <AceiteTermos />
        <PedirNome />

        <CartaoCheckin />

        {mostrarDJ && (
          <Link
            to="/dj"
            className="flex items-center gap-3.5 rounded-[22px] border-[1.5px] bg-sf px-4 py-3.5 text-ink"
            style={{
              borderColor: souDJdaSessao ? '#0391D5' : 'var(--line)',
            }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-preto text-azul-300">
              <Icone nome="fone" tamanho={22} traco={2.3} />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-base font-extrabold">Modo DJ</span>
              <span className="text-[13px] text-ink3">
                {souDJdaSessao
                  ? `Pedidos abertos · ${fila} na fila`
                  : sessao
                    ? `DJ ${sessao.dj_nome.split(' ')[0]} no comando`
                    : 'Toque para abrir os pedidos de música'}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full border-[1.5px] border-preto px-2.5 py-[5px] text-xs font-extrabold text-preto ${
                souDJdaSessao ? 'bg-verde-500' : 'bg-branco'
              }`}
            >
              {souDJdaSessao ? 'LIGADO' : 'DESLIGADO'}
            </span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/musica"
            className="flex min-h-[132px] flex-col gap-2.5 rounded-[22px] border-[1.5px] bg-sf p-4 text-ink"
            style={{ borderColor: sessao ? '#0391D5' : 'var(--line)' }}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-preto ${
                sessao ? 'bg-azul-500 text-preto' : 'bg-sf2 text-ink'
              }`}
            >
              {sessao ? <Equalizador /> : <Icone nome="nota" tamanho={20} traco={2.4} />}
            </span>
            <span className="text-[17px] font-extrabold leading-tight">
              {sessao ? 'Peça sua música' : 'Música da noite'}
            </span>
            <span className="text-[13px] text-ink3">
              {sessao ? `${fila} na fila · DJ ${sessao.dj_nome.split(' ')[0]}` : 'Pedidos fechados'}
            </span>
          </Link>

          <Link
            to="/desafios"
            className="flex min-h-[132px] flex-col gap-2.5 rounded-[22px] border border-linha bg-sf p-4 text-ink"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-preto bg-verde-500 text-[17px] font-extrabold text-preto">
              {posicao ? `${posicao.pos}º` : <Icone nome="trofeu" tamanho={20} />}
            </span>
            <span className="text-[17px] font-extrabold leading-tight">
              {posicao ? posicao.desafio.titulo : 'Desafios'}
            </span>
            <span className="text-[13px] text-ink3">
              {posicao
                ? `na ${defModalidade(posicao.desafio.modalidades[0]).nome} · ${faltam(posicao.desafio)}`
                : rolando > 0
                  ? `${rolando} rolando agora`
                  : 'Veja o que vem por aí'}
            </span>
          </Link>
        </div>

        <NoSalao presentes={presentes} />

        <Link
          to="/agenda"
          className="flex items-center gap-3.5 rounded-[22px] border border-linha bg-sf p-4 text-ink"
        >
          {proximo ? (
            <div className="flex w-[52px] shrink-0 flex-col items-center rounded-[14px] bg-chip py-1.5">
              <span className="text-xs font-extrabold uppercase text-or-t">
                {proximo.quando
                  .toLocaleDateString('pt-BR', { weekday: 'short' })
                  .replace('.', '')}
              </span>
              <span className="text-[22px] font-extrabold leading-none">
                {proximo.quando.getDate()}
              </span>
            </div>
          ) : (
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-chip text-ink2">
              <Icone nome="agenda" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-ink3">
              {proximo ? 'Próximo na agenda' : 'Agenda'}
            </span>
            <span className="truncate text-base font-extrabold">
              {proximo
                ? `${proximo.evento.titulo}${proximo.evento.hora ? ` · ${proximo.evento.hora}` : ''}`
                : 'Aulas e eventos'}
            </span>
          </div>
          <Icone nome="avancar" tamanho={20} className="shrink-0 text-ink3" />
        </Link>

        <InstallPrompt />
      </div>
    </div>
  )
}

function faltam(c: Challenge): string {
  const n = daysLeft(c.data_fim)
  return n <= 0 ? 'último dia' : n === 1 ? 'falta 1 dia' : `faltam ${n} dias`
}

/** Pilha de rostos de quem já fez check-in nesta noite. */
function NoSalao({ presentes }: { presentes: PresenteNoite[] | null }) {
  const mostrar = presentes?.slice(0, 7) ?? []
  const resto = (presentes?.length ?? 0) - mostrar.length
  return (
    <Link
      to="/salao"
      className="flex flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4 text-ink"
    >
      <div className="flex w-full items-baseline justify-between">
        <span className="text-[17px] font-extrabold">No salão agora</span>
        <span className="flex items-center gap-1 text-sm text-ink3">
          {presentes === null
            ? '…'
            : `${presentes.length} ${presentes.length === 1 ? 'check-in' : 'check-ins'}`}
          <Icone nome="avancar" tamanho={16} traco={2.4} />
        </span>
      </div>
      {mostrar.length > 0 && (
        <div className="flex">
          {mostrar.map((p) => (
            <span key={p.user_id} className="-mr-[9px] rounded-full ring-2 ring-sf">
              <Avatar nome={p.nome} url={p.avatar_url} tamanho={38} borda={false} />
            </span>
          ))}
          {resto > 0 && (
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-sf2 text-xs font-extrabold ring-2 ring-sf">
              +{resto}
            </span>
          )}
        </div>
      )}
      <span className="text-[13px] text-ink3">
        {presentes && presentes.length === 0
          ? 'Ninguém fez check-in ainda nesta noite'
          : 'Veja quem veio hoje e com quem ainda falta dançar'}
      </span>
    </Link>
  )
}

/**
 * O cartaz do check-in. Uma cor por situação: laranja = faça agora,
 * verde = feito, superfície neutra = nada a fazer.
 */
function CartaoCheckin() {
  const navigate = useNavigate()
  const n = useNoite()
  const hora = n.checkinNoite ? horaCurta(n.checkinNoite) : null

  if (n.situacao === 'pontuou' || n.situacao === 'postou') {
    return (
      <div className="flex flex-col gap-3.5 rounded-[26px] border-2 border-preto bg-verde-500 p-5 text-preto shadow-[0_5px_0_#000507]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-preto text-verde-500">
            <Icone nome="check" tamanho={24} traco={3} />
          </span>
          <div className="flex flex-col">
            <span className="text-[22px] font-extrabold leading-tight">
              {n.situacao === 'pontuou' ? 'Presença registrada' : 'Check-in feito'}
            </span>
            <span className="text-[15px] font-semibold">
              {hora && `às ${hora} · `}
              {n.situacao === 'pontuou'
                ? n.desafioDaVez?.titulo
                : 'a foto está no feed'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate('/checkin?passo=duplas')}
            className="h-[52px] rounded-2xl border-2 border-preto bg-branco text-base font-extrabold text-preto"
          >
            Com quem você dançou?
          </button>
          <button
            type="button"
            onClick={() => navigate('/checkin?passo=camera')}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-preto bg-transparent text-[15px] font-extrabold text-preto"
          >
            <Icone nome="camera" tamanho={18} traco={2.4} />
            Tirar outra foto
          </button>
          {n.situacao === 'pontuou' && (
            <span className="text-center text-[13px] font-semibold">
              A nova foto vai para o feed, mas a presença não conta de novo.
            </span>
          )}
        </div>
      </div>
    )
  }

  if (n.situacao === 'valendo') {
    return (
      <div className="flex flex-col gap-[18px] rounded-[26px] border-2 border-preto bg-brasa-500 p-5 text-preto shadow-[0_5px_0_#000507]">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[.06em]">
            <span className="pulso h-2.5 w-2.5 rounded-full bg-preto" />
            Valendo ponto agora
          </span>
          <span className="text-[30px] font-extrabold leading-[1.02] tracking-[-.02em]">
            Tire sua foto e registre a presença
          </span>
          <span className="text-[15px] font-semibold">
            {n.desafioDaVez?.titulo}
            {n.ateHora && ` · até ${n.ateHora}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/checkin')}
          className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] bg-preto text-lg font-extrabold text-branco active:scale-[.98]"
        >
          <Icone nome="camera" tamanho={24} />
          Fazer check-in
        </button>
      </div>
    )
  }

  // Nada valendo agora: a foto ainda pode ir para o feed
  const titulo =
    n.situacao === 'cancelada'
      ? 'Hoje não tem forró'
      : n.situacao === 'fora'
        ? 'Tem desafio rolando'
        : 'Nada valendo ponto agora'
  const texto =
    n.situacao === 'cancelada'
      ? `${n.motivoCancelamento ? `${n.motivoCancelamento}. ` : ''}A foto entra no feed, mas não marca ponto.`
      : n.situacao === 'fora'
        ? `${n.desafioDaVez?.titulo} está valendo e você não entrou. A foto já fica valendo se você entrar depois.`
        : 'Quando abrir a janela de um desafio, o check-in aparece aqui.'
  return (
    <div className="flex flex-col gap-3.5 rounded-[26px] border border-linha bg-sf p-5 text-ink">
      <div className="flex flex-col gap-1">
        <span className="text-[22px] font-extrabold leading-tight">{titulo}</span>
        <span className="text-[15px] leading-snug text-ink2">{texto}</span>
      </div>
      <div className="flex gap-2">
        {n.situacao === 'fora' && n.desafioDaVez && (
          <Link
            to={`/desafios/${n.desafioDaVez.id}`}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-preto bg-azul-500 text-[15px] font-extrabold text-preto"
          >
            Ver desafio
          </Link>
        )}
        <button
          type="button"
          onClick={() => navigate('/checkin')}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-linha bg-chip text-[15px] font-extrabold text-ink"
        >
          <Icone nome="camera" tamanho={18} traco={2.4} />
          Tirar foto
        </button>
      </div>
    </div>
  )
}
