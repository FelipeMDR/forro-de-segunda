import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChallengeInput } from '../../src/lib/types'

/**
 * `saveChallenge` no Supabase, com um cliente falso: desafio de ingresso
 * que volta a ser comum precisa limpar as colunas da 043 ANTES da
 * atualização principal, senão a constraint `challenges_ingresso_completo`
 * recusa (entrada restrita desligada com `evento_data` preenchido).
 */

// Chamadas ao banco falso, na ordem: [tabela, método, ...args]
const log: unknown[][] = []

function consulta(tabela: string) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(ok, erro)
        }
        return (...args: unknown[]) => {
          log.push([tabela, prop, ...args])
          return proxy
        }
      },
    },
  )
  return proxy
}

const sbFalso = {
  from: (tabela: string) => consulta(tabela),
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'org' } } } }),
  },
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => sbFalso }))

describe('SupabaseApi.saveChallenge — deixar de ser desafio de ingresso', () => {
  beforeEach(() => {
    log.length = 0
  })

  it('limpa as colunas da 043 antes da atualização principal', async () => {
    const { SupabaseApi } = await import('../../src/lib/supabaseApi')
    const entrada: ChallengeInput = {
      id: 'd1',
      titulo: 'Espaço Livre',
      descricao: '',
      data_inicio: '2026-12-01',
      data_fim: '2026-12-31',
      janelas: [{ dia_semana: 1, hora_inicio: '18:00', hora_fim: '22:00' }],
      local: null,
      entrada_restrita: false,
      modalidades: ['checkin'],
      ingresso: null,
    }
    await new SupabaseApi().saveChallenge(entrada)
    const updates = log.filter((c) => c[0] === 'challenges' && c[1] === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[0][2]).toMatchObject({ evento_data: null, evento_inicio: null })
    expect(updates[1][2]).toMatchObject({ entrada_restrita: false, titulo: 'Espaço Livre' })
  })
})
