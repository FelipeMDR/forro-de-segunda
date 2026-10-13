import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { CampoBusca, LinhaPessoa, RotuloSecao, useVoltar, BotaoIcone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { combinaBusca } from '../lib/busca'
import { ordenarTurmas } from '../lib/forrodex'
import {
  cargoPrincipal,
  ehEquipeDoProjeto,
  turmaLabel,
  type PerfilPublico,
} from '../lib/types'

/** Grupos da equipe, na ordem em que aparecem sem busca. */
const GRUPOS: Array<[string, (cargo: string) => boolean]> = [
  ['Presidência', (c) => c.includes('presid')],
  ['Diretoria', (c) => c.includes('diretor')],
  ['Professores', (c) => c.includes('profess')],
  ['Monitores', (c) => c.includes('monitor')],
  ['DJs', (c) => c === 'dj'],
]

function grupoDe(cargo: string | null): string {
  const c = (cargo ?? '').toLowerCase()
  return GRUPOS.find(([, combina]) => combina(c))?.[0] ?? 'Equipe'
}

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
  const voltar = useVoltar('/')
  const campo = useRef<HTMLInputElement>(null)

  const [perfis, setPerfis] = useState<PerfilPublico[] | null>(null)
  const [turmas, setTurmas] = useState<string[]>([])
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
    void api
      .listTurmas()
      .then((t) => !cancelado && setTurmas(ordenarTurmas(t.map((x) => x.nome))))
      .catch(() => {})
    campo.current?.focus()
    return () => {
      cancelado = true
    }
  }, [api])

  const termo = busca.trim()

  // Sem busca, mostra só a equipe do projeto, agrupada por cargo: listar
  // todo mundo deixa de caber conforme ele cresce, e é a equipe que se
  // procura sem saber o nome. Digitando, a busca vale para todos.
  const grupos = useMemo(() => {
    if (!perfis) return []
    if (termo) {
      const achados = perfis
        .filter((p) =>
          combinaBusca(termo, [p.nome, ...p.turmas.map((t) => t.turma), ...p.cargos]),
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      return [{ rotulo: '', pessoas: achados }]
    }
    const equipe = perfis.filter((p) => ehEquipeDoProjeto(p.cargos))
    const porGrupo = new Map<string, PerfilPublico[]>()
    for (const p of equipe) {
      const g = grupoDe(cargoPrincipal(p.cargos))
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), p])
    }
    return [...GRUPOS.map(([g]) => g), 'Equipe']
      .filter((g) => porGrupo.has(g))
      .map((g) => ({
        rotulo: g,
        pessoas: porGrupo.get(g)!.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
  }, [perfis, termo])

  const total = grupos.reduce((n, g) => n + g.pessoas.length, 0)

  if (erro) {
    return (
      <div className="px-4 pt-14">
        <ErrorState erro={erro} onRetry={() => navigate(0)} />
      </div>
    )
  }

  return (
    <div className="anima-tela">
      <div className="flex items-center gap-1 pb-3 pl-2 pr-4 pt-1">
        <BotaoIcone icone="voltar" rotulo="Voltar" onClick={voltar} />
        <CampoBusca
          ref={campo}
          className="flex-1"
          placeholder="Nome, turma ou cargo"
          aria-label="Buscar pessoas"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {turmas.length > 0 && (
        <div className="sem-barra flex gap-2 overflow-x-auto px-4 pb-3">
          {turmas.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBusca(t)}
              className="h-[38px] shrink-0 rounded-full border-[1.5px] border-linha bg-sf px-3.5 text-sm font-bold text-ink"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {perfis === null ? (
        <Spinner texto="Carregando pessoas…" />
      ) : (
        <>
          <div className="px-5 pb-1.5">
            <RotuloSecao className="px-0 tracking-[.06em]">
              {termo
                ? `${total} ${total === 1 ? 'pessoa' : 'pessoas'}`
                : 'Equipe do projeto'}
            </RotuloSecao>
          </div>
          <div className="px-3">
            {grupos.map((g) => (
              <div key={g.rotulo || 'busca'}>
                {g.rotulo && (
                  <div className="px-2 pb-1 pt-3.5 text-[15px] font-extrabold">{g.rotulo}</div>
                )}
                {g.pessoas.map((p) => {
                  const cargo = cargoPrincipal(p.cargos)
                  return (
                    <LinhaPessoa
                      key={p.id}
                      onClick={() => navigate(p.id === userId ? '/perfil' : `/perfil/${p.id}`)}
                      avatar={<Avatar nome={p.nome} url={p.avatar_url} tamanho={44} />}
                      nome={p.id === userId ? `${p.nome} (você)` : p.nome}
                      sub={[cargo, turmaLabel(p.turmas)].filter(Boolean).join(' · ') || undefined}
                    />
                  )
                })}
              </div>
            ))}
            {termo && total === 0 && (
              <div className="px-2 py-7 text-center text-[15px] text-ink3">
                Ninguém encontrado com “{termo}”.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
