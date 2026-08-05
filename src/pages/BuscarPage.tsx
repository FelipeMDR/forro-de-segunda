import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { combinaBusca } from '../lib/busca'
import {
  cargoPrincipal,
  emojiCargo,
  turmaLabel,
  type PerfilPublico,
} from '../lib/types'

/**
 * Busca de perfis: acha gente por nome, turma ou cargo.
 *
 * Carrega a lista inteira uma vez e filtra no aparelho — com algumas
 * centenas de alunos isso é leve e o resultado aparece enquanto digita,
 * sem uma ida ao servidor por tecla. E a lista vem sem telefone: é a
 * mesma tela para todo aluno, não faz sentido espalhar o número de
 * ninguém por aí.
 */
export function BuscarPage() {
  const { api, userId } = useAuth()
  const navigate = useNavigate()
  const campo = useRef<HTMLInputElement>(null)

  const [perfis, setPerfis] = useState<PerfilPublico[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let cancelado = false
    void api
      .listPerfisPublicos()
      .then((r) => {
        if (!cancelado) setPerfis(r)
      })
      .catch((e) => {
        if (!cancelado) setErro((e as Error).message || 'Erro desconhecido')
      })
    campo.current?.focus()
    return () => {
      cancelado = true
    }
  }, [api])

  const resultados = useMemo(() => {
    if (!perfis) return []
    return perfis.filter((p) =>
      combinaBusca(busca, [
        p.nome,
        ...p.turmas.map((t) => t.turma),
        ...p.cargos,
      ]),
    )
  }, [perfis, busca])

  if (erro) return <ErrorState erro={erro} onRetry={() => navigate(0)} />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Buscar pessoas 🔎</h1>

      <input
        ref={campo}
        className="input"
        type="search"
        placeholder="Nome, turma ou cargo…"
        aria-label="Buscar pessoas"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {perfis === null ? (
        <Spinner texto="Carregando pessoas…" />
      ) : resultados.length === 0 ? (
        <EmptyState
          emoji="🤷"
          titulo="Ninguém encontrado"
          texto={`Nada casou com "${busca.trim()}". Tente outro nome ou uma turma.`}
        />
      ) : (
        <>
          <p className="text-xs text-stone-500">
            {resultados.length}{' '}
            {resultados.length === 1 ? 'pessoa' : 'pessoas'}
          </p>
          <ul className="card divide-y divide-white/5">
            {resultados.map((p) => {
              const cargo = cargoPrincipal(p.cargos)
              const turmas = turmaLabel(p.turmas)
              return (
                <li key={p.id}>
                  <Link
                    to={p.id === userId ? '/perfil' : `/perfil/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar nome={p.nome} url={p.avatar_url} tamanho={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-extrabold">
                          {p.nome}
                          {p.id === userId && (
                            <span className="text-brasa-400"> (você)</span>
                          )}
                        </p>
                        {cargo && (
                          <span className="shrink-0 rounded-full bg-brasa-500/20 px-2 py-0.5 text-[10px] font-extrabold text-brasa-300 ring-1 ring-brasa-500/30">
                            {emojiCargo(cargo)} {cargo}
                          </span>
                        )}
                      </div>
                      {turmas && (
                        <p className="truncate text-xs text-stone-500">
                          {turmas}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-stone-600">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
