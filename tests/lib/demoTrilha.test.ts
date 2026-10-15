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
      db: { checkins: Array<Record<string, unknown>>; duplas?: unknown[] }
      uid(): string
    }
    // O seed cria check-ins e duplas; zera para o teste controlar os pontos
    banco.db.checkins.length = 0
    banco.db.duplas = []
    await api.signInTelefone('11 98888-0001', 'forro123')
    return { api, banco, uid: banco.uid() }
  }

  it('salva, lista em ordem e remove passos', async () => {
    const { api } = await novaApi()
    const antes = (await api.listPassosTrilha()).length
    await api.salvarPassoTrilha({
      nivel: 'avancado', ordem: 2, nome: 'Sacada', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
    })
    const lista = await api.listPassosTrilha()
    expect(lista).toHaveLength(antes + 1)
    const novo = lista.find((p) => p.nome === 'Sacada')!
    await api.removerPassoTrilha(novo.id)
    expect(await api.listPassosTrilha()).toHaveLength(antes)
  })

  it('chave: recusa sem pontos, libera com 3 noites', async () => {
    const { api, banco, uid } = await novaApi()
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 99, nome: 'Teste', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Teste')!
    await expect(api.liberarPassoComChave(p.id)).rejects.toThrow('Você ainda não tem chave')
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await api.liberarPassoComChave(p.id)
    expect((await api.minhasLiberacoes()).map((l) => l.passo_id)).toContain(p.id)
  })

  it('regras: começa no padrão; organização muda e o gasto de chave segue', async () => {
    const { api, banco, uid } = await novaApi()
    expect(await api.regrasTrilha()).toEqual({ pontos_por_chave: 3, antecedencia_dias: 7 })
    await api.signInTelefone('11 98888-0003', 'forro123') // Ana, organizadora no demo
    await api.salvarRegrasTrilha({ pontos_por_chave: 2, antecedencia_dias: 5 })
    expect(await api.regrasTrilha()).toEqual({ pontos_por_chave: 2, antecedencia_dias: 5 })
    await api.signInTelefone('11 98888-0001', 'forro123')
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 98, nome: 'Dois pontos', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Dois pontos')!
    for (const d of ['2026-10-05', '2026-10-12']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await api.liberarPassoComChave(p.id)
    expect((await api.minhasLiberacoes()).map((l) => l.passo_id)).toContain(p.id)
  })

  it('aluno não muda as regras', async () => {
    const { api } = await novaApi()
    await expect(api.salvarRegrasTrilha({ pontos_por_chave: 1, antecedencia_dias: 30 })).rejects.toThrow(
      'Só a organização muda as regras das chaves',
    )
  })

  it('cancelar com reposição cria o evento; desfazer apaga os dois', async () => {
    const { api } = await novaApi()
    await api.saveFeriado({
      data: '2026-10-26', motivo: 'Salão ocupado', turma: 'Iniciante 01',
      suspende_desafios: false, reposicao: { data: '2026-10-31', hora: '15:00' },
    })
    const rep = (await api.listEvents()).find((e) => e.reposicao_de === '2026-10-26')
    expect(rep).toMatchObject({ turma: 'Iniciante 01', data: '2026-10-31', hora: '15:00' })
    const f = (await api.listFeriados()).find((x) => x.motivo === 'Salão ocupado')!
    await api.deleteFeriado(f.id)
    expect((await api.listEvents()).some((e) => e.reposicao_de === '2026-10-26')).toBe(false)
  })
})
