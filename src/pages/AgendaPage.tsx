import { useCallback, useEffect, useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { Cabecalho } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ocorrenciasEvento, toISODate, type OcorrenciaAgenda } from '../lib/dates'
import type { AgendaEvent, ConfirmacaoPresenca, Feriado } from '../lib/types'

interface Item extends OcorrenciaAgenda {
  /** Quando a aula volta, se esta ocorrência foi cancelada. */
  volta: Date | null
}

function rotuloDia(d: Date): string {
  const s = d
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .replace(',', '')
    .replace(' de ', ' ')
  return s[0].toUpperCase() + s.slice(1)
}

/** "Hoje", "Amanhã", "Faltam 12 dias" — conta dias de calendário. */
function contagem(d: Date, agora: Date): string {
  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((meiaNoite(d) - meiaNoite(agora)) / 86_400_000)
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Amanhã'
  return `Faltam ${dias} dias`
}

/**
 * Próximos compromissos da pessoa: a próxima aula de cada turma dela (as
 * que estuda e as que ensina) e todos os eventos futuros, com contagem
 * regressiva. Aula cancelada
 * aparece riscada, com o motivo e quando volta — sumir sem explicação
 * faria a pessoa achar que a agenda está errada.
 */
export function AgendaPage() {
  const { api, profile, userId } = useAuth()
  const toast = useToast()
  const [eventos, setEventos] = useState<AgendaEvent[] | null>(null)
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [confirmacoes, setConfirmacoes] = useState<ConfirmacaoPresenca[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [e, f] = await Promise.all([
        api.listEvents(),
        api.listFeriados().catch(() => [] as Feriado[]),
      ])
      setEventos(e)
      setFeriados(f)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const minhasTurmas = useMemo(
    () =>
      new Set([
        ...(profile?.turmas.map((t) => t.turma) ?? []),
        ...(profile?.turmas_ensino ?? []),
      ]),
    [profile],
  )

  const itens = useMemo<Item[]>(() => {
    if (!eventos) return []
    const agora = new Date()
    const lista: Item[] = []
    for (const e of eventos) {
      if (e.turma && !minhasTurmas.has(e.turma)) continue
      // Só a próxima ocorrência: aula semanal repetida quatro vezes era
      // ruído. Evento de data única aparece não importa quão longe esteja.
      const ocs = ocorrenciasEvento(e, feriados, agora, 8)
      const [o] = ocs
      if (!o) continue
      const volta = o.cancelada
        ? (ocs.find((x) => !x.cancelada)?.quando ?? null)
        : null
      lista.push({ ...o, volta })
    }
    return lista.sort((a, b) => a.quando.getTime() - b.quando.getTime())
  }, [eventos, feriados, minhasTurmas])

  const datas = useMemo(
    () => [...new Set(itens.map((o) => toISODate(o.quando)))],
    [itens],
  )

  const carregarConfirmacoes = useCallback(async () => {
    if (datas.length === 0) return
    try {
      setConfirmacoes(await api.confirmacoesDe(datas))
    } catch (e) {
      // Sem a migração 015 a tabela não existe — o resto vale
      console.error('[agenda] confirmações', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, datas.join('|')])

  useEffect(() => {
    void carregarConfirmacoes()
  }, [carregarConfirmacoes])

  const confirmar = async (eventoId: string, data: string, vai: boolean) => {
    const chave = `${eventoId}|${data}`
    setOcupado(chave)
    try {
      await api.confirmarPresenca(eventoId, data, vai)
      await carregarConfirmacoes()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  const grupos = useMemo(() => {
    const porDia = new Map<string, Item[]>()
    for (const o of itens) {
      const k = toISODate(o.quando)
      porDia.set(k, [...(porDia.get(k) ?? []), o])
    }
    return [...porDia.entries()]
  }, [itens])

  const agora = new Date()
  const hoje = toISODate(agora)

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Agenda" />
      {erro ? (
        <div className="px-4">
          <ErrorState erro={erro} onRetry={() => void carregar()} />
        </div>
      ) : eventos === null ? (
        <Spinner />
      ) : grupos.length === 0 ? (
        <p className="px-5 py-10 text-center text-[15px] text-ink3">
          Nada marcado por enquanto.
        </p>
      ) : (
        <div className="flex flex-col gap-[22px] px-4 pt-1">
          {grupos.map(([dia, lista]) => {
            const ehHoje = dia === hoje
            return (
              <section key={dia} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 px-1">
                  {ehHoje && (
                    <span className="rounded-lg border-[1.5px] border-preto bg-brasa-500 px-[9px] py-[3px] text-xs font-extrabold tracking-[.06em] text-preto">
                      HOJE
                    </span>
                  )}
                  <span className="text-[15px] font-extrabold text-ink2">
                    {rotuloDia(lista[0].quando)}
                  </span>
                </div>
                {lista.map((o) => {
                  const chave = `${o.evento.id}|${dia}`
                  const confirmados = confirmacoes.filter(
                    (c) => c.evento_id === o.evento.id && c.data === dia,
                  )
                  const souEu = confirmados.some((c) => c.user_id === userId)
                  const outros = confirmados.length - (souEu ? 1 : 0)
                  const dou = !!o.evento.turma && profile?.turmas_ensino.includes(o.evento.turma)
                  const sub = [
                    o.evento.descricao,
                    dou ? 'Você dá aula nesta turma' : o.evento.turma,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <div
                      key={chave}
                      className="flex flex-col gap-3 rounded-[20px] border-[1.5px] bg-sf p-4"
                      style={{
                        borderColor: ehHoje && !o.cancelada ? '#DE5300' : 'var(--line)',
                      }}
                    >
                      <div className="flex items-start gap-3.5">
                        <span
                          className={`min-w-14 text-xl font-extrabold ${
                            o.cancelada ? 'text-ink3' : ehHoje ? 'text-or-t' : 'text-ink'
                          }`}
                        >
                          {o.evento.hora ?? '—'}
                        </span>
                        <div className="flex flex-1 flex-col gap-[3px]">
                          <span
                            className={`text-[17px] font-extrabold ${o.cancelada ? 'line-through' : ''}`}
                          >
                            {o.evento.titulo}
                          </span>
                          {sub && (
                            <span className="text-sm leading-snug text-ink3">{sub}</span>
                          )}
                        </div>
                        {o.evento.data && !o.cancelada && !ehHoje && (
                          <span className="shrink-0 rounded-lg border-[1.5px] border-preto bg-verde-500 px-2 py-[3px] text-xs font-extrabold text-preto">
                            {contagem(o.quando, agora)}
                          </span>
                        )}
                      </div>
                      {o.cancelada ? (
                        <div className="rounded-xl bg-chip px-3 py-2.5 text-sm font-bold text-or-t">
                          Cancelada
                          {o.motivoCancelamento ? ` · ${o.motivoCancelamento}` : ''}
                          {o.volta ? ` · volta ${rotuloDia(o.volta).toLowerCase()}` : ''}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            {confirmados.length > 0 && (
                              <div className="flex -space-x-2">
                                {confirmados.slice(0, 3).map((c) => (
                                  <span key={c.user_id} className="rounded-full ring-2 ring-sf">
                                    <Avatar nome={c.nome} url={c.avatar_url} tamanho={24} borda={false} />
                                  </span>
                                ))}
                              </div>
                            )}
                            <span className="truncate text-sm text-ink3">
                              {souEu
                                ? outros > 0
                                  ? `Você e mais ${outros} ${outros === 1 ? 'vai' : 'vão'}`
                                  : 'Você vai'
                                : confirmados.length === 0
                                  ? 'Ninguém confirmou ainda'
                                  : `${confirmados.length} ${confirmados.length === 1 ? 'pessoa vai' : 'pessoas vão'}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={ocupado === chave}
                            onClick={() => void confirmar(o.evento.id, dia, !souEu)}
                            className={`h-11 shrink-0 rounded-[14px] border-2 border-preto px-[18px] text-[15px] font-extrabold text-preto disabled:opacity-60 ${
                              souEu ? 'bg-verde-500' : 'bg-branco'
                            }`}
                          >
                            {souEu ? 'Vou ✓' : 'Eu vou'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
