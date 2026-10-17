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

describe('DemoApi — trilha de vídeos', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T01:00:00.000Z')) // terça 20/10, 22h SP
  })
  afterEach(() => vi.useRealTimers())

  async function novaApi() {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as {
      db: {
        checkins: Array<Record<string, unknown>>
        duplas?: unknown[]
        challenges: Array<Record<string, unknown>>
        trilhaRegras?: Record<string, unknown>
      }
      uid(): string
    }
    // O seed cria check-ins e duplas; zera para o teste controlar os pontos
    banco.db.checkins.length = 0
    banco.db.duplas = []
    // Os pontos das chaves vêm do desafio principal (o da Forródex)
    banco.db.challenges.forEach((c, i) => {
      c.forrodex = i === 0
      if (i === 0) Object.assign(c, { data_inicio: '2026-01-01', data_fim: '2026-12-31' })
    })
    // Conta simples para os testes de gasto (1 ponto por presença, 3 por
    // chave); o padrão real tem teste próprio
    banco.db.trilhaRegras = {
      pontos_por_chave: 3, peso_presenca: 1, peso_parceria: 1,
      preco_por_passo: 1,
    }
    await api.signInTelefone('11 98888-0001', 'forro123')
    return { api, banco, uid: banco.uid() }
  }

  it('salva, lista em ordem e remove passos', async () => {
    const { api, uid } = await novaApi()
    const antes = (await api.listPassosTrilha()).length
    await api.salvarPassoTrilha({
      nivel: 'avancado', ordem: 2, nome: 'Sacada', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, professores_ids: [uid], pode_chave: true,
    })
    const lista = await api.listPassosTrilha()
    expect(lista).toHaveLength(antes + 1)
    const novo = lista.find((p) => p.nome === 'Sacada')!
    expect(novo.professores_ids).toEqual([uid])
    const [prof] = await api.perfisResumo([uid])
    expect(prof).toMatchObject({ id: uid, nome: expect.any(String) })
    expect(prof).toHaveProperty('avatar_url')
    await api.removerPassoTrilha(novo.id)
    expect(await api.listPassosTrilha()).toHaveLength(antes)
  })

  it('chave: recusa sem pontos, libera com 3 noites', async () => {
    const { api, banco, uid } = await novaApi()
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 99, nome: 'Teste', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Teste')!
    await expect(api.liberarPassoComChave(p.id, 1)).rejects.toThrow('Você ainda não tem chaves suficientes')
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await api.liberarPassoComChave(p.id, 1)
    expect((await api.minhasLiberacoes()).map((l) => l.passo_id)).toContain(p.id)
  })

  it('regras: começa no padrão; organização muda e o gasto de chave segue', async () => {
    const { api, banco, uid } = await novaApi()
    delete banco.db.trilhaRegras
    expect(await api.regrasTrilha()).toEqual({
      pontos_por_chave: 10, peso_presenca: 3, peso_parceria: 1,
      preco_por_passo: 1,
    })
    await api.signInTelefone('11 98888-0003', 'forro123') // Ana, organizadora no demo
    const novas = { ...(await api.regrasTrilha()), pontos_por_chave: 4, peso_presenca: 2 }
    await api.salvarRegrasTrilha(novas)
    expect(await api.regrasTrilha()).toEqual(novas)
    await api.signInTelefone('11 98888-0001', 'forro123')
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 98, nome: 'Dois pontos', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Dois pontos')!
    for (const d of ['2026-10-05', '2026-10-12']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await api.liberarPassoComChave(p.id, 1)
    expect((await api.minhasLiberacoes()).map((l) => l.passo_id)).toContain(p.id)
  })

  it('passo de 2 chaves gasta 2: o saldo segue o custo', async () => {
    const { api, banco, uid } = await novaApi()
    for (const nome of ['Custo um', 'Custo dois']) {
      await api.salvarPassoTrilha({
        nivel: 'iniciante', ordem: 90, nome, video_frente: 'dQw4w9WgXcQ',
        video_condutor: null, video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
      })
    }
    const lista = await api.listPassosTrilha()
    const um = lista.find((x) => x.nome === 'Custo um')!
    const dois = lista.find((x) => x.nome === 'Custo dois')!
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await expect(api.liberarPassoComChave(dois.id, 0)).rejects.toThrow('Preço de chave inválido')
    await expect(api.liberarPassoComChave(dois.id, 101)).rejects.toThrow('Preço de chave inválido')
    await api.liberarPassoComChave(dois.id, 2)
    await expect(api.liberarPassoComChave(um.id, 1)).rejects.toThrow('Você ainda não tem chaves suficientes')
    expect(await api.minhasLiberacoes()).toEqual([expect.objectContaining({ passo_id: dois.id, custo: 2 })])
  })

  it('sem desafio principal (Forródex), ninguém tem chave', async () => {
    const { api, banco, uid } = await novaApi()
    banco.db.challenges.forEach((c) => (c.forrodex = false))
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 97, nome: 'Sem desafio', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Sem desafio')!
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await expect(api.liberarPassoComChave(p.id, 1)).rejects.toThrow('Você ainda não tem chaves suficientes')
  })

  it('passo com vídeo do Drive salvo (de antes) chega sem vídeo', async () => {
    const { api, banco } = await novaApi()
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 96, nome: 'Era do Drive', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
    })
    const db = banco.db as unknown as { trilhaPassos: Array<Record<string, unknown>> }
    const salvo = db.trilhaPassos.find((p) => p.nome === 'Era do Drive')!
    salvo.video_frente = 'drive:1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
    salvo.video_condutor = 'dQw4w9WgXcQ'
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Era do Drive')!
    expect(p.video_frente).toBeNull()
    expect(p.video_condutor).toBe('dQw4w9WgXcQ')
  })

  it('aluno não muda as regras', async () => {
    const { api } = await novaApi()
    await expect(api.salvarRegrasTrilha({ ...(await api.regrasTrilha()), pontos_por_chave: 1 })).rejects.toThrow(
      'Só a organização muda as regras das chaves',
    )
  })

  it('pontos no desafio batem com o ranking de Presença e de Parcerias', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi() // seed completo (com check-ins e duplas)
    await api.signInTelefone('11 98888-0001', 'forro123')
    const desafios = await api.listChallenges()
    expect(desafios.length).toBeGreaterThan(0)
    let comparados = 0
    for (const c of desafios) {
      const presenca = await api.getRanking(c, 'checkin')
      const parcerias = await api.getRanking(c, 'duplas')
      for (const e of presenca) {
        const meus = await api.pontosNoDesafioDe(c, e.user_id)
        expect(meus.presenca).toBe(e.pontos)
        expect(meus.parcerias).toBe(parcerias.find((x) => x.user_id === e.user_id)?.pontos ?? 0)
        comparados++
      }
    }
    expect(comparados).toBeGreaterThan(0)
  })

  it('cancelar com reposição cria o evento; desfazer apaga os dois', async () => {
    const { api } = await novaApi()
    await api.saveFeriado({
      data: '2026-10-26', motivo: 'Salão ocupado', turma: 'Iniciante 01',
      suspende_desafios: false, cancela_aulas: true, reposicao: { data: '2026-10-31', hora: '15:00' },
    })
    const rep = (await api.listEvents()).find((e) => e.reposicao_de === '2026-10-26')
    expect(rep).toMatchObject({ turma: 'Iniciante 01', data: '2026-10-31', hora: '15:00' })
    const f = (await api.listFeriados()).find((x) => x.motivo === 'Salão ocupado')!
    await api.deleteFeriado(f.id)
    expect((await api.listEvents()).some((e) => e.reposicao_de === '2026-10-26')).toBe(false)
  })
})
