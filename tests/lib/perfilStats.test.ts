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
  destaquesDe: async () => null,
  ingressosDoPerfil: async () => [],
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

describe('carregarPerfilStats — ingresso', () => {
  const linha = {
    desafio_id: 'X',
    titulo: 'Forró na Rep',
    estado: 'garantido' as const,
    emoji: '🎟️',
    titulo_distintivo: 'Ingresso garantido',
    desde: null,
    evento_data: '2026-12-05',
  }

  it('traz o distintivo de ingresso', async () => {
    const api = { ...apiVazia, ingressosDoPerfil: async () => [linha] } as unknown as ForroApi
    const { badges } = await carregarPerfilStats(api, 'u', [], [])
    expect(badges.map((b) => b.id)).toContain('ingresso-X')
  })

  it('falha no ingresso não quebra o perfil', async () => {
    const api = {
      ...apiVazia,
      ingressosDoPerfil: async () => {
        throw new Error('sem a migração 043')
      },
    } as unknown as ForroApi
    const { badges } = await carregarPerfilStats(api, 'u', [], [])
    expect(badges.some((b) => b.id.startsWith('ingresso-'))).toBe(false)
  })
})