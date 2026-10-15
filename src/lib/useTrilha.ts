import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { diaDaNoite, diasSuspensos, mapaAberturas } from './dates'
import { datasDePresenca } from './presenca'
import { podeEditarTrilha, REGRAS_PADRAO, saldoDeChaves, type ContextoTrilha, type SaldoChaves } from './trilha'
import type { AberturaAntecipada, Challenge, ParceiroDanca } from './types'

export interface DadosTrilha {
  ctx: ContextoTrilha
  saldo: SaldoChaves
}

/**
 * Tudo o que a trilha precisa, numa carga só. Presença pela MESMA regra
 * do perfil (`datasDePresenca`) — se a trilha contasse diferente, o
 * aluno veria um número no perfil e outro aqui.
 */
export function useTrilha() {
  const { api, userId, profile, papel } = useAuth()
  const [dados, setDados] = useState<DadosTrilha | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!userId || !profile) return
    try {
      const [passos, turmas, eventos, feriados, liberacoes, checkins, desafios, aberturas, parceiros, noitesDupla, desde, regras] =
        await Promise.all([
          api.listPassosTrilha(),
          api.listTurmas(),
          api.listEvents(),
          api.listFeriados(),
          api.minhasLiberacoes(),
          api.checkinsDe(userId),
          api.listChallenges().catch(() => [] as Challenge[]),
          api.listAberturas().catch(() => [] as AberturaAntecipada[]),
          api.parceirosDe(userId).catch(() => [] as ParceiroDanca[]),
          api.noitesComDupla(userId).catch(() => [] as string[]),
          api.inicioSemestreAtual().catch(() => null),
          api.regrasTrilha().catch(() => ({ ...REGRAS_PADRAO })),
        ])
      const presencas = datasDePresenca(checkins, {
        desafios,
        suspensos: diasSuspensos(feriados),
        aberturas: mapaAberturas(aberturas),
      }).map((d) => diaDaNoite(d))
      setDados({
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
          presencas,
          noitesComDupla: noitesDupla,
          parceiros,
          desde,
          usadas: liberacoes.filter((l) => !desde || l.criado_em >= desde).length,
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
    async (passoId: string) => {
      await api.liberarPassoComChave(passoId)
      await carregar()
    },
    [api, carregar],
  )

  return { dados, erro, recarregar: carregar, liberar }
}
