import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('DemoApi — caça aos professores', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T01:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  async function novaApi(telefone = '11 98888-0001') {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as {
      db: {
        duplas?: Array<Record<string, unknown>>
        profiles: Array<{ id: string; nome: string }>
      }
      uid(): string
    }
    await api.signInTelefone(telefone, 'forro123')
    return { api, banco, uid: banco.uid() }
  }

  it('definirPapelPrincipal grava e getProfile devolve', async () => {
    const { api, uid } = await novaApi()
    expect((await api.getProfile(uid))?.papel_principal).toBeNull()
    await api.definirPapelPrincipal(uid, 'Condutor(a)')
    expect((await api.getProfile(uid))?.papel_principal).toBe('Condutor(a)')
    await api.definirPapelPrincipal(uid, null)
    expect((await api.getProfile(uid))?.papel_principal).toBeNull()
  })

  it('aluno não define a função de outra pessoa; a organização define', async () => {
    const { api, banco, uid } = await novaApi()
    const outro = banco.db.profiles.find((p) => p.id !== uid)!.id
    await expect(api.definirPapelPrincipal(outro, 'Condutor(a)')).rejects.toThrow(
      'Só a organização define a função de outra pessoa',
    )
    const org = await novaApi('11 98888-0003') // Ana, organizadora
    await org.api.definirPapelPrincipal(uid, 'Conduzido(a)')
    expect((await org.api.getProfile(uid))?.papel_principal).toBe('Conduzido(a)')
  })

  it('guardarCacaDoSemestre + cacaCongeladaDe devolve a linha', async () => {
    const { api, uid } = await novaApi('11 98888-0003') // Ana, organizadora
    expect(await api.cacaCongeladaDe(uid)).toEqual([])
    await api.guardarCacaDoSemestre({
      inicio: '2026-02-01T00:00:00.000Z',
      equipe: [{ user_id: uid, papel: 'Condutor(a)' }],
      resultados: [{ user_id: uid, nivel: 3, pegos: 4, meta: 4, total_equipe: 7 }],
    })
    const lista = await api.cacaCongeladaDe(uid)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      inicio: '2026-02-01T00:00:00.000Z',
      nivel: 3,
      pegos: 4,
      meta: 4,
      total_equipe: 7,
    })
    expect(typeof lista[0].fim).toBe('string')
  })

  it('guardarCacaDoSemestre é só da organização', async () => {
    const { api, uid } = await novaApi()
    await expect(
      api.guardarCacaDoSemestre({ inicio: null, equipe: [], resultados: [{ user_id: uid, nivel: 1, pegos: 1, meta: 1, total_equipe: 1 }] }),
    ).rejects.toThrow()
  })

  it('duplasConfirmadasEntre ignora não confirmadas e fora do período', async () => {
    const { api, banco } = await novaApi()
    banco.db.duplas = [
      { id: '1', data: '2026-03-02', de_user: 'a', para_user: 'b', confirmada: true, criado_em: '' },
      { id: '2', data: '2026-03-02', de_user: 'b', para_user: 'a', confirmada: false, criado_em: '' },
      { id: '3', data: '2026-01-05', de_user: 'a', para_user: 'c', confirmada: true, criado_em: '' },
      { id: '4', data: '2026-09-01', de_user: 'a', para_user: 'd', confirmada: true, criado_em: '' },
      { id: '5', data: '2026-02-01', de_user: 'a', para_user: 'e', confirmada: true, criado_em: '' },
    ]
    const r = await api.duplasConfirmadasEntre('2026-02-01T00:00:00.000Z', '2026-06-30')
    expect(r.map((d) => d.para_user).sort()).toEqual(['b', 'e'])
    const todas = await api.duplasConfirmadasEntre(null, '2026-06-30')
    expect(todas.map((d) => d.para_user).sort()).toEqual(['b', 'c', 'e'])
  })
})
