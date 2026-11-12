import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChallengeInput, IngressoConfig } from '../../src/lib/types'

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
    checkins: Array<Record<string, unknown>>
    members: Array<{ challenge_id: string; user_id: string; entrou_em: string }>
  }
  uid(): string
}

describe('DemoApi — desafio de ingresso', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  async function novaApi() {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as Banco
    await api.signInTelefone('11 98888-0001', 'forro123')
    return { api, banco, uid: banco.uid() }
  }

  const base: Omit<ChallengeInput, 'titulo' | 'ingresso' | 'janelas' | 'entrada_restrita'> = {
    descricao: '',
    data_inicio: '2026-12-01',
    data_fim: '2026-12-31',
    local: null,
    modalidades: ['checkin'],
  }

  function config(extra: string[] = []): IngressoConfig {
    return {
      evento_data: '2026-12-05',
      evento_inicio: '18:00',
      evento_fim: '04:00',
      noite_extra_para: extra,
      garantido: { emoji: '🎟️', titulo: 'Forró na Rep · Ingresso garantido' },
      presenca: { emoji: '🎉', titulo: 'Forró na Rep · Marquei presença' },
    }
  }

  async function montar() {
    const ctx = await novaApi()
    const livre = await ctx.api.saveChallenge({
      ...base,
      titulo: 'Espaço Livre',
      // segundas: 05/12/2026 é sábado, então só a noite extra pode pontuar
      janelas: [{ dia_semana: 1, hora_inicio: '18:00', hora_fim: '22:00' }],
      entrada_restrita: false,
      ingresso: null,
    })
    const rep = await ctx.api.saveChallenge({
      ...base,
      titulo: 'Forró na Rep',
      janelas: [],
      entrada_restrita: true,
      ingresso: config([livre]),
    })
    // Só a organização corrige a presença
    ctx.banco.db.roles[ctx.uid] = 'organizador'
    const agora = new Date().toISOString()
    ctx.banco.db.members.push({ challenge_id: rep, user_id: ctx.uid, entrou_em: agora })
    ctx.banco.db.members.push({ challenge_id: livre, user_id: ctx.uid, entrou_em: agora })
    return { ...ctx, rep, livre }
  }

  function checkin(banco: Banco, uid: string, quando: string) {
    banco.db.checkins.push({
      id: `c-${quando}`,
      user_id: uid,
      foto_url: 'x',
      legenda: null,
      criado_em: new Date(quando).toISOString(),
    })
  }

  it('salva o desafio de ingresso e lista com a noite extra', async () => {
    const { api, rep } = await montar()
    const c = (await api.listChallenges()).find((x) => x.id === rep)!
    expect(c.ingresso?.evento_data).toBe('2026-12-05')
    expect(c.ingresso?.garantido.titulo).toBe('Forró na Rep · Ingresso garantido')
    expect(c.noites_extras).toEqual([
      { data: '2026-12-05', hora_inicio: '18:00', hora_fim: '04:00' },
    ])
  })

  it('o Espaço Livre indicado também volta com a noite', async () => {
    const { api, livre } = await montar()
    const c = (await api.getChallenge(livre))!
    expect(c.ingresso).toBeNull()
    expect(c.noites_extras).toHaveLength(1)
    expect(c.noites_extras[0].data).toBe('2026-12-05')
  })

  it('check-in às 01:30 de 06/12 dá presença; correção para false volta a garantido', async () => {
    const { api, banco, uid, rep } = await montar()
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('garantido')

    checkin(banco, uid, '2026-12-06T01:30:00')
    const [p] = await api.ingressosDoPerfil(uid)
    expect(p.estado).toBe('presenca')
    expect(p.desafio_id).toBe(rep)
    expect(p.emoji).toBe('🎉')
    expect(p.desde).toBe(new Date('2026-12-06T01:30:00').toISOString())

    await api.marcarPresencaIngresso(rep, uid, false)
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('garantido')

    await api.marcarPresencaIngresso(rep, uid, null)
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('presenca')
  })

  it('correção true vale sem check-in e check-in anulado não conta', async () => {
    const { api, banco, uid, rep } = await montar()
    checkin(banco, uid, '2026-12-05T20:00:00')
    banco.db.checkins[banco.db.checkins.length - 1].presenca_anulada = true
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('garantido')
    await api.marcarPresencaIngresso(rep, uid, true)
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('presenca')
  })

  it('check-in fora do horário da festa não vira presença', async () => {
    const { api, banco, uid } = await montar()
    checkin(banco, uid, '2026-12-06T04:30:00')
    expect((await api.ingressosDoPerfil(uid))[0].estado).toBe('garantido')
  })

  it('o ranking do Espaço Livre dá 1 ponto ao check-in das 18:30 de 05/12', async () => {
    const { api, banco, uid, livre } = await montar()
    checkin(banco, uid, '2026-12-05T18:30:00')
    const desafio = (await api.getChallenge(livre))!
    const ranking = await api.getRanking(desafio)
    expect(ranking.find((r) => r.user_id === uid)?.pontos).toBe(1)
  })

  it('statusSincronizacao e gerarSegredoIngresso no demo', async () => {
    const { api, rep } = await montar()
    expect(await api.statusSincronizacao(rep)).toBeNull()
    expect(await api.gerarSegredoIngresso(rep)).toBe(`demo-${rep}`)
    expect(await api.confirmarRemocoesIngresso(rep, 0)).toBe(0)
  })
})
