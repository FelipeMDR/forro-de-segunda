import { beforeEach, describe, expect, it } from 'vitest'
import { alternarPraticado, lerPraticados } from '../../src/lib/praticados'

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

describe('passos praticados (no aparelho)', () => {
  beforeEach(instalarLocalStorage)

  it('começa vazio e alterna marcar/desmarcar', () => {
    expect(lerPraticados().size).toBe(0)
    expect(alternarPraticado('p1').has('p1')).toBe(true)
    expect(lerPraticados().has('p1')).toBe(true)
    expect(alternarPraticado('p1').has('p1')).toBe(false)
    expect(lerPraticados().has('p1')).toBe(false)
  })

  it('valor corrompido no armazenamento vira lista vazia', () => {
    localStorage.setItem('fds-trilha-praticados', '{quebrado')
    expect(lerPraticados().size).toBe(0)
  })
})
