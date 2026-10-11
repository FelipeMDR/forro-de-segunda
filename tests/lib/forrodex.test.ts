import { describe, expect, it } from 'vitest'
import {
  agruparPorTurma,
  montarForrodex,
  ordenarTurmas,
  turmasDe,
} from '../../src/lib/forrodex'
import type { ParceiroDanca, PerfilPublico } from '../../src/lib/types'

const perfil = (
  id: string,
  turmas: string[] = ['Inter'],
  ensino: string[] = [],
): PerfilPublico => ({
  id,
  nome: `Pessoa ${id}`,
  avatar_url: null,
  turmas: turmas.map((turma) => ({ turma, papel_danca: null })),
  turmas_ensino: ensino,
  cargos: [],
  criado_em: '2026-01-01T00:00:00Z',
})

const par = (id: string, noites: number): ParceiroDanca => ({
  user_id: id,
  nome: `Pessoa ${id}`,
  avatar_url: null,
  noites,
})

describe('montarForrodex', () => {
  it('separa quem já dançou de quem falta, sem me incluir', () => {
    const d = montarForrodex(
      [perfil('eu'), perfil('a'), perfil('b'), perfil('c')],
      [par('b', 2)],
      'eu',
    )
    expect(d.descobertos.map((c) => c.user_id)).toEqual(['b'])
    expect(d.faltam.map((c) => c.user_id)).toEqual(['a', 'c'])
    expect(d.total).toBe(3)
  })

  it('descobertos vêm por noites juntos, empate por nome', () => {
    const d = montarForrodex(
      [perfil('a'), perfil('b'), perfil('c')],
      [par('c', 1), par('b', 3), par('a', 1)],
      'eu',
    )
    expect(d.descobertos.map((c) => [c.user_id, c.noites])).toEqual([
      ['b', 3],
      ['a', 1],
      ['c', 1],
    ])
  })

  it('quem não tem turma fica fora, a não ser que tenha dançado comigo', () => {
    const d = montarForrodex(
      [perfil('formado', []), perfil('dancou', []), perfil('a')],
      [par('dancou', 1)],
      'eu',
    )
    expect(d.descobertos.map((c) => c.user_id)).toEqual(['dancou'])
    expect(d.faltam.map((c) => c.user_id)).toEqual(['a'])
    expect(d.total).toBe(2)
  })

  it('quem só dá aula conta como ativo no semestre', () => {
    const d = montarForrodex([perfil('prof', [], ['AV'])], [], 'eu')
    expect(d.faltam.map((c) => c.user_id)).toEqual(['prof'])
  })

  it('filtro de turma vale para os dois lados, inclusive quem dá aula', () => {
    const d = montarForrodex(
      [
        perfil('inter1', ['Inter']),
        perfil('inter2', ['Inter']),
        perfil('av', ['AV']),
        perfil('prof', [], ['Inter']),
        perfil('semTurma', []),
      ],
      [par('inter1', 2), par('av', 4), par('semTurma', 1)],
      'eu',
      'Inter',
    )
    expect(d.descobertos.map((c) => c.user_id)).toEqual(['inter1'])
    expect(d.faltam.map((c) => c.user_id)).toEqual(['inter2', 'prof'])
    expect(d.total).toBe(3)
  })

  it('parceiro que não veio na lista de perfis ainda aparece em Todos', () => {
    const d = montarForrodex([], [par('sumido', 1)], 'eu')
    expect(d.descobertos.map((c) => c.user_id)).toEqual(['sumido'])
    expect(d.total).toBe(1)
  })

  it('semestre encerrado e sem duplas: coleção vazia', () => {
    const d = montarForrodex([perfil('a', []), perfil('b', [])], [], 'eu')
    expect(d.total).toBe(0)
  })
})

describe('turmasDe', () => {
  it('junta onde estudo e onde dou aula, sem repetir', () => {
    expect(turmasDe(perfil('eu', ['Inter', 'AV'], ['AV', 'Iniciante 01']))).toEqual([
      'Inter',
      'AV',
      'Iniciante 01',
    ])
  })

  it('sem perfil, sem chips', () => {
    expect(turmasDe(null)).toEqual([])
  })
})

describe('ordenarTurmas', () => {
  it('as minhas primeiro, as outras em ordem alfabética, sem repetir', () => {
    expect(
      ordenarTurmas(['Avançado', 'Iniciante 01', 'Intermediário'], ['Intermediário']),
    ).toEqual(['Intermediário', 'Avançado', 'Iniciante 01'])
  })

  it('turma minha que não está na lista ainda aparece', () => {
    expect(ordenarTurmas(['AV'], ['Velha'])).toEqual(['Velha', 'AV'])
  })
})

describe('agruparPorTurma', () => {
  const perfis = [
    perfil('eu', ['Inter']),
    perfil('a', ['Inter', 'AV']),
    perfil('b', ['Inter']),
    perfil('c', ['AV']),
    perfil('formado', []),
  ]

  it('uma seção por turma, na ordem pedida, com progresso próprio', () => {
    const s = agruparPorTurma(perfis, [par('a', 2), par('c', 1)], 'eu', ['Inter', 'AV'])
    expect(
      s.map((x) => [
        x.turma,
        x.descobertos.map((c) => c.user_id),
        x.faltam.map((c) => c.user_id),
        x.total,
      ]),
    ).toEqual([
      ['Inter', ['a'], ['b'], 2],
      ['AV', ['a', 'c'], [], 2],
    ])
  })

  it('quem dançou comigo sem turma vai para "Sem turma" no fim', () => {
    const s = agruparPorTurma(perfis, [par('formado', 3)], 'eu', ['Inter', 'AV'])
    const ultima = s[s.length - 1]
    expect(ultima.turma).toBeNull()
    expect(ultima.descobertos.map((c) => c.user_id)).toEqual(['formado'])
  })

  it('turma sem ninguém não vira seção vazia', () => {
    const s = agruparPorTurma(perfis, [], 'eu', ['Inter', 'Iniciante 03', 'AV'])
    expect(s.map((x) => x.turma)).toEqual(['Inter', 'AV'])
  })

  it('pessoa numa turma fora da lista não some: cai em "Sem turma"', () => {
    const s = agruparPorTurma([perfil('x', ['Antiga'])], [], 'eu', ['Inter'])
    expect(s.map((x) => [x.turma, x.faltam.map((c) => c.user_id)])).toEqual([
      [null, ['x']],
    ])
  })
})
