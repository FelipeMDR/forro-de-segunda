import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `encerrarSemestre` no Supabase, com um cliente falso: o que importa é
 * a ordem — congelar a caça antes de apagar as matrículas — e o que
 * acontece quando o congelamento falha.
 */

// Chamadas ao banco falso, na ordem: [tabela ou rpc, método, ...args]
const log: unknown[][] = []
let erroCaca: { message: string } | null = null
/** Banco sem a migração 041: a coluna `papel_principal` não existe. */
let semColunaFuncao = false

const PERFIL = {
  id: 'u1',
  nome: 'Ana',
  avatar_url: null,
  criado_em: '2026-03-01T00:00:00Z',
  turmas: [{ turma: 'Iniciante', papel_danca: 'Conduzido(a)' }],
  cargos: [],
}

/** Consulta encadeável: todo método devolve a mesma consulta; `await` resolve. */
function consulta(tabela: string) {
  const minhas: unknown[][] = []
  const resultado = () => {
    const pedeFuncao = minhas.some(
      (c) => c[0] === 'select' && String(c[1]).includes('papel_principal'),
    )
    if (pedeFuncao && semColunaFuncao) {
      return { data: null, error: { message: 'column profiles.papel_principal does not exist' } }
    }
    return { data: tabela === 'profiles' ? [PERFIL] : [], error: null }
  }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
            Promise.resolve(resultado()).then(ok, erro)
        }
        return (...args: unknown[]) => {
          log.push([tabela, prop, ...args])
          minhas.push([prop, ...args])
          return proxy
        }
      },
    },
  )
  return proxy
}

const sbFalso = {
  from: (tabela: string) => consulta(tabela),
  rpc: async (nome: string) => {
    log.push(['rpc', nome])
    return { data: null, error: nome === 'guardar_caca_do_semestre' ? erroCaca : null }
  },
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'org' } } } }),
  },
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => sbFalso }))
vi.mock('../../src/lib/caca', async (original) => ({
  ...(await original<typeof import('../../src/lib/caca')>()),
  cacaParaCongelar: async () => ({ inicio: null, equipe: [], resultados: [] }),
}))

const apagou = () => log.some((c) => c[1] === 'delete')

async function novaApi() {
  const { SupabaseApi } = await import('../../src/lib/supabaseApi')
  return new SupabaseApi()
}

describe('SupabaseApi.encerrarSemestre — congelar a caça', () => {
  beforeEach(() => {
    log.length = 0
    erroCaca = null
    semColunaFuncao = false
  })

  it('congela antes de apagar as matrículas', async () => {
    await (await novaApi()).encerrarSemestre()
    const congelou = log.findIndex((c) => c[0] === 'rpc' && c[1] === 'guardar_caca_do_semestre')
    const apagouTurmas = log.findIndex((c) => c[0] === 'profile_turmas' && c[1] === 'delete')
    expect(congelou).toBeGreaterThanOrEqual(0)
    expect(apagouTurmas).toBeGreaterThan(congelou)
  })

  it('sem a migração 041 (função não existe), o semestre fecha mesmo assim', async () => {
    erroCaca = {
      message:
        'Could not find the function public.guardar_caca_do_semestre(p) in the schema cache',
    }
    await expect((await novaApi()).encerrarSemestre()).resolves.toBe(1)
    expect(apagou()).toBe(true)
    expect(log.some((c) => c[0] === 'semestres' && c[1] === 'insert')).toBe(true)
  })

  it('outro erro interrompe antes de apagar qualquer coisa', async () => {
    erroCaca = { message: 'Só a organização encerra o semestre' }
    await expect((await novaApi()).encerrarSemestre()).rejects.toThrow(
      'Só a organização encerra o semestre',
    )
    expect(apagou()).toBe(false)
    expect(log.some((c) => c[0] === 'semestres')).toBe(false)
  })
})

describe('SupabaseApi — função na dança sem a migração 041', () => {
  beforeEach(() => {
    log.length = 0
    semColunaFuncao = false
  })

  it('com a coluna, quem não escolheu vem null', async () => {
    const [p] = await (await novaApi()).listProfiles()
    expect(p.papel_principal).toBeNull()
  })

  it('sem a coluna, vem undefined (indisponível) para todo mundo', async () => {
    semColunaFuncao = true
    const api = await novaApi()
    const [p] = await api.listProfiles()
    expect(p.papel_principal).toBeUndefined()
    const [publico] = await api.listPerfisPublicos()
    expect(publico.papel_principal).toBeUndefined()
  })
})
