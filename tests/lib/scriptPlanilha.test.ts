import { describe, expect, it } from 'vitest'
import { idDaPlanilha, montarScriptPlanilha } from '../../src/lib/scriptPlanilha'

describe('idDaPlanilha', () => {
  it('extrai o id do link', () => {
    expect(
      idDaPlanilha('https://docs.google.com/spreadsheets/d/ABC_def-123/edit?usp=sharing'),
    ).toBe('ABC_def-123')
  })
  it('devolve null para texto sem link de planilha', () => {
    expect(idDaPlanilha('qualquer coisa')).toBeNull()
  })
})

describe('montarScriptPlanilha', () => {
  const script = montarScriptPlanilha({
    supabaseUrl: 'https://abc.supabase.co',
    anonKey: 'anon-key-1',
    segredo: 'segredo-xyz',
    planilhaId: 'ABC_def-123',
  })

  it('embute id, segredo, url e gatilho de 5 minutos', () => {
    expect(script).toContain('ABC_def-123')
    expect(script).toContain('segredo-xyz')
    expect(script).toContain('https://abc.supabase.co/rest/v1/rpc/sincronizar_planilha_ingresso')
    expect(script).toContain('everyMinutes(5)')
    expect(script).toContain('function sincronizar()')
    expect(script).toContain('function instalar()')
  })

  it('é JS válido', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('escapa aspas nos valores embutidos', () => {
    const s = montarScriptPlanilha({
      supabaseUrl: 'https://x.co',
      anonKey: 'a"b',
      segredo: "s'\\n",
      planilhaId: 'id',
    })
    expect(() => new Function(s)).not.toThrow()
  })
})
