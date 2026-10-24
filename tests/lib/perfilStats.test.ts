import { describe, expect, it } from 'vitest'
import type { ForroApi } from '../../src/lib/api'
import { carregarPerfilStats } from '../../src/lib/perfilStats'

/** Só o que o carregarPerfilStats pede, tudo vazio. */
const apiVazia = {
  inicioSemestreAtual: async () => null,
  parceirosDe: async () => [],
  checkinsDe: async () => [],
  contarDesafios: async () => 0,
  distintivosDe: async () => [],
  listChallenges: async () => [],
  listFeriados: async () => [],
  listAberturas: async () => [],
  musicasTocadasDe: async () => 0,
  listPerfisPublicos: async () => [],
  listTurmas: async () => [],
  cacaCongeladaDe: async () => [],
} as unknown as ForroApi

const convite = async (papelPrincipal: 'Condutor(a)' | null | undefined) => {
  const { badges } = await carregarPerfilStats(apiVazia, 'u', [], [], {
    papelPrincipal,
    proprio: true,
  })
  return badges.filter((b) => b.caca?.abrirFuncao)
}

describe('carregarPerfilStats — função na dança', () => {
  it('sem turma e sem função: convida a escolher', async () => {
    expect(await convite(null)).toHaveLength(1)
  })

  it('função indisponível (banco sem a migração 041): não convida', async () => {
    expect(await convite(undefined)).toEqual([])
  })
})
