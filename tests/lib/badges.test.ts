import { describe, expect, it } from 'vitest'
import { computeBadges } from '../../src/lib/badges'

const dj = (musicasTocadas?: number) =>
  computeBadges({ userId: 'u', turmas: [], checkinDates: [], musicasTocadas }).filter((b) =>
    b.id.startsWith('dj-'),
  )

describe('distintivo DJ do Espaço Livre', () => {
  it('sem música tocada não aparece', () => {
    expect(dj(0)).toEqual([])
    expect(dj(undefined)).toEqual([])
  })

  it('evolui sem acumular: mostra só o maior nível', () => {
    expect(dj(1).map((b) => b.emoji)).toEqual(['🎵'])
    expect(dj(12).map((b) => b.emoji)).toEqual(['🎶'])
    expect(dj(25).map((b) => b.emoji)).toEqual(['🎧'])
    expect(dj(80).map((b) => b.emoji)).toEqual(['🔊'])
  })

  it('a descrição traz o número exato', () => {
    expect(dj(1)[0].descricao).toBe('1 música tocada no Espaço Livre')
    expect(dj(12)[0].descricao).toBe('12 músicas tocadas no Espaço Livre')
  })
})

const prof = (id: string, papel: 'Condutor(a)' | 'Conduzido(a)' = 'Conduzido(a)') => ({
  user_id: id,
  nome: id,
  avatar_url: null,
  papel,
})
const INICIO = '2026-07-20T22:00:00Z'

/** Progresso sintético: meta de `m` professores, `p` pegos, equipe de `t`. */
function progresso(m: number, p: number, t = m + 3, pe = p) {
  const meta = Array.from({ length: m }, (_, i) => prof(`m${i}`))
  const nivelPor = (): 0 | 1 | 2 | 3 | 4 => {
    if (pe === t) return 4
    if (p >= m) return 3
    if (p >= Math.ceil(m / 2) && p > 1) return 2
    return p >= 1 ? 1 : 0
  }
  return {
    meta,
    pegos: meta.slice(0, p),
    faltam: meta.slice(p),
    totalEquipe: t,
    pegosEquipe: pe,
    nivel: nivelPor(),
  }
}

const caca = (
  prog: ReturnType<typeof progresso> | null,
  extra: { proprio?: boolean; semPapel?: boolean } = {},
) =>
  computeBadges({
    userId: 'u',
    turmas: [],
    checkinDates: [],
    cacaAtual: {
      progresso: prog,
      inicio: INICIO,
      proprio: extra.proprio ?? false,
      semPapel: extra.semPapel ?? false,
    },
  }).filter((b) => b.id.startsWith('caca'))

describe('distintivo de função', () => {
  const funcao = (turmas: Parameters<typeof computeBadges>[0]['turmas'], papel: 'Conduzido(a)' | null) =>
    computeBadges({ userId: 'u', turmas, checkinDates: [], papelPrincipal: papel }).filter(
      (b) => b.id === 'funcao',
    )

  it('sem turma e com papel principal aparece', () => {
    const [b] = funcao([], 'Conduzido(a)')
    expect(b).toMatchObject({
      emoji: '💃',
      titulo: 'Conduzido(a)',
      descricao: 'Função principal na dança',
      tipo: 'Função',
    })
  })

  it('com turma não aparece', () => {
    expect(funcao([{ turma: 'Avançado', papel_danca: 'Conduzido(a)' } as never], 'Conduzido(a)')).toEqual([])
  })

  it('sem papel não aparece', () => {
    expect(funcao([], null)).toEqual([])
  })

  it('vem depois dos cargos e especiais', () => {
    const ids = computeBadges({
      userId: 'u',
      turmas: [],
      checkinDates: [],
      cargos: ['Professor'],
      papelPrincipal: 'Conduzido(a)',
      distintivosCustom: [{ id: 'x', emoji: '⭐', titulo: 'X', descricao: 'd' }],
    }).map((b) => b.id)
    expect(ids).toEqual(['cargo-Professor', 'x', 'funcao'])
  })
})

describe('distintivo da caça aos professores', () => {
  it('nível 2 ao vivo', () => {
    const [b] = caca(progresso(7, 4))
    expect(b).toMatchObject({
      id: 'caca-atual',
      emoji: '🌗',
      titulo: 'Meia equipe',
      descricao: '4 de 7 professores',
      tipo: 'Caça aos professores · 2º semestre de 2026',
      regra:
        'Conta professores diferentes do papel oposto ao seu, com dupla confirmada pelos dois lados. Vale o semestre todo.',
    })
    expect(b.progresso?.rotulo).toBe('faltam 3 para 🏅 Caça completa')
    expect(b.trilha?.marcos).toHaveLength(3)
    expect(b.trilha?.valor).toBe(4)
    expect(b.caca?.pegos).toHaveLength(4)
    expect(b.caca?.faltam).toHaveLength(3)
  })

  it('nível 3 esconde o easter egg', () => {
    const [b] = caca(progresso(7, 7))
    expect(b.titulo).toBe('Caça completa')
    expect(b.progresso).toBeUndefined()
    expect(b.trilha?.marcos).toHaveLength(3)
    expect([b.regra, b.descricao, b.progresso?.rotulo].join(' ')).not.toContain('Equipe inteira')
  })

  it('nível 4 mostra a Equipe inteira', () => {
    const [b] = caca(progresso(7, 7, 10, 10))
    expect(b.emoji + ' ' + b.titulo).toBe('🏆 Equipe inteira')
    expect(b.trilha?.marcos).toHaveLength(4)
    expect(b.progresso).toBeUndefined()
  })

  it('nível 0 só para o próprio perfil', () => {
    const [b] = caca(progresso(7, 0), { proprio: true })
    expect(b).toMatchObject({ emoji: '🎯', titulo: 'Caça aos professores', descricao: '0 de 7 professores' })
    expect(caca(progresso(7, 0), { proprio: false })).toEqual([])
  })

  it('sem papel, no próprio perfil, convida a escolher a função', () => {
    const [b] = caca(null, { proprio: true, semPapel: true })
    expect(b.descricao).toBe('Escolha sua função para entrar')
    expect(b.caca?.abrirFuncao).toBe(true)
    expect(caca(null, { proprio: false, semPapel: true })).toEqual([])
  })

  it('meta zero não mostra nada', () => {
    expect(caca(progresso(0, 0), { proprio: true })).toEqual([])
    expect(caca(null, { proprio: true, semPapel: false })).toEqual([])
  })

  it('caça congelada de semestre encerrado', () => {
    const out = computeBadges({
      userId: 'u',
      turmas: [],
      checkinDates: [],
      cacasCongeladas: [
        { inicio: INICIO, fim: '2026-12-14T22:00:00Z', nivel: 3, pegos: 7, meta: 7, total_equipe: 10 },
      ],
    }).filter((b) => b.id.startsWith('caca'))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: `caca-${INICIO}`,
      emoji: '🏅',
      titulo: 'Caça completa',
      descricao: '7 de 7 professores',
      tipo: 'Caça aos professores · 2º semestre de 2026',
    })
    expect(out[0].progresso).toBeUndefined()
  })

  it('caça congelada no nível 4 mostra a trilha cheia até 🏆', () => {
    const [b] = computeBadges({
      userId: 'u',
      turmas: [],
      checkinDates: [],
      cacasCongeladas: [
        { inicio: INICIO, fim: '2026-12-14T22:00:00Z', nivel: 4, pegos: 7, meta: 7, total_equipe: 14 },
      ],
    }).filter((b) => b.id.startsWith('caca'))
    expect(b.emoji).toBe('🏆')
    expect(b.trilha?.marcos).toHaveLength(4)
    expect(b.trilha?.valor).toBe(14)
  })

  it('caça congelada sem inicio rotula pelo semestre que fechou', () => {
    const tipo = (fim: string) =>
      computeBadges({
        userId: 'u',
        turmas: [],
        checkinDates: [],
        cacasCongeladas: [{ inicio: null, fim, nivel: 1, pegos: 1, meta: 7, total_equipe: 10 }],
      }).find((b) => b.id === 'caca-inicio')?.tipo
    expect(tipo('2026-12-14T22:00:00Z')).toContain('2º semestre de 2026')
    expect(tipo('2026-07-20T22:00:00Z')).toContain('1º semestre de 2026')
  })
})
