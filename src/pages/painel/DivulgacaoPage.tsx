import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Icone } from '../../components/Icone'
import { Spinner } from '../../components/Spinner'
import { BotaoIcone, Cabecalho } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { downloadCSV } from '../../lib/csv'
import {
  linhasCsvDivulgacao,
  metricasDivulgacao,
  type EventoDivulgacao,
  type MetricasOferta,
} from '../../lib/metricasDivulgacao'
import { Dica, usePainel } from './contexto'

const pct = (parte: number, todo: number) =>
  todo === 0 ? '—' : `${Math.round((parte / todo) * 100)}%`

/**
 * O que a galera fez com o card "Ingressos à venda" da tela Hoje: quantos
 * viram, abriram, foram ao formulário ou fecharam, e de quais turmas.
 * A compra em si acontece no Google Forms — aqui se mede até a porta.
 */
export function DivulgacaoPage() {
  const { api } = useAuth()
  const toast = useToast()
  const { perfis } = usePainel()
  const [eventos, setEventos] = useState<EventoDivulgacao[] | null>(null)

  const carregar = useCallback(async () => {
    try {
      setEventos(await api.eventosDivulgacao())
    } catch (e) {
      setEventos([])
      toast(
        `${(e as Error).message} — a migração 046 já foi rodada no Supabase?`,
        'erro',
      )
    }
  }, [api, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const ofertas = useMemo(
    () => (eventos ? metricasDivulgacao(eventos, perfis) : []),
    [eventos, perfis],
  )

  function exportar() {
    if (!eventos) return
    const { cabecalho, linhas } = linhasCsvDivulgacao(eventos, perfis)
    downloadCSV('divulgacao-eventos', cabecalho, linhas)
  }

  return (
    <div className="anima-tela">
      <Cabecalho
        titulo="Divulgação"
        sobretitulo="Painel"
        fallback="/organizador"
        acao={
          <BotaoIcone
            icone="girar"
            rotulo="Atualizar"
            variante="cartao"
            tamanhoIcone={18}
            onClick={() => {
              setEventos(null)
              void carregar()
            }}
          />
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-8 pt-3">
        {eventos === null ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : ofertas.length === 0 ? (
          <EmptyState
            emoji="📣"
            titulo="Ainda sem dados"
            texto="Os números aparecem aqui quando a galera começar a ver o card de ingressos na tela Hoje."
          />
        ) : (
          <>
            {ofertas.map((o) => (
              <Oferta key={o.divulgacao} o={o} />
            ))}

            <button
              type="button"
              onClick={exportar}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-linha bg-sf text-[15px] font-extrabold text-ink"
            >
              <Icone nome="baixar" tamanho={18} traco={2.4} />
              Baixar todos os eventos (CSV)
            </button>
          </>
        )}

        <Dica>
          Conta pessoas, não toques: quem voltou à Home dez vezes viu uma vez
          por dia. "Ignoraram" é quem viu e não tocou em Comprar. A compra
          acontece no formulário do Google, então aqui se sabe quem foi até
          ele — para saber quem pagou, compare com a planilha de ingressos.
          Quem faz duas turmas aparece nas duas.
        </Dica>
      </div>
    </div>
  )
}

function Oferta({ o }: { o: MetricasOferta }) {
  const etapas = [
    { rotulo: 'Viram o card', n: o.viram },
    { rotulo: 'Abriram os detalhes', n: o.detalhes },
    { rotulo: 'Tocaram em Comprar', n: o.clicaram },
  ]
  const maxDia = Math.max(1, ...o.cliquesPorDia.map((d) => d.pessoas))

  return (
    <section className="flex flex-col gap-4 rounded-[22px] border border-linha bg-sf p-4 text-ink">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[20px] font-extrabold leading-tight">{o.titulo}</h2>
        <span className="text-[13px] text-ink3">
          {o.clicaram} de {o.viram} foram ao formulário ({pct(o.clicaram, o.viram)}) ·{' '}
          {o.cliques} {o.cliques === 1 ? 'toque' : 'toques'} em Comprar
        </span>
      </div>

      {/* Funil: uma série só, número escrito ao lado de cada barra */}
      <div className="flex flex-col gap-2.5" role="list" aria-label="Funil">
        {etapas.map((e) => (
          <div key={e.rotulo} role="listitem" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-ink2">{e.rotulo}</span>
              <span className="font-extrabold tabular-nums">
                {e.n}
                <span className="ml-1.5 font-semibold text-ink3">{pct(e.n, o.viram)}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-sf2">
              <div
                className="h-full rounded-full bg-brasa-500"
                style={{ width: o.viram ? `${(e.n / o.viram) * 100}%` : 0 }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Numero rotulo="Ignoraram" valor={o.ignoraram} sub={pct(o.ignoraram, o.viram)} />
        <Numero rotulo="Fecharam o card" valor={o.fecharam} sub={pct(o.fecharam, o.viram)} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-extrabold">Por turma</h3>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink3">
                <th className="px-1 py-1.5 font-bold">Turma</th>
                <th className="px-1 py-1.5 text-right font-bold">Viram</th>
                <th className="px-1 py-1.5 text-right font-bold">Comprar</th>
                <th className="px-1 py-1.5 text-right font-bold">Taxa</th>
                <th className="px-1 py-1.5 text-right font-bold">Fecharam</th>
              </tr>
            </thead>
            <tbody>
              {o.porTurma.map((t, i) => (
                <tr key={t.turma} className="border-t border-linha">
                  <td className="px-1 py-2">
                    <span className="block font-semibold">
                      {i === 0 && t.clicaram > 0 && (
                        <span aria-label="Turma que mais foi ao formulário" className="mr-1">
                          🏆
                        </span>
                      )}
                      {t.turma}
                    </span>
                    {t.pessoas > 0 && (
                      <span className="block text-xs text-ink3">
                        {pct(t.viram, t.pessoas)} da turma viu
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{t.viram}</td>
                  <td className="px-1 py-2 text-right font-extrabold tabular-nums">
                    {t.clicaram}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{pct(t.clicaram, t.viram)}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{t.fecharam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {o.cliquesPorDia.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-extrabold">Quem foi ao formulário, por dia</h3>
          <ul className="flex flex-col gap-1.5">
            {o.cliquesPorDia.map((d) => (
              <li key={d.dia} className="flex items-center gap-2 text-[13px]">
                <span className="w-[52px] shrink-0 tabular-nums text-ink2">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sf2">
                  <span
                    className="block h-full rounded-full bg-brasa-500"
                    style={{ width: `${(d.pessoas / maxDia) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right font-extrabold tabular-nums">
                  {d.pessoas}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: number; sub: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-chip px-3 py-2.5">
      <span className="text-xs font-bold text-ink3">{rotulo}</span>
      <span className="text-[22px] font-extrabold leading-tight tabular-nums">
        {valor}
        <span className="ml-1.5 text-[13px] font-semibold text-ink3">{sub}</span>
      </span>
    </div>
  )
}
