import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { combinaBusca } from '../lib/busca'
import { parseConvidadosCSV } from '../lib/csvConvidados'
import { formatTelefone } from '../lib/phone'
import type { Challenge, ConvidadoDesafio, Profile } from '../lib/types'
import { Avatar } from './Avatar'
import { Spinner } from './Spinner'
import { BotaoAcao, Folha, Segmentado } from './ui'

/** Quantas linhas aparecem antes do "Mostrar todos". */
const LINHAS_INICIAIS = 15

type Aba = 'conta' | 'espera'

/**
 * Gestão de participantes de um desafio de entrada restrita (evento
 * pago): a organização adiciona um a um ou importa a lista de ingressos.
 *
 * Quem está na lista mas ainda não tem conta fica como "convidado" — a
 * festa é aberta ao público, então nem todo comprador é do projeto. Ele
 * entra sozinho no desafio quando criar a conta com aquele telefone.
 *
 * A lista chega a dezenas de pessoas (o Forró na Rep passou de 80), então
 * cada linha é uma linha só: as ações (presença, remover) moram numa
 * folha que abre ao tocar na pessoa, em vez de botões repetidos em todas.
 */
export function ParticipantesDesafio({
  desafio,
  onMudou,
}: {
  desafio: Challenge
  onMudou: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const inputArquivo = useRef<HTMLInputElement>(null)

  const [perfis, setPerfis] = useState<Profile[] | null>(null)
  const [membros, setMembros] = useState<Set<string>>(new Set())
  const [convidados, setConvidados] = useState<ConvidadoDesafio[]>([])
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState<Aba>('conta')
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])
  // Desafio de ingresso: quem tem check-in na festa (presença automática)
  // e as correções manuais da organização (user_id -> esteve)
  const [comCheckin, setComCheckin] = useState<Set<string>>(new Set())
  const [correcoes, setCorrecoes] = useState<Map<string, boolean>>(new Map())
  const [salvando, setSalvando] = useState(false)
  // Pessoa aberta na folha de ações
  const [aberto, setAberto] = useState<Profile | null>(null)
  const [convAberto, setConvAberto] = useState<ConvidadoDesafio | null>(null)
  const ehIngresso = desafio.ingresso != null

  const carregar = async () => {
    const [todos, ranking, convites, corrigidos] = await Promise.all([
      api.listProfiles(),
      api.getRanking(desafio, 'checkin'),
      api.listConvidados(desafio.id),
      ehIngresso
        ? api.correcoesPresencaIngresso(desafio.id)
        : Promise.resolve(new Map<string, boolean>()),
    ])
    setPerfis(todos)
    setMembros(new Set(ranking.map((r) => r.user_id)))
    setComCheckin(new Set(ranking.filter((r) => r.pontos > 0).map((r) => r.user_id)))
    setCorrecoes(corrigidos)
    setConvidados(convites)
  }

  // Grava só a pessoa mexida: sem recarregar a lista inteira
  const corrigirPresenca = async (userId: string, esteve: boolean | null) => {
    setSalvando(true)
    try {
      await api.marcarPresencaIngresso(desafio.id, userId, esteve)
      setCorrecoes((atual) => {
        const novo = new Map(atual)
        if (esteve === null) novo.delete(userId)
        else novo.set(userId, esteve)
        return novo
      })
      onMudou()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  useEffect(() => {
    void carregar().catch((e) => toast((e as Error).message, 'erro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desafio.id])

  const participantes = useMemo(
    () => (perfis ?? []).filter((p) => membros.has(p.id)),
    [perfis, membros],
  )

  // A mesma busca filtra a lista da aba e sugere quem adicionar
  const filtrados = useMemo(
    () =>
      busca.trim()
        ? participantes.filter((p) => combinaBusca(busca, [p.nome, p.telefone]))
        : participantes,
    [participantes, busca],
  )
  const convFiltrados = useMemo(
    () =>
      busca.trim()
        ? convidados.filter((c) => combinaBusca(busca, [c.nome, c.telefone_exibicao, c.telefone]))
        : convidados,
    [convidados, busca],
  )
  const candidatos = useMemo(() => {
    if (!perfis || !busca.trim()) return []
    return perfis
      .filter((p) => !membros.has(p.id))
      .filter((p) => combinaBusca(busca, [p.nome, p.telefone]))
      .slice(0, 5)
  }, [perfis, membros, busca])

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true)
    try {
      await acao()
      await carregar()
      onMudou()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const importar = async (file: File | undefined) => {
    if (!file) return
    const texto = await file.text()
    const { linhas, avisos: problemas } = parseConvidadosCSV(texto)
    setAvisos(problemas)
    if (linhas.length === 0) {
      toast('Nenhuma linha válida no arquivo', 'erro')
      return
    }
    await executar(async () => {
      const r = await api.importarConvidados(desafio.id, linhas)
      const partes = [`${r.adicionados} adicionados`]
      if (r.pendentes > 0) partes.push(`${r.pendentes} sem conta ainda`)
      if (r.jaEstavam > 0) partes.push(`${r.jaEstavam} já estavam`)
      toast(`Lista importada: ${partes.join(', ')} 🎟️`)
    })
  }

  if (perfis === null) return <Spinner texto="Carregando participantes…" />

  const presente = (id: string) => correcoes.get(id) ?? comCheckin.has(id)
  const lista = aba === 'conta' ? filtrados : convFiltrados
  const visiveis = mostrarTodos || busca.trim() ? lista.length : LINHAS_INICIAIS

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold">🎟️ Participantes</h3>
        <p className="text-[11px] text-tinta-500">
          {ehIngresso
            ? 'A lista vem da planilha de ingressos. Toque numa pessoa para corrigir a presença ou remover.'
            : 'Desafio de entrada restrita: só quem você adicionar aqui participa.'}
        </p>
      </div>

      <Segmentado<Aba>
        valor={aba}
        onChange={(v) => {
          setAba(v)
          setMostrarTodos(false)
        }}
        opcoes={[
          { valor: 'conta', rotulo: `Com conta (${participantes.length})` },
          { valor: 'espera', rotulo: `Esperando conta (${convidados.length})` },
        ]}
      />

      <input
        className="input"
        placeholder={aba === 'conta' ? 'Buscar ou adicionar pessoa…' : 'Buscar na espera…'}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {aba === 'conta' && candidatos.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-tinta-500">
            Adicionar ao desafio
          </p>
          <ul className="space-y-1">
            {candidatos.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl bg-chip px-3 py-2">
                <Avatar nome={p.nome} url={p.avatar_url} tamanho={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
                <button
                  className="btn-ghost shrink-0 px-3 py-1 text-xs"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      await api.addMembroDesafio(desafio.id, p.id)
                      setBusca('')
                      toast(`${p.nome} entrou no desafio 🎟️`)
                    })
                  }
                >
                  Adicionar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="rounded-xl bg-chip px-3 py-4 text-center text-xs text-tinta-500">
          {busca.trim()
            ? 'Ninguém com esse nome aqui.'
            : aba === 'conta'
              ? 'Ninguém com conta no desafio ainda.'
              : 'Ninguém esperando criar conta.'}
        </p>
      ) : (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl bg-chip">
          {aba === 'conta'
            ? filtrados.slice(0, visiveis).map((p) => {
                const corrigido = correcoes.has(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setAberto(p)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
                    >
                      <Avatar nome={p.nome} url={p.avatar_url} tamanho={28} />
                      <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
                      {ehIngresso && (
                        <span
                          className="shrink-0 text-base"
                          title={
                            (presente(p.id) ? 'Marcou presença' : 'Ingresso garantido') +
                            (corrigido ? ' (corrigido à mão)' : '')
                          }
                        >
                          {presente(p.id) ? '🎉' : '🎟️'}
                          {corrigido && <span className="ml-0.5 align-super text-[9px]">✋</span>}
                        </span>
                      )}
                      <span aria-hidden className="shrink-0 text-tinta-500">›</span>
                    </button>
                  </li>
                )
              })
            : convFiltrados.slice(0, visiveis).map((c) => (
                <li key={c.telefone}>
                  <button
                    type="button"
                    onClick={() => setConvAberto(c)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.nome || 'Sem nome'}</span>
                      <span className="block text-[11px] text-tinta-500">
                        {telefoneDoConvite(c)}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-tinta-500">›</span>
                  </button>
                </li>
              ))}
        </ul>
      )}

      {lista.length > visiveis && (
        <button className="btn-ghost w-full text-xs" onClick={() => setMostrarTodos(true)}>
          Mostrar todos ({lista.length})
        </button>
      )}

      {aba === 'espera' && convidados.length > 0 && (
        <p className="text-[11px] text-tinta-500">
          Entram no desafio sozinhos assim que criarem a conta com esse telefone.
        </p>
      )}

      {/* Desafio de ingresso: quem manda a lista é a planilha, então o
          CSV manual só confundiria (e a planilha desfaria). */}
      {!ehIngresso && (
        <div>
          <input
            ref={inputArquivo}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void importar(e.target.files?.[0])}
          />
          <button
            className="btn-ghost w-full"
            disabled={ocupado}
            onClick={() => inputArquivo.current?.click()}
          >
            📄 Importar lista de ingressos (CSV)
          </button>
          <p className="mt-1 text-[11px] text-tinta-500">
            Colunas: nome e telefone. Quem já tem conta entra na hora; quem não tem fica na
            espera e entra ao se cadastrar.
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-brasa-500/10 px-3 py-2 text-[11px] text-or-t">
          {avisos.slice(0, 8).map((a) => (
            <li key={a}>{a}</li>
          ))}
          {avisos.length > 8 && <li>…e mais {avisos.length - 8}</li>}
        </ul>
      )}

      {/* Folha de quem tem conta: presença (só no desafio de ingresso) e remover */}
      <Folha aberta={aberto !== null} onFechar={() => setAberto(null)} titulo={aberto?.nome}>
        {aberto && (
          <div className="space-y-4 px-5 pb-5">
            {ehIngresso && (
              <div className="space-y-2">
                <p className="text-sm text-ink2">
                  {presente(aberto.id) ? '🎉 Marcou presença' : '🎟️ Ingresso garantido'}
                  {correcoes.has(aberto.id) ? ' · corrigido à mão' : ''}
                </p>
                <Segmentado<'auto' | 'esteve' | 'nao'>
                  valor={
                    !correcoes.has(aberto.id)
                      ? 'auto'
                      : correcoes.get(aberto.id)
                        ? 'esteve'
                        : 'nao'
                  }
                  onChange={(v) => {
                    if (salvando) return
                    void corrigirPresenca(aberto.id, v === 'auto' ? null : v === 'esteve')
                  }}
                  opcoes={[
                    { valor: 'auto', rotulo: 'Automático' },
                    { valor: 'esteve', rotulo: 'Esteve lá' },
                    { valor: 'nao', rotulo: 'Não esteve' },
                  ]}
                />
                <p className="text-[11px] text-tinta-500">
                  Automático = conta o check-in no horário da festa.
                </p>
              </div>
            )}
            <BotaoAcao
              cor="claro"
              bloco
              disabled={ocupado}
              onClick={() => {
                const p = aberto
                if (
                  ehIngresso &&
                  !window.confirm(
                    `Remover ${p.nome}? Se a pessoa continuar na planilha, ela volta na próxima sincronização.`,
                  )
                )
                  return
                setAberto(null)
                void executar(async () => {
                  await api.removeMembroDesafio(desafio.id, p.id)
                  toast(`${p.nome} saiu do desafio`)
                })
              }}
            >
              Remover do desafio
            </BotaoAcao>
          </div>
        )}
      </Folha>

      {/* Folha de quem ainda não tem conta */}
      <Folha
        aberta={convAberto !== null}
        onFechar={() => setConvAberto(null)}
        titulo={convAberto?.nome || 'Sem nome'}
      >
        {convAberto && (
          <div className="space-y-4 px-5 pb-5">
            <p className="text-sm text-ink2">
              {telefoneDoConvite(convAberto)} · ainda não criou conta. Entra no desafio sozinho ao
              se cadastrar com esse telefone.
            </p>
            <BotaoAcao
              cor="claro"
              bloco
              disabled={ocupado}
              onClick={() => {
                const c = convAberto
                setConvAberto(null)
                void executar(async () => {
                  await api.removeConvidado(desafio.id, c.telefone)
                  toast('Convite removido')
                })
              }}
            >
              Remover da espera
            </BotaoAcao>
          </div>
        )}
      </Folha>
    </div>
  )
}

/**
 * O telefone como veio da planilha ou do CSV: é o que a organização
 * reconhece. Formatar o valor salvo (só dígitos) cortava números com
 * código de país e mostrava coisas como "598403-2869".
 */
function telefoneDoConvite(c: ConvidadoDesafio): string {
  return c.telefone_exibicao?.trim() || formatTelefone(c.telefone)
}
