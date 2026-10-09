import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O DemoApi grava tudo no localStorage, que não existe no Node
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

describe('DemoApi — pedidos de música', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    // Segunda, 12/10/2026, 22h em São Paulo
    vi.setSystemTime(new Date('2026-10-13T01:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('toca na ordem do rodízio e conta para o distintivo', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const { DURACAO_DEMO_MS, CATALOGO_DEMO } = await import('../../src/lib/catalogoDemo')
    const api = new DemoApi()
    const banco = api as unknown as {
      db: { checkins: Array<Record<string, unknown>> }
    }
    // O seed do demo cria check-ins "de hoje"; zera para o teste
    // controlar exatamente quem tem check-in na noite
    banco.db.checkins.length = 0
    // O relógio do teste é congelado: sem andar 1 s entre os pedidos,
    // todos teriam o mesmo horário e o desempate cairia no id (aleatório)
    const passa = (ms = 1000) => vi.setSystemTime(new Date(Date.now() + ms))
    const checkinAgora = (user_id: string) =>
      banco.db.checkins.push({
        id: `ck-${user_id}`,
        user_id,
        foto_url: '',
        legenda: null,
        criado_em: new Date().toISOString(),
        presenca_anulada: false,
      })

    // Ana é organizadora: conecta e liga o Modo DJ
    await api.signInTelefone('11 98888-0003', 'forro123')
    await api.conectarSpotify('demo', '')
    expect(await api.ligarModoDJ(false)).toEqual({ tipo: 'ligado' })

    // Maria pede 3, João pede 1 depois
    await api.signInTelefone('11 98888-0001', 'forro123')
    const maria = (await api.getSessionUserId())!
    checkinAgora(maria)
    const [m1, m2, m3, j1] = CATALOGO_DEMO.slice(10, 14)
    await api.pedirMusica(m1)
    passa()
    await api.pedirMusica(m2)
    passa()
    await api.pedirMusica(m3)
    passa()
    await expect(api.pedirMusica(m1)).rejects.toThrow('Essa música já foi pedida hoje')

    await api.signInTelefone('11 98888-0002', 'forro123')
    const joao = (await api.getSessionUserId())!
    await expect(api.pedirMusica(j1)).rejects.toThrow('Faça seu check-in para pedir música')
    checkinAgora(joao)
    await api.pedirMusica(j1)

    expect((await api.filaDaNoite()).map((p) => p.titulo)).toEqual([
      m1.titulo,
      j1.titulo,
      m2.titulo,
      m3.titulo,
    ])

    // O "Spotify de mentira" avança uma música a cada DURACAO_DEMO_MS
    await api.cutucarLoopDJ()
    const tocadas: string[] = []
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(new Date(Date.now() + DURACAO_DEMO_MS))
      await api.cutucarLoopDJ()
      tocadas.push((await api.sessaoDJAberta())!.tocando!.titulo)
    }
    expect(tocadas).toEqual([m1.titulo, j1.titulo, m2.titulo, m3.titulo])
    expect(await api.musicasTocadasDe(maria)).toBe(3)
    expect(await api.musicasTocadasDe(joao)).toBe(1)
    expect((await api.sessaoDJAberta())!.tocando!.pedido_por).toBe(
      (await api.getProfile(maria))!.nome,
    )
  })

  it('aluno não liga o Modo DJ', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0001', 'forro123')
    await expect(api.conectarSpotify('demo', '')).rejects.toThrow('Só professores podem ser DJ')
    await expect(api.ligarModoDJ(false)).rejects.toThrow('Só professores podem ligar o Modo DJ')
  })

  it('sem Modo DJ ligado não há fila, e pedir é recusado', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const { CATALOGO_DEMO } = await import('../../src/lib/catalogoDemo')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0001', 'forro123')
    expect(await api.sessaoDJAberta()).toBeNull()
    expect(await api.filaDaNoite()).toEqual([])
    await expect(api.pedirMusica(CATALOGO_DEMO[0])).rejects.toThrow('O Modo DJ não está ligado agora')
  })

  it('busca no catálogo ignora acento e maiúscula', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    expect((await api.buscarMusicas('xodo')).map((f) => f.titulo)).toContain('Eu Só Quero um Xodó')
    expect(await api.buscarMusicas('x')).toEqual([])
  })
})
