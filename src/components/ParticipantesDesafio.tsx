import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { combinaBusca } from '../lib/busca'
import { parseConvidadosCSV } from '../lib/csvConvidados'
import { formatTelefone } from '../lib/phone'
import type { Challenge, ConvidadoDesafio, Profile } from '../lib/types'
import { Avatar } from './Avatar'
import { Spinner } from './Spinner'

/**
 * Gestão de participantes de um desafio de entrada restrita (evento
 * pago): a organização adiciona um a um ou importa a lista de ingressos.
 *
 * Quem está na lista mas ainda não tem conta fica como "convidado" — a
 * festa é aberta ao público, então nem todo comprador é do projeto. Ele
 * entra sozinho no desafio quando criar a conta com aquele telefone.
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
  const [ocupado, setOcupado] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])

  const carregar = async () => {
    const [todos, ranking, convites] = await Promise.all([
      api.listProfiles(),
      api.getRanking(desafio),
      api.listConvidados(desafio.id),
    ])
    setPerfis(todos)
    setMembros(new Set(ranking.map((r) => r.user_id)))
    setConvidados(convites)
  }

  useEffect(() => {
    void carregar().catch((e) => toast((e as Error).message, 'erro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desafio.id])

  const participantes = useMemo(
    () => (perfis ?? []).filter((p) => membros.has(p.id)),
    [perfis, membros],
  )

  // Só quem ainda não está dentro aparece para adicionar
  const candidatos = useMemo(() => {
    if (!perfis || !busca.trim()) return []
    return perfis
      .filter((p) => !membros.has(p.id))
      .filter((p) => combinaBusca(busca, [p.nome, p.telefone]))
      .slice(0, 8)
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold">
          🎟️ Participantes ({participantes.length})
        </h3>
        <p className="text-[11px] text-tinta-500">
          Este desafio é de entrada restrita: só quem você adicionar aqui
          participa.
        </p>
      </div>

      <div>
        <input
          className="input"
          placeholder="Buscar aluno por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca.trim() && (
          <ul className="mt-2 space-y-1">
            {candidatos.length === 0 ? (
              <li className="px-1 text-xs text-tinta-500">
                Ninguém novo com esse nome. Se a pessoa não tem conta,
                importe pelo CSV — ela entra sozinha ao se cadastrar.
              </li>
            ) : (
              candidatos.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl bg-fundo px-3 py-2"
                >
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.nome}
                  </span>
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
              ))
            )}
          </ul>
        )}
      </div>

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
          Colunas: nome e telefone. Quem já tem conta entra na hora; quem
          não tem fica na espera e entra ao se cadastrar.
        </p>
      </div>

      {avisos.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
          {avisos.slice(0, 8).map((a) => (
            <li key={a}>{a}</li>
          ))}
          {avisos.length > 8 && <li>…e mais {avisos.length - 8}</li>}
        </ul>
      )}

      {participantes.length > 0 && (
        <ul className="divide-y divide-preto/10 rounded-xl bg-fundo">
          {participantes.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <Avatar nome={p.nome} url={p.avatar_url} tamanho={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
              <button
                className="shrink-0 px-2 text-xs font-bold text-red-600"
                disabled={ocupado}
                onClick={() =>
                  void executar(async () => {
                    await api.removeMembroDesafio(desafio.id, p.id)
                    toast(`${p.nome} saiu do desafio`)
                  })
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {convidados.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-tinta-500">
            Esperando criar conta ({convidados.length})
          </h4>
          <ul className="divide-y divide-preto/10 rounded-xl bg-fundo">
            {convidados.map((c) => (
              <li
                key={c.telefone}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="text-lg">⏳</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{c.nome || 'Sem nome'}</p>
                  <p className="text-[11px] text-tinta-500">
                    {formatTelefone(c.telefone_exibicao ?? c.telefone)}
                  </p>
                </div>
                <button
                  className="shrink-0 px-2 text-xs font-bold text-red-600"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      await api.removeConvidado(desafio.id, c.telefone)
                      toast('Convite removido')
                    })
                  }
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-tinta-500">
            Elas entram no desafio sozinhas assim que criarem a conta com
            esse telefone.
          </p>
        </div>
      )}
    </div>
  )
}
