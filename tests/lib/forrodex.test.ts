import { describe, expect, it } from 'vitest'
import {
  agruparPorTurma,
  contarPorNivel,
  montarForrodex,
  nivelDupla,
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

describe('montarForrodex presa a um desafio', () => {
  it('só entra quem participa, com turma ou não', () => {
    const d = montarForrodex(
      [perfil('eu'), perfil('a'), perfil('fora'), perfil('convidado', [])],
      [],
      'eu',
      null,
      new Set(['eu', 'a', 'convidado']),
    )
    expect(d.faltam.map((c) => c.user_id)).toEqual(['a', 'convidado'])
  })

  it('quem dançou comigo conta mesmo fora do desafio, como no ranking', () => {
    const d = montarForrodex(
      [perfil('a'), perfil('fora'), perfil('b')],
      [par('a', 1), par('fora', 4)],
      'eu',
      null,
      new Set(['a', 'b']),
    )
    expect(d.descobertos.map((c) => c.user_id)).toEqual(['fora', 'a'])
    expect(d.faltam.map((c) => c.user_id)).toEqual(['b'])
    expect(d.total).toBe(3)
  })

  it('a visão por turma respeita o mesmo universo', () => {
    const secoes = agruparPorTurma(
      [perfil('a', ['Inter']), perfil('b', ['Inter']), perfil('convidado', [])],
      [],
      'eu',
      ['Inter'],
      new Set(['a', 'convidado']),
    )
    expect(secoes.map((s) => [s.turma, s.faltam.map((c) => c.user_id)])).toEqual([
      ['Inter', ['a']],
      [null, ['convidado']],
    ])
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
  it('nível primeiro, e as iniciantes pelo dia da semana', () => {
    expect(
      ordenarTurmas([
        'Iniciante (Sábado)',
        'Intermediária',
        'Iniciante (Quarta)',
        'Avançada',
        'Iniciante (Sexta)',
        'Iniciante (Terça)',
      ]),
    ).toEqual([
      'Avançada',
      'Intermediária',
      'Iniciante (Terça)',
      'Iniciante (Quarta)',
      'Iniciante (Sexta)',
      'Iniciante (Sábado)',
    ])
  })

  it('reconhece sem acento, sem parênteses e em qualquer caixa', () => {
    expect(
      ordenarTurmas(['iniciante sabado', 'INICIANTE TERCA', 'Intermediario', 'Avancado']),
    ).toEqual(['Avancado', 'Intermediario', 'INICIANTE TERCA', 'iniciante sabado'])
  })

  it('iniciante de outro dia entra na posição do dia; sem dia, depois dos dias', () => {
    expect(
      ordenarTurmas(['Iniciante 01', 'Iniciante Quinta', 'Iniciante Quarta', 'Iniciante Segunda']),
    ).toEqual(['Iniciante Segunda', 'Iniciante Quarta', 'Iniciante Quinta', 'Iniciante 01'])
  })

  it('turma que não se encaixa vai para o fim, em ordem alfabética', () => {
    expect(ordenarTurmas(['Zouk', 'Avançada', 'Bailinho'])).toEqual([
      'Avançada',
      'Bailinho',
      'Zouk',
    ])
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

describe('nivelDupla', () => {
  it('sem noite juntos não há nível', () => {
    expect(nivelDupla(0)).toBeNull()
  })

  it('cada nível começa no seu mínimo de noites', () => {
    expect(
      [1, 2, 3, 5, 6, 9, 10, 25].map((n) => nivelDupla(n)?.atual.nome),
    ).toEqual([
      'Primeira dança',
      'Primeira dança',
      'Parceria',
      'Parceria',
      'Dupla afinada',
      'Dupla afinada',
      'Dupla de ouro',
      'Dupla de ouro',
    ])
  })

  it('diz quanto falta e quanto já andou até o próximo nível', () => {
    expect(nivelDupla(4)).toMatchObject({
      atual: { nivel: 2 },
      proximo: { nivel: 3, nome: 'Dupla afinada' },
      faltam: 2,
    })
    // Parceria vai de 3 a 6: com 4 noites, andou 1 de 3
    expect(nivelDupla(4)?.fracao).toBeCloseTo(1 / 3)
  })

  it('dupla de ouro é o topo: sem próximo, barra cheia', () => {
    expect(nivelDupla(12)).toMatchObject({ proximo: null, faltam: 0, fracao: 1 })
  })
})

describe('contarPorNivel', () => {
  it('quantas duplas em cada nível, na ordem dos níveis', () => {
    expect(contarPorNivel([par('a', 1), par('b', 2), par('c', 3), par('d', 10), par('e', 11)])).toEqual([
      2, 1, 0, 2,
    ])
  })
})
