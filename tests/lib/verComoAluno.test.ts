import { beforeEach, describe, expect, it } from 'vitest'
import { equipeEfetiva, lerVerComoAluno, salvarVerComoAluno } from '../../src/lib/verComoAluno'

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

describe('ver a trilha como aluno', () => {
  beforeEach(instalarLocalStorage)

  it('começa desligado e lembra a escolha no aparelho', () => {
    expect(lerVerComoAluno()).toBe(false)
    salvarVerComoAluno(true)
    expect(lerVerComoAluno()).toBe(true)
    salvarVerComoAluno(false)
    expect(lerVerComoAluno()).toBe(false)
  })

  it('equipe vendo como aluno deixa de ver tudo aberto; aluno nunca vira equipe', () => {
    expect(equipeEfetiva(true, false)).toBe(true)
    expect(equipeEfetiva(true, true)).toBe(false)
    expect(equipeEfetiva(false, true)).toBe(false)
    expect(equipeEfetiva(false, false)).toBe(false)
  })
})
