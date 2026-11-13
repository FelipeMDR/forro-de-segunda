import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chaveDoConvite, telefonesIguais } from '../../src/lib/phone'
import type { ChallengeInput } from '../../src/lib/types'

/**
 * Convite importado por CSV com celular de 11 dígitos.
 *
 * O bug: o convite era gravado com `normalizeTelefone`, que guarda os 10
 * ÚLTIMOS dígitos — "35988887777" virava "5988887777", ou seja, DDD 59.
 * Como a comparação exige DDD igual quando os dois lados têm DDD
 * (migração 022), o convite nunca casava com a conta criada depois, e a
 * pessoa nunca entrava no desafio.
 */

describe('chaveDoConvite', () => {
  it('celular de 11 dígitos guarda o DDD certo (DDD + linha)', () => {
    expect(chaveDoConvite('35988887777')).toBe('3588887777')
    expect(chaveDoConvite('(35) 98888-7777')).toBe('3588887777')
    expect(chaveDoConvite('35 9 8888-7777')).toBe('3588887777')
  })

  it('número de 10 dígitos (sem o 9) fica igual', () => {
    expect(chaveDoConvite('3588887777')).toBe('3588887777')
  })

  it('a chave casa com o telefone que a pessoa digita no cadastro', () => {
    expect(telefonesIguais(chaveDoConvite('35988887777'), '35988887777')).toBe(true)
    expect(telefonesIguais(chaveDoConvite('35988887777'), '(35) 98888-7777')).toBe(true)
  })

  it('não casa com o mesmo final de linha em outro DDD', () => {
    expect(telefonesIguais(chaveDoConvite('35988887777'), '11988887777')).toBe(false)
  })

  it('a chave já gravada não muda ao passar de novo (remover usa o valor salvo)', () => {
    const chave = chaveDoConvite('35988887777')
    expect(chaveDoConvite(chave)).toBe(chave)
  })
})

function instalarLocalStorage() {
  const dados = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, String(v)),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size
    },
  } as Storage
}

type Banco = {
  db: {
    roles: Record<string, string>
    members: Array<{ challenge_id: string; user_id: string }>
  }
  uid(): string
}

describe('DemoApi — convite importado por CSV vira participação no cadastro', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  const desafio: ChallengeInput = {
    titulo: 'Festa fechada',
    descricao: '',
    data_inicio: '2026-12-01',
    data_fim: '2026-12-31',
    janelas: [{ dia_semana: 6, hora_inicio: '20:00', hora_fim: '23:00' }],
    local: null,
    entrada_restrita: true,
    modalidades: ['checkin'],
    ingresso: null,
  }

  it('celular de 11 dígitos: entra no desafio ao criar a conta e sai da espera', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as Banco
    await api.signInTelefone('11 98888-0001', 'forro123')
    banco.db.roles[banco.uid()] = 'organizador'

    const id = await api.saveChallenge(desafio)
    const r = await api.importarConvidados(id, [
      { nome: 'Pessoa Teste', telefone: '(35) 98777-6655' },
    ])
    expect(r.pendentes).toBe(1)
    const [convite] = await api.listConvidados(id)
    expect(convite.telefone).toBe('3587776655')

    await api.signOut()
    await api.signUpTelefone('35987776655', 'teste@exemplo.com', 'senha123', 'Pessoa Teste')

    const novo = banco.uid()
    expect(
      banco.db.members.some((m) => m.challenge_id === id && m.user_id === novo),
    ).toBe(true)
    banco.db.roles[novo] = 'organizador'
    expect(await api.listConvidados(id)).toEqual([])
  })

  it('remover o convite pela chave salva funciona', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as Banco
    await api.signInTelefone('11 98888-0001', 'forro123')
    banco.db.roles[banco.uid()] = 'organizador'

    const id = await api.saveChallenge(desafio)
    await api.importarConvidados(id, [{ nome: 'Pessoa Teste', telefone: '35987776655' }])
    const [convite] = await api.listConvidados(id)
    await api.removeConvidado(id, convite.telefone)
    expect(await api.listConvidados(id)).toEqual([])
  })
})
