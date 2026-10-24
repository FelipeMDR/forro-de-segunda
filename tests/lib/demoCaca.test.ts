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
        profiles: Array<{
          id: string
          nome: string
          telefone: string | null
          cargos: string[]
          papel_principal: string | null
          turmas: Array<{ turma: string; papel_danca: string | null }>
        }>
        semestres?: string[]
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

  it('guardar de novo o mesmo semestre mantém a primeira foto, sem duplicar', async () => {
    const { api, uid } = await novaApi('11 98888-0003') // Ana, organizadora
    const inicio = '2026-02-01T00:00:00.000Z'
    const linha = { user_id: uid, nivel: 2, pegos: 2, meta: 4, total_equipe: 7 }
    await api.guardarCacaDoSemestre({ inicio, equipe: [], resultados: [linha] })
    await api.guardarCacaDoSemestre({ inicio, equipe: [], resultados: [{ ...linha, nivel: 1, pegos: 1 }] })
    const lista = await api.cacaCongeladaDe(uid)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ inicio, nivel: 2, pegos: 2 })
  })

  it('encerrar de novo depois de uma falha não duplica o emblema', async () => {
    const { api, banco } = await novaApi('11 98888-0003')
    const maria = banco.db.profiles.find((p) => p.telefone === '11 98888-0001')!
    const joao = banco.db.profiles.find((p) => p.telefone === '11 98888-0002')!
    for (const p of banco.db.profiles) {
      p.cargos = []
      p.papel_principal = null
    }
    joao.cargos = ['Professor']
    joao.papel_principal = 'Condutor(a)'
    maria.turmas = [{ turma: 'Intermediário', papel_danca: 'Conduzido(a)' }]
    banco.db.semestres = []
    banco.db.duplas = [
      { id: '1', data: '2026-10-19', de_user: maria.id, para_user: joao.id, confirmada: true, criado_em: '' },
      { id: '2', data: '2026-10-19', de_user: joao.id, para_user: maria.id, confirmada: true, criado_em: '' },
    ]
    // Primeira tentativa congelou e "falhou" antes do carimbo do semestre,
    // já com as turmas zeradas: a segunda calcularia Maria como condutora
    // (pelo papel principal), sem meta. Vale a primeira foto.
    maria.papel_principal = 'Condutor(a)'
    await api.encerrarSemestre()
    banco.db.semestres = []
    await api.encerrarSemestre()
    const lista = await api.cacaCongeladaDe(maria.id)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ nivel: 4, pegos: 1 })
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

  it('encerrarSemestre congela a caça antes de zerar as turmas', async () => {
    const { api, banco } = await novaApi('11 98888-0003') // Ana, organizadora
    const maria = banco.db.profiles.find((p) => p.telefone === '11 98888-0001')!
    const joao = banco.db.profiles.find((p) => p.telefone === '11 98888-0002')!
    for (const p of banco.db.profiles) {
      p.cargos = []
      p.papel_principal = null
    }
    joao.cargos = ['Professor']
    joao.papel_principal = 'Condutor(a)'
    // Na turma, Maria é conduzida; o papel principal diz o contrário. Se
    // a caça fosse congelada depois de zerar as turmas, ela valeria como
    // condutora, ficaria sem meta e sem linha.
    maria.turmas = [{ turma: 'Intermediário', papel_danca: 'Conduzido(a)' }]
    maria.papel_principal = 'Condutor(a)'
    banco.db.semestres = []
    banco.db.duplas = [
      { id: '1', data: '2026-10-19', de_user: maria.id, para_user: joao.id, confirmada: true, criado_em: '' },
      { id: '2', data: '2026-10-19', de_user: joao.id, para_user: maria.id, confirmada: true, criado_em: '' },
    ]
    await api.encerrarSemestre()
    expect(maria.turmas).toEqual([])
    const lista = await api.cacaCongeladaDe(maria.id)
    expect(lista).toHaveLength(1)
    // Equipe de um só: pegar o João já é a equipe inteira
    expect(lista[0]).toMatchObject({ inicio: null, nivel: 4, pegos: 1, meta: 1, total_equipe: 1 })
    // João é o único da equipe: sem ninguém para caçar, sem linha
    expect(await api.cacaCongeladaDe(joao.id)).toEqual([])
  })
})
