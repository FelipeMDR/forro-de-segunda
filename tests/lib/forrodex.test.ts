import { describe, expect, it } from 'vitest'
import type { ForroApi } from '../../src/lib/api'
import {
  agruparPorTurma,
  carregarParceiros,
  contarPorNivel,
  montarForrodex,
  nivelDupla,
  ordenarTurmas,
  pontosDaCarta,
  pontosDeParcerias,
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
  papel_principal: null,
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

describe('carregarParceiros', () => {
  const recorte = {
    challenge_id: 'd1',
    data_inicio: '2026-09-07',
    data_fim: '2026-12-12',
  }
  const api = (comDesafio: boolean) =>
    ({
      recorteForrodex: async () => (comDesafio ? recorte : null),
      parceirosNoDesafio: async (id: string) => [par(`do-${id}`, 2)],
      inicioSemestreAtual: async () => '2026-08-17T15:50:00Z',
      parceirosDe: async (_: string, desde?: string) => [par(`desde-${desde}`, 1)],
    }) as unknown as ForroApi

  it('presa a um desafio, os parceiros saem do desafio', async () => {
    expect((await carregarParceiros(api(true), 'eu')).map((p) => p.user_id)).toEqual([
      'do-d1',
    ])
  })

  it('sem desafio, desde o último encerramento', async () => {
    expect((await carregarParceiros(api(false), 'eu')).map((p) => p.user_id)).toEqual([
      'desde-2026-08-17T15:50:00Z',
    ])
  })
})

describe('Forródex presa a um desafio', () => {
  it('o total da turma não depende de quem se inscreveu nem de com quem dancei', () => {
    // Inscrição no desafio só declara que a pessoa quer competir: a
    // coleção é a turma inteira, igual para todo mundo dela
    const turma = [perfil('eu'), perfil('a'), perfil('b'), perfil('c')]
    const forro = [perfil('convidado', [])]
    const eu = montarForrodex([...turma, ...forro], [par('a', 1), par('convidado', 3)], 'eu', 'Inter')
    const a = montarForrodex([...turma, ...forro], [], 'a', 'Inter')
    expect(eu.total).toBe(3)
    expect(a.total).toBe(3)
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

describe('pontosDaCarta', () => {
  it('vale o nível da carta: 1, 2, 3 e 4 pontos', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 25].map(pontosDaCarta)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ])
  })
})

describe('pontosDeParcerias', () => {
  const dupla = (de: string, para: string, data: string) => ({
    de_user: de,
    para_user: para,
    data,
  })
  const noites = (n: number) =>
    Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)

  it('soma o valor de cada carta', () => {
    // 1 noite com a (1 pt) + 3 com b (2 pts) + 10 com c (4 pts)
    const datas = noites(10)
    const rows = [
      dupla('eu', 'a', datas[0]),
      ...datas.slice(0, 3).map((d) => dupla('eu', 'b', d)),
      ...datas.map((d) => dupla('eu', 'c', d)),
    ]
    const pontos = pontosDeParcerias(rows, new Map([['eu', new Set(datas)]]))
    expect(pontos.get('eu')).toBe(7)
  })

  it('a mesma noite marcada duas vezes conta uma', () => {
    const rows = [dupla('eu', 'a', '2026-10-01'), dupla('eu', 'a', '2026-10-01')]
    const pontos = pontosDeParcerias(rows, new Map([['eu', new Set(['2026-10-01'])]]))
    expect(pontos.get('eu')).toBe(1)
  })

  it('noite que não valeu para a pessoa não conta', () => {
    const datas = noites(3)
    const rows = datas.map((d) => dupla('eu', 'a', d))
    // Só duas das três noites valeram: a carta fica em 1 ponto, não 2
    const pontos = pontosDeParcerias(rows, new Map([['eu', new Set(datas.slice(0, 2))]]))
    expect(pontos.get('eu')).toBe(1)
  })

  it('quem não tem noite válida fica sem ponto', () => {
    const pontos = pontosDeParcerias([dupla('eu', 'a', '2026-10-01')], new Map())
    expect(pontos.get('eu')).toBeUndefined()
  })
})
