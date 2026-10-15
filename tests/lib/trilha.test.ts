import { describe, expect, it } from 'vitest'
import {
  aulasDaTurma,
  nivelInicial,
  cronogramaDaTurma,
  idDoYoutube,
  nivelDoAluno,
  niveisVisiveis,
  podeEditarTrilha,
  saldoDeChaves,
  situacaoDoNivel,
  type ContextoTrilha,
} from '../../src/lib/trilha'
import type { AgendaEvent, Feriado, PassoTrilha, Turma } from '../../src/lib/types'

const V = 'dQw4w9WgXcQ'

const aulaSeg: AgendaEvent = {
  id: 'e1', titulo: 'Aula', descricao: null, turma: 'Iniciante 01',
  dia_semana: 1, data: null, hora: '20:00',
}
const aulaQua: AgendaEvent = { ...aulaSeg, id: 'e2', turma: 'Iniciante 02', dia_semana: 3, hora: '19:00' }

const feriado = (data: string, turma: string | null): Feriado => ({
  id: `f-${data}`, data, motivo: 'Feriado', turma, suspende_desafios: false,
})

const reposicao = (data: string, de: string, turma = 'Iniciante 01'): AgendaEvent => ({
  id: `r-${data}`, titulo: 'Reposição', descricao: null, turma,
  dia_semana: null, data, hora: '15:00', reposicao_de: de,
})

const passo = (n: number, extra: Partial<PassoTrilha> = {}): PassoTrilha => ({
  id: `p${n}`, nivel: 'iniciante', ordem: n, nome: `Passo ${n}`,
  video_frente: V, video_condutor: null, video_conduzida: null, dica: null,
  pode_chave: true, ...extra,
})

const turmas: Turma[] = [
  { id: 't1', nome: 'Iniciante 01', nivel: 'iniciante', trilha_inicio: '2026-10-05' },
  { id: 't2', nome: 'Iniciante 02', nivel: 'iniciante', trilha_inicio: '2026-10-07' },
  { id: 't3', nome: 'Intermediário', nivel: 'intermediario', trilha_inicio: '2026-10-06' },
]

function ctx(extra: Partial<ContextoTrilha> = {}): ContextoTrilha {
  return {
    passos: [1, 2, 3, 4, 5, 6].map((n) => passo(n)),
    turmas,
    minhasTurmas: ['Iniciante 01'],
    eventos: [aulaSeg, aulaQua],
    feriados: [],
    liberadas: new Set(),
    hoje: '2026-10-20',
    equipe: false,
    ...extra,
  }
}

describe('idDoYoutube', () => {
  it.each([
    [V],
    [`https://youtu.be/${V}?si=abc`],
    [`https://www.youtube.com/watch?v=${V}&t=30`],
    [`https://m.youtube.com/watch?v=${V}`],
    [`youtube.com/shorts/${V}`],
    [`https://www.youtube.com/embed/${V}`],
    [`https://www.youtube.com/live/${V}`],
  ])('%s', (link) => expect(idDoYoutube(link)).toBe(V))

  it.each([
    ['https://www.youtube.com/playlist?list=PL123'],
    ['https://vimeo.com/123456'],
    [''],
    ['abc'],
  ])('recusa %s', (link) => expect(idDoYoutube(link)).toBeNull())
})

describe('aulasDaTurma', () => {
  it('aulas semanais a partir do início', () => {
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [], '2026-10-26')
    expect(r.map((a) => [a.data, a.tipo])).toEqual([
      ['2026-10-05', 'aula'], ['2026-10-12', 'aula'], ['2026-10-19', 'aula'], ['2026-10-26', 'aula'],
    ])
  })

  it('cancelamento da turma ou de todas vira "cancelada"; de outra turma não muda nada', () => {
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg],
      [feriado('2026-10-12', 'Iniciante 01'), feriado('2026-10-19', null), feriado('2026-10-26', 'Iniciante 02')],
      '2026-10-26',
    )
    expect(r.map((a) => a.tipo)).toEqual(['aula', 'cancelada', 'cancelada', 'aula'])
  })

  it('cancelamento num dia sem aula da turma não aparece', () => {
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [feriado('2026-10-07', null)], '2026-10-12')
    expect(r.map((a) => a.data)).toEqual(['2026-10-05', '2026-10-12'])
  })

  it('reposição entra na data dela e marca a cancelada', () => {
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-19', [aulaSeg, reposicao('2026-10-31', '2026-10-26')],
      [feriado('2026-10-26', 'Iniciante 01')], '2026-11-02',
    )
    expect(r).toEqual([
      { data: '2026-10-19', tipo: 'aula', motivo: null, reposicaoEm: null },
      { data: '2026-10-26', tipo: 'cancelada', motivo: 'Feriado', reposicaoEm: '2026-10-31' },
      { data: '2026-10-31', tipo: 'reposicao', motivo: null, reposicaoEm: null },
      { data: '2026-11-02', tipo: 'aula', motivo: null, reposicaoEm: null },
    ])
  })

  it('reposição de um dia sem aula da turma não conta (cancelamento num dia qualquer)', () => {
    // Iniciante 01 tem aula às segundas; cancelaram uma quarta e "repuseram"
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg, reposicao('2026-10-10', '2026-10-07')],
      [feriado('2026-10-07', 'Iniciante 01')], '2026-10-12',
    )
    expect(r.map((a) => a.data)).toEqual(['2026-10-05', '2026-10-12'])
  })

  it('reposição que sobrou sem o cancelamento não conta', () => {
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg, reposicao('2026-10-10', '2026-10-05')], [], '2026-10-12',
    )
    expect(r.map((a) => [a.data, a.tipo])).toEqual([['2026-10-05', 'aula'], ['2026-10-12', 'aula']])
  })

  it('evento de data única que não é reposição não conta como aula', () => {
    const rep: AgendaEvent = { ...reposicao('2026-10-10', '2026-10-05'), reposicao_de: null }
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg, rep], [], '2026-10-12')
    expect(r.map((a) => a.data)).toEqual(['2026-10-05', '2026-10-12'])
  })
})

describe('cronogramaDaTurma', () => {
  const passos = [1, 2, 3, 4, 5].map((n) => passo(n))

  it('sem reposição, os passos seguintes andam uma semana', () => {
    const aulas = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [feriado('2026-10-26', null)], '2026-11-09')
    const c = cronogramaDaTurma(passos, aulas)
    expect(c.map((l) => [l.aula.data, l.passo?.id ?? null])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', 'p2'], ['2026-10-19', 'p3'],
      ['2026-10-26', null], ['2026-11-02', 'p4'], ['2026-11-09', 'p5'],
    ])
  })

  it('com reposição, o passo vai para a reposição e o resto não muda', () => {
    const aulas = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg, reposicao('2026-10-31', '2026-10-26')],
      [feriado('2026-10-26', 'Iniciante 01')], '2026-11-02',
    )
    const c = cronogramaDaTurma(passos, aulas)
    expect(c.filter((l) => l.passo).map((l) => [l.aula.data, l.passo!.id])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', 'p2'], ['2026-10-19', 'p3'],
      ['2026-10-31', 'p4'], ['2026-11-02', 'p5'],
    ])
  })

  it('ordena pela ordem, não pela posição na lista', () => {
    const aulas = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [], '2026-10-12')
    const c = cronogramaDaTurma([passo(2), passo(1)], aulas)
    expect(c.map((l) => l.passo?.id)).toEqual(['p1', 'p2'])
  })
})

describe('situacaoDoNivel', () => {
  it('abre na data da aula; o primeiro fechado em até 7 dias vira "chave"', () => {
    const s = situacaoDoNivel('iniciante', ctx())
    expect(s.map((p) => p.estado)).toEqual(['aberto', 'aberto', 'aberto', 'chave', 'bloqueado', 'bloqueado'])
    expect(s[3].data).toBe('2026-10-26')
    expect(s[4].data).toBe('2026-11-02')
  })

  it('liberado com chave abre, e o seguinte longe demais não vira "chave"', () => {
    const s = situacaoDoNivel('iniciante', ctx({ liberadas: new Set(['p4']) }))
    expect(s[3]).toMatchObject({ estado: 'aberto', motivo: 'chave' })
    expect(s[4].estado).toBe('bloqueado')
  })

  it('aluno em duas turmas do nível: vale a data mais cedo', () => {
    // Iniciante 02 (quartas desde 07/10): p3 em 21/10. Iniciante 01: p3 em 19/10.
    const s = situacaoDoNivel('iniciante', ctx({ minhasTurmas: ['Iniciante 01', 'Iniciante 02'], hoje: '2026-10-19' }))
    expect(s[2]).toMatchObject({ estado: 'aberto', data: '2026-10-19' })
  })

  it('passo que só abre depois da aula não vira "chave" nem deixa o seguinte virar', () => {
    const passos = [1, 2, 3, 4, 5].map((n) => passo(n, n === 4 ? { pode_chave: false } : {}))
    const s = situacaoDoNivel('iniciante', ctx({ passos }))
    expect(s[3].estado).toBe('bloqueado')
    expect(s[4].estado).toBe('bloqueado')
  })

  it('antecedência menor que a padrão: o próximo passo ainda não vira "chave"', () => {
    // hoje 20/10, p4 em 26/10: com 7 dias vira "chave", com 3 dias não
    const s = situacaoDoNivel('iniciante', ctx({ regras: { pontos_por_chave: 3, antecedencia_dias: 3 } }))
    expect(s[3].estado).toBe('bloqueado')
  })

  it('passo sem vídeo não vira "chave"', () => {
    const passos = [1, 2, 3, 4].map((n) => passo(n, n === 4 ? { video_frente: null } : {}))
    expect(situacaoDoNivel('iniciante', ctx({ passos }))[3].estado).toBe('bloqueado')
  })

  it('nível abaixo do aluno fica todo aberto (revisão); acima, todo fechado', () => {
    const c = ctx({
      minhasTurmas: ['Intermediário'],
      passos: [passo(1), passo(2), passo(1, { id: 'a1', nivel: 'avancado' })],
    })
    expect(situacaoDoNivel('iniciante', c).map((p) => [p.estado, p.motivo])).toEqual([
      ['aberto', 'revisao'], ['aberto', 'revisao'],
    ])
    expect(situacaoDoNivel('avancado', c)[0]).toMatchObject({ estado: 'bloqueado', data: null })
  })

  it('equipe vê tudo aberto', () => {
    const s = situacaoDoNivel('iniciante', ctx({ minhasTurmas: [], equipe: true }))
    expect(s.every((p) => p.estado === 'aberto' && p.motivo === 'equipe')).toBe(true)
  })

  it('turma sem data de início: nada abre e nada quebra', () => {
    const c = ctx({ turmas: [{ id: 't1', nome: 'Iniciante 01', nivel: 'iniciante', trilha_inicio: null }] })
    const s = situacaoDoNivel('iniciante', c)
    expect(s.every((p) => p.estado === 'bloqueado' && p.data === null)).toBe(true)
  })
})

describe('nivelDoAluno / niveisVisiveis', () => {
  it('maior nível entre as turmas; null sem turma com nível', () => {
    expect(nivelDoAluno(ctx({ minhasTurmas: ['Iniciante 01', 'Intermediário'] }))).toBe('intermediario')
    expect(nivelDoAluno(ctx({ minhasTurmas: ['Turma sem nível'] }))).toBeNull()
  })

  it('aluno vê o próprio nível e os de baixo que têm passos; equipe vê todos que têm passos', () => {
    const passos = [passo(1), passo(1, { id: 'i1', nivel: 'intermediario' }), passo(1, { id: 'a1', nivel: 'avancado' })]
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: ['Intermediário'] }))).toEqual(['iniciante', 'intermediario'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [], equipe: true }))).toEqual(['iniciante', 'intermediario', 'avancado'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [] }))).toEqual([])
  })
})

describe('saldoDeChaves', () => {
  it('presença + noite com dupla + parceria nova, 3 pontos por chave', () => {
    const s = saldoDeChaves({
      presencas: ['2026-10-05', '2026-10-12', '2026-10-12'],
      noitesComDupla: ['2026-10-05', '2026-10-12'],
      parceiros: [
        { user_id: 'b', nome: 'Bia', avatar_url: null, noites: 2, primeira: '2026-10-05' },
        { user_id: 'c', nome: 'Caio', avatar_url: null, noites: 5, primeira: '2026-03-02' },
      ],
      desde: '2026-07-01T12:00:00Z',
      usadas: 1,
    })
    // 2 presenças + 2 noites com dupla + 1 parceria nova = 5
    expect(s).toEqual({ pontos: 5, ganhas: 1, usadas: 1, disponiveis: 0, faltam: 1, pontosPorChave: 3 })
  })

  it('segue os pontos por chave que a organização definiu', () => {
    const s = saldoDeChaves({
      presencas: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'],
      noitesComDupla: [], parceiros: [], desde: null, usadas: 0, pontosPorChave: 2,
    })
    expect(s).toMatchObject({ pontos: 5, ganhas: 2, disponiveis: 2, faltam: 1, pontosPorChave: 2 })
  })

  it('nunca fica negativo', () => {
    const s = saldoDeChaves({ presencas: [], noitesComDupla: [], parceiros: [], desde: null, usadas: 2 })
    expect(s.disponiveis).toBe(0)
    expect(s.faltam).toBe(3)
  })
})

describe('podeEditarTrilha', () => {
  it('organização, professor, diretor de ensino e quem dá aula', () => {
    expect(podeEditarTrilha({ papel: 'organizador', cargos: [], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Professor(a)'], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Diretor(a) de Ensino'], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: [], turmas_ensino: ['Iniciante 01'] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Membro de RH'], turmas_ensino: [] })).toBe(false)
  })
})

describe('nivelInicial', () => {
  it('abre no nível do aluno quando ele tem passos', () => {
    expect(nivelInicial(ctx({ minhasTurmas: ['Iniciante 01'] }))).toBe('iniciante')
  })

  it('nível do aluno sem passos: abre no primeiro que tem (revisão), não numa tela vazia', () => {
    // Aluno do Intermediário, mas só o Iniciante tem passos
    expect(nivelInicial(ctx({ minhasTurmas: ['Intermediário'] }))).toBe('iniciante')
  })

  it('sem nada para ver: null', () => {
    expect(nivelInicial(ctx({ minhasTurmas: [] }))).toBeNull()
  })
})
