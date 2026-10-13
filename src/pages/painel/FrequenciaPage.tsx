import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icone } from '../../components/Icone'
import { Spinner } from '../../components/Spinner'
import { Cabecalho, CampoBusca, ChipEscolha, Segmentado } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { horaCurta } from '../../context/NoiteContext'
import { useToast } from '../../context/ToastContext'
import { downloadCSV } from '../../lib/csv'
import { diaDaNoite, diasSuspensos, formatDate, mapaAberturas, toISODate } from '../../lib/dates'
import { janelaDaPresenca } from '../../lib/presenca'
import type { AttendanceRow } from '../../lib/types'
import { Dica, usePainel } from './contexto'

type Aba = 'resumo' | 'tabela' | 'revisao' | 'exportar'

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number)
  return { inicio: `${mes}-01`, fim: toISODate(new Date(ano, m, 0)) }
}

/** Os últimos quatro meses, do mais antigo ao atual ("2026-07"…). */
function ultimosMeses(): string[] {
  const hoje = new Date()
  return [3, 2, 1, 0].map((k) => toISODate(new Date(hoje.getFullYear(), hoje.getMonth() - k, 1)).slice(0, 7))
}

function nomeMes(mes: string, longo = false): string {
  const d = new Date(`${mes}-15T12:00:00`)
  const s = d.toLocaleDateString('pt-BR', { month: longo ? 'long' : 'short' }).replace('.', '')
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * Frequência do mês. Só conta presença o check-in que marcou ponto em
 * algum desafio rodando na hora — dentro da janela e, quando o desafio
 * exige, no local — e vale 1 por janela por pessoa, mesmo com várias
 * fotos ou se a janela virar a noite. É a mesma regra do perfil e do
 * ranking (`lib/presenca.ts`); a planilha não pode discordar deles.
 */
export function FrequenciaPage() {
  const { api } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba | null) ?? 'resumo'
  const { desafios, feriados, aberturas } = usePainel()
  const meses = ultimosMeses()
  const [mes, setMes] = useState(meses[meses.length - 1])
  const [presencas, setPresencas] = useState<AttendanceRow[] | null>(null)
  const [busca, setBusca] = useState('')
  const [noite, setNoite] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(
    async (m: string) => {
      const { inicio, fim } = limitesDoMes(m)
      setPresencas(await api.getAttendance(inicio, fim))
    },
    [api],
  )
  useEffect(() => {
    setPresencas(null)
    void carregar(mes).catch((e) => toast((e as Error).message, 'erro'))
  }, [carregar, mes, toast])

  // Só o primeiro check-in válido de cada janela, por pessoa, marca ponto.
  // `presencas` vem do mais novo para o mais antigo: percorre ao contrário.
  const { pontuados, janelaDe } = useMemo(() => {
    const regras = {
      desafios,
      suspensos: diasSuspensos(feriados),
      aberturas: mapaAberturas(aberturas),
    }
    const vistas = new Set<string>()
    const pontuados = new Set<string>()
    const janelaDe = new Map<string, string>()
    for (const p of [...(presencas ?? [])].reverse()) {
      const janela = janelaDaPresenca(
        { criado_em: p.data, locais: p.locais, presencaAnulada: p.presencaAnulada },
        regras,
      )
      if (!janela) continue
      const chave = `${p.nome}|${janela}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      pontuados.add(p.id)
      janelaDe.set(p.id, janela)
    }
    return { pontuados, janelaDe }
  }, [presencas, desafios, feriados, aberturas])

  const validas = (presencas ?? []).filter((p) => pontuados.has(p.id))
  const noitesComPresenca = new Set([...janelaDe.values()]).size
  const anuladas = (presencas ?? []).filter((p) => p.presencaAnulada).length

  // Noites com fotos, da mais recente para a mais antiga (revisão)
  const porNoite = useMemo(() => {
    const m = new Map<string, AttendanceRow[]>()
    for (const p of presencas ?? []) {
      const n = diaDaNoite(new Date(p.data))
      m.set(n, [...(m.get(n) ?? []), p])
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [presencas])
  const noiteAtiva = noite && porNoite.some(([n]) => n === noite) ? noite : (porNoite[0]?.[0] ?? null)

  const anular = async (p: AttendanceRow) => {
    setOcupado(p.id)
    try {
      await api.anularPresenca(p.id, !p.presencaAnulada)
      await carregar(mes)
      toast(
        p.presencaAnulada
          ? `Presença de ${p.nome.split(' ')[0]} vale de novo`
          : `Presença de ${p.nome.split(' ')[0]} anulada — a foto continua no feed`,
      )
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  // Tabela: presenças válidas por pessoa no mês
  const porAluno = useMemo(() => {
    const m = new Map<string, { nome: string; turma: string; n: number }>()
    for (const p of validas) {
      const atual = m.get(p.nome) ?? { nome: p.nome, turma: p.turma, n: 0 }
      atual.n++
      m.set(p.nome, atual)
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presencas, pontuados])
  const maior = porAluno[0]?.n ?? 1

  // Média por noite em cada turma (a turma do rótulo da pessoa)
  const porTurma = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of validas) {
      for (const t of (p.turma || 'Sem turma').split(/\s*·\s*|,\s*/)) {
        const nome = t.replace(/\s*\(.*\)$/, '').trim() || 'Sem turma'
        m.set(nome, (m.get(nome) ?? 0) + 1)
      }
    }
    return [...m.entries()]
      .map(([t, n]) => ({ t, media: noitesComPresenca ? n / noitesComPresenca : 0 }))
      .sort((a, b) => b.media - a.media)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presencas, pontuados, noitesComPresenca])
  const maiorMedia = porTurma[0]?.media || 1

  const exportarLinhas = () => {
    if (!presencas) return
    downloadCSV(
      `presencas-${mes}`,
      ['Data', 'Hora', 'Nome', 'Turma', 'ValeuPonto'],
      presencas.map((p) => {
        const d = new Date(p.data)
        return [
          d.toLocaleDateString('pt-BR'),
          d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          p.nome,
          p.turma,
          pontuados.has(p.id) ? 'sim' : 'não',
        ]
      }),
    )
  }
  const exportarPorAluno = () => {
    downloadCSV(
      `frequencia-por-aluno-${mes}`,
      ['Nome', 'Turma', 'Presenças'],
      porAluno.map((a) => [a.nome, a.turma, String(a.n)]),
    )
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Frequência" sobretitulo="Painel" fallback="/organizador" />
      <Segmentado
        className="mx-4 mb-1 mt-3 [&_button]:px-1 [&_button]:text-sm"
        valor={aba}
        onChange={(v) => setParams({ aba: v }, { replace: true })}
        opcoes={[
          { valor: 'resumo', rotulo: 'Resumo' },
          { valor: 'tabela', rotulo: 'Tabela' },
          { valor: 'revisao', rotulo: 'Revisão' },
          { valor: 'exportar', rotulo: 'Exportar' },
        ]}
      />
      <div className="sem-barra flex gap-2 overflow-x-auto px-4 pt-2.5">
        {meses.map((m) => (
          <ChipEscolha key={m} ativo={mes === m} cor="preto" onClick={() => setMes(m)}>
            {nomeMes(m)}
          </ChipEscolha>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3">
        {presencas === null ? (
          <Spinner />
        ) : aba === 'resumo' ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { l: 'Noites no mês', v: noitesComPresenca },
                { l: 'Presenças válidas', v: validas.length },
                { l: 'Média por noite', v: noitesComPresenca ? Math.round(validas.length / noitesComPresenca) : 0 },
                { l: 'Anuladas', v: anuladas, cor: 'text-or-t' },
              ].map((m) => (
                <div key={m.l} className="flex flex-col gap-0.5 rounded-[18px] border border-linha bg-sf p-3.5">
                  <span className="text-[13px] font-bold text-ink3">{m.l}</span>
                  <span className={`text-[28px] font-extrabold ${m.cor ?? ''}`}>{m.v}</span>
                </div>
              ))}
            </div>
            <Dica>
              {presencas.length} check-ins no mês. Se forem muito mais que as presenças, tem foto
              sendo postada fora de desafio (ou faltou desafio rodando naquela noite).
            </Dica>
            {porTurma.length > 0 && (
              <div className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-3.5">
                <span className="text-[15px] font-extrabold">Média por noite, por turma</span>
                {porTurma.map((b) => (
                  <div key={b.t} className="flex flex-col gap-[5px]">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold">{b.t}</span>
                      <span className="text-ink3">{b.media.toFixed(1).replace('.', ',')} por noite</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-chip">
                      <div className="h-full rounded-full bg-verde-500" style={{ width: `${(b.media / maiorMedia) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : aba === 'tabela' ? (
          <>
            <CampoBusca placeholder="Buscar aluno" aria-label="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="flex justify-between px-1 text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
              <span>Aluno</span>
              <span>Presenças em {nomeMes(mes, true).toLowerCase()}</span>
            </div>
            <div className="overflow-hidden rounded-[18px] border border-linha bg-sf">
              {porAluno
                .filter((a) => !busca.trim() || a.nome.toLowerCase().includes(busca.trim().toLowerCase()))
                .map((a) => (
                  <div key={a.nome} className="flex items-center gap-2.5 border-b border-linha px-3 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-extrabold">{a.nome}</span>
                      <span className="truncate text-xs text-ink3">{a.turma}</span>
                    </div>
                    <div className="h-2 w-[70px] shrink-0 overflow-hidden rounded-full bg-chip">
                      <div className="h-full bg-azul-500" style={{ width: `${(a.n / maior) * 100}%` }} />
                    </div>
                    <span className="w-11 shrink-0 text-right text-[15px] font-extrabold">{a.n}</span>
                  </div>
                ))}
              {porAluno.length === 0 && (
                <p className="p-4 text-center text-sm text-ink3">Nenhuma presença válida neste mês.</p>
              )}
            </div>
          </>
        ) : aba === 'revisao' ? (
          porNoite.length === 0 ? (
            <Dica>Nenhuma foto neste mês.</Dica>
          ) : (
            <Revisao
              noites={porNoite.map(([n]) => n)}
              noiteAtiva={noiteAtiva!}
              onNoite={setNoite}
              fotos={porNoite.find(([n]) => n === noiteAtiva)?.[1] ?? []}
              pontuados={pontuados}
              ocupado={ocupado}
              onAnular={(p) => void anular(p)}
            />
          )
        ) : (
          <>
            <Dica>O arquivo é salvo no aparelho e abre no Planilhas ou no Excel.</Dica>
            {[
              { t: 'Check-ins do mês', s: 'Data, hora, nome, turma e se valeu ponto', f: exportarLinhas },
              { t: 'Presenças por aluno', s: 'Quantas presenças válidas cada pessoa teve', f: exportarPorAluno },
            ].map((x) => (
              <button
                key={x.t}
                type="button"
                disabled={presencas.length === 0}
                onClick={x.f}
                className="flex w-full items-center gap-3.5 rounded-[20px] border border-linha bg-sf p-3.5 text-left text-ink disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-preto bg-azul-300 text-preto">
                  <Icone nome="baixar" tamanho={21} traco={2.3} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-extrabold">{x.t}</span>
                  <span className="text-[13px] text-ink3">{x.s} · {nomeMes(mes, true)}</span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Revisão das fotos de uma noite, lado a lado — o que substituiu a trava
 * de GPS. Fotos do mesmo salão se parecem, e a de fora destoa. Anular
 * tira só o ponto: a foto continua no feed, e dá para desfazer.
 */
function Revisao({
  noites,
  noiteAtiva,
  onNoite,
  fotos,
  pontuados,
  ocupado,
  onAnular,
}: {
  noites: string[]
  noiteAtiva: string
  onNoite: (n: string) => void
  fotos: AttendanceRow[]
  pontuados: Set<string>
  ocupado: string | null
  onAnular: (p: AttendanceRow) => void
}) {
  const ordenadas = [...fotos].sort((a, b) => a.data.localeCompare(b.data))
  const anuladas = fotos.filter((p) => p.presencaAnulada).length
  const validas = fotos.filter((p) => pontuados.has(p.id)).length
  return (
    <>
      <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4">
        {noites.map((n) => (
          <ChipEscolha key={n} ativo={n === noiteAtiva} cor="preto" className="h-9" onClick={() => onNoite(n)}>
            {formatDate(n)}
          </ChipEscolha>
        ))}
      </div>
      <div className="grid grid-cols-3 rounded-[18px] border border-linha bg-sf">
        {[
          { v: fotos.length, l: 'fotos' },
          { v: validas, l: 'presenças' },
          { v: anuladas, l: 'anuladas', cor: 'text-or-t' },
        ].map((m, i) => (
          <div key={m.l} className={`flex flex-col items-center px-1 py-3 ${i > 0 ? 'border-l border-linha' : ''}`}>
            <span className={`text-[22px] font-extrabold ${m.cor ?? ''}`}>{m.v}</span>
            <span className="text-xs text-ink3">{m.l}</span>
          </div>
        ))}
      </div>
      <Dica>Anular tira a presença do desafio. A foto continua no feed, e dá para desfazer depois.</Dica>
      <div className="grid grid-cols-2 gap-2.5">
        {ordenadas.map((p) => (
          <div
            key={p.id}
            className="flex flex-col overflow-hidden rounded-2xl border-[1.5px] bg-sf"
            style={{ borderColor: p.presencaAnulada ? '#B84500' : 'var(--line)' }}
          >
            <div className="relative aspect-[4/5] bg-marinho-500">
              {/* Foto arquivada pela retenção fica sem URL */}
              {p.foto_url ? (
                <img src={p.foto_url} alt={`Check-in de ${p.nome}`} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="listras h-full w-full" />
              )}
              <span className="absolute bottom-2 left-2 rounded bg-preto/60 px-1 font-mono text-[11px] text-branco">
                {horaCurta(new Date(p.data))}
              </span>
              {p.presencaAnulada && (
                <div className="absolute inset-0 flex items-center justify-center bg-preto/70 p-2 text-center text-sm font-extrabold text-brasa-300">
                  Presença anulada
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-extrabold">{p.nome}</span>
                <span className="truncate text-xs text-ink3">
                  {p.turma || 'Sem turma'}
                  {!p.presencaAnulada && (pontuados.has(p.id) ? ' · valeu' : ' · sem ponto')}
                </span>
              </div>
              <button
                type="button"
                disabled={ocupado === p.id}
                onClick={() => onAnular(p)}
                className={`h-11 rounded-xl text-sm font-extrabold disabled:opacity-50 ${
                  p.presencaAnulada
                    ? 'border-2 border-preto bg-brasa-300 text-preto'
                    : 'border-[1.5px] border-linha bg-sf text-ink'
                }`}
              >
                {p.presencaAnulada ? 'Desfazer' : 'Anular presença'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
