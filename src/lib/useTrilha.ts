import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { diaDaNoite } from './dates'
import { podeEditarTrilha, REGRAS_PADRAO, saldoDeChaves, type ContextoTrilha, type SaldoChaves } from './trilha'
import type { AulaSemVideo, Challenge, PassoTrilha, PerfilResumo } from './types'
import { equipeEfetiva, lerVerComoAluno, salvarVerComoAluno } from './verComoAluno'

export interface DadosTrilha {
  ctx: ContextoTrilha
  saldo: SaldoChaves
  /** Foto e nome dos professores dos passos, por id. */
  professores: Map<string, PerfilResumo>
  /** Pode editar a trilha (organização/professores), mesmo vendo como aluno. */
  equipeReal: boolean
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
  const [comoAluno, setComoAluno] = useState(lerVerComoAluno)

  const carregar = useCallback(async () => {
    if (!userId || !profile) return
    try {
      const [passos, turmas, eventos, feriados, liberacoes, desafios, regras, semVideo] = await Promise.all([
        api.listPassosTrilha(),
        api.listTurmas(),
        api.listEvents(),
        api.listFeriados(),
        api.minhasLiberacoes(),
        api.listChallenges().catch(() => [] as Challenge[]),
        api.regrasTrilha().catch(() => ({ ...REGRAS_PADRAO })),
        api.listAulasSemVideo().catch(() => [] as AulaSemVideo[]),
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
      const equipeReal = podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino })
      setDados({
        equipeReal,
        professores: new Map(perfis.map((p) => [p.id, p])),
        desafio: principal ? { titulo: principal.titulo, ...pontos } : null,
        ctx: {
          passos,
          turmas,
          minhasTurmas: profile.turmas.map((t) => t.turma),
          eventos,
          feriados,
          semVideo,
          liberadas: new Set(liberacoes.map((l) => l.passo_id)),
          hoje: diaDaNoite(new Date()),
          equipe: equipeEfetiva(equipeReal, comoAluno),
          regras,
        },
        saldo: saldoDeChaves({
          ...pontos,
          // Chaves gastas desde o início do desafio = soma dos preços pagos (1, 2, 4…)
          usadas: principal
            ? liberacoes.filter((l) => l.criado_em >= principal.data_inicio).reduce((soma, l) => soma + l.custo, 0)
            : 0,
          regras,
        }),
      })
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [api, userId, profile, papel, comoAluno])

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

  const verComoAluno = useCallback((ligado: boolean) => {
    salvarVerComoAluno(ligado)
    setComoAluno(ligado)
  }, [])

  return { dados, erro, recarregar: carregar, liberar, comoAluno, verComoAluno }
}
