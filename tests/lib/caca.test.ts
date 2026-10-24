import { describe, expect, it } from 'vitest'
import {
  equipeDaCaca,
  marcosDaCaca,
  papelEfetivo,
  progressoCaca,
  resultadosDaCaca,
} from '../../src/lib/caca'
import type { ProfessorCaca } from '../../src/lib/caca'
import type { PapelDanca, PerfilPublico, Turma } from '../../src/lib/types'

const COND: PapelDanca = 'Condutor(a)'
const CONDZ: PapelDanca = 'Conduzido(a)'

const prof = (id: string, papel: PapelDanca): ProfessorCaca => ({
  user_id: id,
  nome: `Prof ${id}`,
  avatar_url: null,
  papel,
})

/** 7 condutores (c1..c7) e 7 conduzidos (d1..d7). */
const equipe14 = [
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => prof(`c${i}`, COND)),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => prof(`d${i}`, CONDZ)),
]

const perfil = (
  id: string,
  cargos: string[],
  papel: PapelDanca | null,
): PerfilPublico => ({
  id,
  nome: `Pessoa ${id}`,
  avatar_url: null,
  turmas: [],
  turmas_ensino: [],
  cargos,
  papel_principal: papel,
  criado_em: '2026-01-01T00:00:00Z',
})

describe('papelEfetivo', () => {
  it('sem turma usa o papel principal', () => {
    expect(papelEfetivo([], CONDZ, [])).toBe(CONDZ)
    expect(papelEfetivo([], null, [])).toBeNull()
  })

  it('a turma de nivel mais alto vence', () => {
    const turmas = [
      { turma: 'Avançado', papel_danca: CONDZ },
      { turma: 'Intermediário', papel_danca: COND },
    ]
    const cadastradas: Turma[] = [
      { id: '1', nome: 'Avançado', nivel: 'avancado' },
      { id: '2', nome: 'Intermediário', nivel: 'intermediario' },
    ]
    expect(papelEfetivo(turmas, null, cadastradas)).toBe(CONDZ)
    expect(papelEfetivo([...turmas].reverse(), null, cadastradas)).toBe(CONDZ)
  })

  it('sem nivel cadastrado cai no peso do nome da turma', () => {
    const turmas = [
      { turma: 'Intermediário', papel_danca: COND },
      { turma: 'Avançado', papel_danca: CONDZ },
    ]
    expect(papelEfetivo(turmas, null, [])).toBe(CONDZ)
  })

  it('turma sem papel nao conta', () => {
    const turmas = [
      { turma: 'Avançado', papel_danca: null },
      { turma: 'Iniciante', papel_danca: COND },
    ]
    expect(papelEfetivo(turmas, CONDZ, [])).toBe(COND)
    expect(
      papelEfetivo([{ turma: 'Avançado', papel_danca: null }], CONDZ, []),
    ).toBeNull()
  })
})

describe('equipeDaCaca', () => {
  it('entra so professor com papel principal', () => {
    const equipe = equipeDaCaca([
      perfil('a', ['Professor(a)'], COND),
      perfil('b', ['professora'], CONDZ),
      perfil('c', ['Monitor(a)'], COND),
      perfil('d', ['Professor(a)'], null),
    ])
    expect(equipe.map((p) => p.user_id)).toEqual(['a', 'b'])
    expect(equipe[0]).toEqual({
      user_id: 'a',
      nome: 'Pessoa a',
      avatar_url: null,
      papel: COND,
    })
  })
})

describe('progressoCaca', () => {
  it('conta pegos, faltam e nivel', () => {
    const parceiros = new Set(['c1', 'c2', 'c3', 'c4', 'd1'])
    const p = progressoCaca('eu', CONDZ, equipe14, parceiros)
    expect(p.meta).toHaveLength(7)
    expect(p.pegos).toHaveLength(4)
    expect(p.faltam).toHaveLength(3)
    expect(p.nivel).toBe(2)
    expect(p.totalEquipe).toBe(14)
    expect(p.pegosEquipe).toBe(5)
  })

  it('nivel 3 com o lado todo e 4 so com a equipe inteira', () => {
    const lado = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
    expect(progressoCaca('eu', CONDZ, equipe14, lado).nivel).toBe(3)
    const todos = new Set(equipe14.map((p) => p.user_id))
    expect(progressoCaca('eu', CONDZ, equipe14, todos).nivel).toBe(4)
  })

  it('professor cacando fica fora da propria meta e da equipe', () => {
    const equipe = [...equipe14.slice(0, 6), prof('eu', COND), ...equipe14.slice(7)]
    const p = progressoCaca('eu', COND, equipe, new Set(['eu', 'd1']))
    expect(p.meta).toHaveLength(7)
    expect(p.meta.every((m) => m.papel === CONDZ)).toBe(true)
    expect(p.totalEquipe).toBe(13)
    expect(p.pegosEquipe).toBe(1)
  })

  it('meta 1: o unico professor ja e a caca completa (nivel 3)', () => {
    const equipe = [prof('d1', CONDZ), prof('c1', COND), prof('c2', COND)]
    const p = progressoCaca('eu', COND, equipe, new Set(['d1']))
    expect(p.meta).toHaveLength(1)
    expect(p.nivel).toBe(3)
  })

  it('meta 2: um pego e o primeiro (1), os dois sao a caca completa (3)', () => {
    const equipe = [prof('d1', CONDZ), prof('d2', CONDZ), prof('c1', COND)]
    expect(progressoCaca('eu', COND, equipe, new Set(['d1'])).nivel).toBe(1)
    expect(progressoCaca('eu', COND, equipe, new Set(['d1', 'd2'])).nivel).toBe(3)
  })

  it('meta zero fica no nivel 0', () => {
    const soCond = [1, 2, 3].map((i) => prof(`c${i}`, COND))
    const p = progressoCaca('eu', COND, soCond, new Set(['c1', 'c2', 'c3']))
    expect(p.meta).toHaveLength(0)
    expect(p.nivel).toBe(0)
  })

  it('parceiro que nao esta na equipe nao conta', () => {
    const p = progressoCaca('eu', CONDZ, equipe14, new Set(['ex-professor']))
    expect(p.pegos).toHaveLength(0)
    expect(p.pegosEquipe).toBe(0)
    expect(p.nivel).toBe(0)
  })
})

describe('marcosDaCaca', () => {
  const minimos = (m: { minimo: number }[]) => m.map((x) => x.minimo)

  it('escada com e sem o nivel secreto', () => {
    expect(minimos(marcosDaCaca(7, 14, false))).toEqual([1, 4, 7])
    const m = marcosDaCaca(7, 14, true)
    expect(minimos(m)).toEqual([1, 4, 7, 14])
    expect(m.map((x) => x.titulo)).toEqual([
      'Primeiro professor',
      'Meia equipe',
      'Caça completa',
      'Equipe inteira',
    ])
  })

  it('meta 1 vira um marco so, de caca completa', () => {
    const m = marcosDaCaca(1, 2, false)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ minimo: 1, titulo: 'Caça completa' })
  })

  it('meta 2 tem primeiro professor e caca completa', () => {
    const m = marcosDaCaca(2, 4, false)
    expect(minimos(m)).toEqual([1, 2])
    expect(m.map((x) => x.titulo)).toEqual(['Primeiro professor', 'Caça completa'])
  })

  it('meta igual a equipe com secreto: a colisao fica com Equipe inteira', () => {
    const m = marcosDaCaca(4, 4, true)
    expect(minimos(m)).toEqual([1, 2, 4])
    expect(m[m.length - 1].titulo).toBe('Equipe inteira')
  })

  it('meta zero nao tem marcos, nem o secreto', () => {
    expect(marcosDaCaca(0, 5, true)).toEqual([])
  })
})

describe('resultadosDaCaca', () => {
  // 4 professores (2 condutores, 2 conduzidos) e 3 alunos
  const perfis: PerfilPublico[] = [
    perfil('c1', ['Professor'], COND),
    perfil('c2', ['Professora'], COND),
    perfil('d1', ['Professor'], CONDZ),
    perfil('d2', ['Professora'], CONDZ),
    // Na turma, conduzida — vale a turma, não o papel principal
    { ...perfil('a1', [], COND), turmas: [{ turma: 'Iniciante', papel_danca: CONDZ }] },
    // Sem turma e sem papel: fora da caça
    perfil('a2', [], null),
    // Com turma mas sem papel: fora, mesmo com papel principal
    { ...perfil('a3', [], CONDZ), turmas: [{ turma: 'Iniciante', papel_danca: null }] },
  ]
  const turmas: Turma[] = [{ id: 't', nome: 'Iniciante', nivel: 'iniciante' }]
  // Dupla confirmada tem as duas direções
  const par = (a: string, b: string) => [
    { de_user: a, para_user: b },
    { de_user: b, para_user: a },
  ]
  const duplas = [
    ...par('a1', 'c1'),
    ...par('a1', 'c2'),
    ...par('a2', 'c1'),
    ...par('a3', 'd1'),
    ...par('c1', 'c2'),
    ...par('c1', 'd1'),
    ...par('c1', 'd2'),
  ]

  it('congela a equipe e só quem chegou a algum nível', () => {
    const { equipe, resultados } = resultadosDaCaca(perfis, turmas, duplas)
    expect(equipe).toEqual([
      { user_id: 'c1', papel: COND },
      { user_id: 'c2', papel: COND },
      { user_id: 'd1', papel: CONDZ },
      { user_id: 'd2', papel: CONDZ },
    ])
    const de = (id: string) => resultados.find((r) => r.user_id === id)
    expect(de('a1')).toEqual({ user_id: 'a1', nivel: 3, pegos: 2, meta: 2, total_equipe: 4 })
    expect(de('a2')).toBeUndefined()
    expect(de('a3')).toBeUndefined()
    // O professor também caça: dançou com os outros 3, equipe inteira
    expect(de('c1')).toEqual({ user_id: 'c1', nivel: 4, pegos: 2, meta: 2, total_equipe: 3 })
    // c2 (só com c1, mesmo papel) e d2 (só com c1) — d2 pegou 1 de 2
    expect(de('c2')).toBeUndefined()
    expect(de('d2')).toEqual({ user_id: 'd2', nivel: 1, pegos: 1, meta: 2, total_equipe: 3 })
    expect(resultados.every((r) => r.nivel >= 1)).toBe(true)
  })
})
