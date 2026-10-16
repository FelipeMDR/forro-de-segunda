import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { diaDaNoite } from './dates'
import { podeEditarTrilha, REGRAS_PADRAO, saldoDeChaves, type ContextoTrilha, type SaldoChaves } from './trilha'
import type { Challenge, PassoTrilha, PerfilResumo } from './types'

export interface DadosTrilha {
  ctx: ContextoTrilha
  saldo: SaldoChaves
  /** Foto e nome dos professores dos passos, por id. */
  professores: Map<string, PerfilResumo>
  /** O desafio principal (Forródex) de onde vêm os pontos; null = nenhum. */
  desafio: { titulo: string; presenca: number; parcerias: number } | null
}

/** Os professores de um passo, na ordem em que foram escolhidos. */
export function professoresDo(passo: PassoTrilha, dados: DadosTrilha): PerfilResumo[] {
  return passo.professores_ids.flatMap((id) => dados.professores.get(id) ?? [])
}

/**
 * Tudo o que a trilha precisa, numa carga só. Os pontos das chaves são os
 * do desafio principal (o da Forródex), com as regras do ranking: o aluno
 * vê o mesmo número aqui e na tela do desafio.
 */
export function useTrilha() {
  const { api, userId, profile, papel } = useAuth()
  const [dados, setDados] = useState<DadosTrilha | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!userId || !profile) return
    try {
      const [passos, turmas, eventos, feriados, liberacoes, desafios, regras] = await Promise.all([
        api.listPassosTrilha(),
        api.listTurmas(),
        api.listEvents(),
        api.listFeriados(),
        api.minhasLiberacoes(),
        api.listChallenges().catch(() => [] as Challenge[]),
        api.regrasTrilha().catch(() => ({ ...REGRAS_PADRAO })),
      ])
      const principal = desafios.find((c) => c.forrodex) ?? null
      // Uma consulta só, com quem aparece como professor em algum passo
      const ids = [...new Set(passos.flatMap((p) => p.professores_ids))]
      const [perfis, pontos] = await Promise.all([
        api.perfisResumo(ids).catch(() => [] as PerfilResumo[]),
        principal
          ? api.pontosNoDesafioDe(principal, userId)
          : Promise.resolve({ presenca: 0, parcerias: 0 }),
      ])
      setDados({
        professores: new Map(perfis.map((p) => [p.id, p])),
        desafio: principal ? { titulo: principal.titulo, ...pontos } : null,
        ctx: {
          passos,
          turmas,
          minhasTurmas: profile.turmas.map((t) => t.turma),
          eventos,
          feriados,
          liberadas: new Set(liberacoes.map((l) => l.passo_id)),
          hoje: diaDaNoite(new Date()),
          equipe: podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino }),
          regras,
        },
        saldo: saldoDeChaves({
          ...pontos,
          // Chaves gastas desde o início do desafio = soma dos preços pagos (1, 2, 4…)
          usadas: principal
            ? liberacoes.filter((l) => l.criado_em >= principal.data_inicio).reduce((soma, l) => soma + l.custo, 0)
            : 0,
          pontosPorChave: regras.pontos_por_chave,
        }),
      })
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [api, userId, profile, papel])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const liberar = useCallback(
    async (passoId: string, custo: number) => {
      await api.liberarPassoComChave(passoId, custo)
      await carregar()
    },
    [api, carregar],
  )

  return { dados, erro, recarregar: carregar, liberar }
}
