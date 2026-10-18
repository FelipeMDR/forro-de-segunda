import { describe, expect, it } from 'vitest'
import {
  aulasDaTurma,
  diasAte,
  urlDoEmbed,
  nivelInicial,
  cronogramaDaTurma,
  cronogramaDeTurma,
  conteudoDaAula,
  sequenciaDoNivel,
  idDoYoutube,
  miniaturaDoYoutube,
  videoDoYoutube,
  nivelDoAluno,
  niveisVisiveis,
  passoDaAula,
  podeEditarTrilha,
  REGRAS_PADRAO,
  saldoDeChaves,
  situacaoDoNivel,
  type ContextoTrilha,
} from '../../src/lib/trilha'
import type { AgendaEvent, AulaSemVideo, Feriado, PassoTrilha, Turma } from '../../src/lib/types'

const V = 'dQw4w9WgXcQ'

const aulaSeg: AgendaEvent = {
  id: 'e1', titulo: 'Aula', descricao: null, turma: 'Iniciante 01',
  dia_semana: 1, data: null, hora: '20:00',
}
const aulaQua: AgendaEvent = { ...aulaSeg, id: 'e2', turma: 'Iniciante 02', dia_semana: 3, hora: '19:00' }

const feriado = (data: string, turma: string | null): Feriado => ({
  id: `f-${data}`, data, motivo: 'Feriado', turma, suspende_desafios: false, cancela_aulas: true,
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

  it('dia só sem Espaço Livre teve aula: a trilha anda normal', () => {
    const soEspacoLivre = { ...feriado('2026-10-12', null), suspende_desafios: true, cancela_aulas: false }
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [soEspacoLivre], '2026-10-19')
    expect(r.map((a) => a.tipo)).toEqual(['aula', 'aula', 'aula'])
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
  it('abre na data da aula; todo passo à frente fica à venda, pela tabela (1, 2, 3…)', () => {
    const s = situacaoDoNivel('iniciante', ctx())
    expect(s.map((p) => p.estado)).toEqual(['aberto', 'aberto', 'aberto', 'chave', 'chave', 'chave'])
    expect(s.map((p) => p.custo)).toEqual([null, null, null, 1, 2, 3])
    expect(s[3].data).toBe('2026-10-26')
    expect(s[4].data).toBe('2026-11-02')
  })

  it('dá para comprar um passo lá na frente sem comprar os de antes; o preço não muda', () => {
    const s = situacaoDoNivel('iniciante', ctx({ liberadas: new Set(['p6']) }))
    expect(s[3]).toMatchObject({ estado: 'chave', custo: 1 })
    expect(s[4]).toMatchObject({ estado: 'chave', custo: 2 })
    expect(s[5]).toMatchObject({ estado: 'aberto', motivo: 'chave', custo: null })
  })

  it('cada passo à frente da turma custa a sua distância: 1º = 1, 2º = 2… sem teto', () => {
    const passos = [1, 2, 3, 4, 5, 6, 7].map((n) => passo(n))
    const s = situacaoDoNivel('iniciante', ctx({ passos, hoje: '2026-09-20' }))
    expect(s.map((p) => p.custo)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('o valor por passo de distância vem das regras da organização', () => {
    const regras = { ...REGRAS_PADRAO, preco_por_passo: 2 }
    const c = ctx({
      regras,
      passos: [1, 2, 3, 4, 5, 6].map((n) => passo(n)).concat([passo(1, { id: 'i1', nivel: 'intermediario' })]),
    })
    expect(situacaoDoNivel('iniciante', c).map((p) => p.custo)).toEqual([null, null, null, 2, 4, 6])
    expect(situacaoDoNivel('intermediario', c)[0].custo).toBe(8)
  })

  it('passo muito longe nunca passa de 100 chaves', () => {
    const passos = Array.from({ length: 60 }, (_, i) => passo(i + 1))
    const s = situacaoDoNivel('iniciante', ctx({ passos, hoje: '2026-09-20', regras: { ...REGRAS_PADRAO, preco_por_passo: 3 } }))
    expect(Math.max(...s.map((p) => p.custo ?? 0))).toBe(100)
  })

  it('sem limite de dias: o próximo passo vira "chave" mesmo semanas antes', () => {
    const s = situacaoDoNivel('iniciante', ctx({ hoje: '2026-09-20' }))
    expect(s[0]).toMatchObject({ estado: 'chave', custo: 1, data: '2026-10-05' })
  })

  it('quando a turma avança, o preço cai', () => {
    // Em 02/11 a turma já viu p4 e p5: p6 passa a custar 1
    const s = situacaoDoNivel('iniciante', ctx({ hoje: '2026-11-02' }))
    expect(s[5]).toMatchObject({ estado: 'chave', custo: 1 })
  })

  it('aluno em duas turmas do nível: vale a data mais cedo', () => {
    // Iniciante 02 (quartas desde 07/10): p3 em 21/10. Iniciante 01: p3 em 19/10.
    const s = situacaoDoNivel('iniciante', ctx({ minhasTurmas: ['Iniciante 01', 'Iniciante 02'], hoje: '2026-10-19' }))
    expect(s[2]).toMatchObject({ estado: 'aberto', data: '2026-10-19' })
  })

  it('passo que só abre depois da aula não vira "chave", mas o seguinte continua à venda (pelo preço da posição)', () => {
    const passos = [1, 2, 3, 4, 5].map((n) => passo(n, n === 4 ? { pode_chave: false } : {}))
    const s = situacaoDoNivel('iniciante', ctx({ passos }))
    expect(s[3]).toMatchObject({ estado: 'bloqueado', custo: null })
    expect(s[4]).toMatchObject({ estado: 'chave', custo: 2 })
  })

  it('passo sem vídeo não vira "chave"', () => {
    const passos = [1, 2, 3, 4].map((n) => passo(n, n === 4 ? { video_frente: null } : {}))
    expect(situacaoDoNivel('iniciante', ctx({ passos }))[3].estado).toBe('bloqueado')
  })

  it('os níveis de cima continuam a contagem: o 1º do Inter custa o que falta do Iniciante + 1', () => {
    // Iniciante com 4 passos (p4 é o 1º à frente da turma), 2 do Inter e 2 do AV
    const c = ctx({
      passos: [1, 2, 3, 4].map((n) => passo(n)).concat([
        passo(1, { id: 'i1', nivel: 'intermediario' }),
        passo(2, { id: 'i2', nivel: 'intermediario' }),
        passo(1, { id: 'a1', nivel: 'avancado' }),
        passo(2, { id: 'a2', nivel: 'avancado' }),
      ]),
    })
    expect(situacaoDoNivel('iniciante', c)[3]).toMatchObject({ estado: 'chave', custo: 1 })
    expect(situacaoDoNivel('intermediario', c).map((p) => [p.estado, p.custo, p.data])).toEqual([
      ['chave', 2, null], ['chave', 3, null],
    ])
    expect(situacaoDoNivel('avancado', c).map((p) => p.custo)).toEqual([4, 5])
    expect(niveisVisiveis(c)).toEqual(['iniciante', 'intermediario', 'avancado'])
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

  it('aluno vê o próprio nível, os de baixo e os de cima com passo à venda; equipe vê todos', () => {
    const passos = [passo(1), passo(1, { id: 'i1', nivel: 'intermediario' }), passo(1, { id: 'a1', nivel: 'avancado' })]
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: ['Intermediário'] }))).toEqual(['iniciante', 'intermediario', 'avancado'])
    const semVideoNoTopo = passos.map((p) => (p.id === 'a1' ? { ...p, video_frente: null } : p))
    expect(niveisVisiveis(ctx({ passos: semVideoNoTopo, minhasTurmas: ['Intermediário'] }))).toEqual(['iniciante', 'intermediario'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [], equipe: true }))).toEqual(['iniciante', 'intermediario', 'avancado'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [] }))).toEqual([])
  })
})

describe('saldoDeChaves', () => {
  it('padrão: presença vale 3, parceria 1, 10 pontos por chave', () => {
    const s = saldoDeChaves({ presenca: 4, parcerias: 6, usadas: 1 })
    // 3×4 + 6 = 18 pontos = 1 chave; 1 já gasta
    expect(s).toEqual({ pontos: 18, ganhas: 1, usadas: 1, disponiveis: 0, faltam: 2, pontosPorChave: 10 })
  })

  it('segue os pesos e os pontos por chave que a organização definiu', () => {
    const regras = { ...REGRAS_PADRAO, pontos_por_chave: 2, peso_presenca: 1, peso_parceria: 0 }
    const s = saldoDeChaves({ presenca: 5, parcerias: 40, usadas: 0, regras })
    expect(s).toMatchObject({ pontos: 5, ganhas: 2, disponiveis: 2, faltam: 1, pontosPorChave: 2 })
  })

  it('nunca fica negativo', () => {
    const s = saldoDeChaves({ presenca: 0, parcerias: 0, usadas: 2 })
    expect(s.disponiveis).toBe(0)
    expect(s.faltam).toBe(10)
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

  it('equipe sem turma (organização testando): abre no primeiro nível com passos', () => {
    expect(nivelInicial(ctx({ minhasTurmas: [], equipe: true }))).toBe('iniciante')
  })

  it('sem nada para ver: null', () => {
    expect(nivelInicial(ctx({ minhasTurmas: [] }))).toBeNull()
  })
})

describe('diasAte', () => {
  it('conta dias de calendário entre duas datas', () => {
    expect(diasAte('2026-10-20', '2026-10-20')).toBe(0)
    expect(diasAte('2026-10-20', '2026-10-21')).toBe(1)
    expect(diasAte('2026-10-20', '2026-11-02')).toBe(13)
    expect(diasAte('2026-10-20', '2026-10-18')).toBe(-2)
  })
})

describe('YouTube: miniatura e player', () => {
  it('miniatura pelo ID', () => {
    expect(miniaturaDoYoutube(V)).toBe(`https://i.ytimg.com/vi/${V}/mqdefault.jpg`)
  })

  it('player aceita comandos (velocidade) pela API do iframe', () => {
    expect(urlDoEmbed(V)).toContain('enablejsapi=1')
  })
})

describe('passoDaAula (Agenda)', () => {
  const passos = [1, 2, 3, 4, 5].map((n) => passo(n))
  const base = { turmas, passos, feriados: [] as Feriado[] }

  it('aula semanal da turma mostra o passo daquela data', () => {
    const eventos = [aulaSeg]
    expect(passoDaAula(aulaSeg, '2026-10-12', { ...base, eventos })?.id).toBe('p2')
    expect(passoDaAula(aulaSeg, '2026-10-26', { ...base, eventos })?.id).toBe('p4')
  })

  it('aula cancelada não tem passo; a reposição tem, e a trilha não atrasa', () => {
    const rep = reposicao('2026-10-31', '2026-10-26')
    const ctxAg = { ...base, eventos: [aulaSeg, rep], feriados: [feriado('2026-10-26', 'Iniciante 01')] }
    expect(passoDaAula(aulaSeg, '2026-10-26', ctxAg)).toBeNull()
    expect(passoDaAula(rep, '2026-10-31', ctxAg)?.id).toBe('p4')
    expect(passoDaAula(aulaSeg, '2026-11-02', ctxAg)?.id).toBe('p5')
  })

  it('evento sem turma, de turma sem trilha, ou de data única que não é reposição: nada', () => {
    const geral = { ...aulaSeg, id: 'g', turma: null }
    const festa: AgendaEvent = { ...aulaSeg, id: 'f', dia_semana: null, data: '2026-10-12', reposicao_de: null }
    const semTrilha = { ...aulaSeg, id: 's', turma: 'Turma sem nível' }
    const eventos = [aulaSeg, geral, festa, semTrilha]
    expect(passoDaAula(geral, '2026-10-12', { ...base, eventos })).toBeNull()
    expect(passoDaAula(festa, '2026-10-12', { ...base, eventos })).toBeNull()
    expect(passoDaAula(semTrilha, '2026-10-12', { ...base, eventos })).toBeNull()
  })

  it('depois que a trilha acaba, a aula não tem passo', () => {
    expect(passoDaAula(aulaSeg, '2026-11-30', { ...base, eventos: [aulaSeg] })).toBeNull()
  })
})

describe('só YouTube (o Drive foi retirado)', () => {
  const D = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

  it('link do Drive não é mais aceito', () => {
    expect(idDoYoutube(`https://drive.google.com/file/d/${D}/view?usp=sharing`)).toBeNull()
  })

  it('vídeo do Drive que ficou salvo conta como "sem vídeo"', () => {
    expect(videoDoYoutube(`drive:${D}`)).toBeNull()
    expect(videoDoYoutube(V)).toBe(V)
    expect(videoDoYoutube(null)).toBeNull()
  })

  it('miniatura e player do YouTube', () => {
    expect(miniaturaDoYoutube(V)).toBe(`https://i.ytimg.com/vi/${V}/mqdefault.jpg`)
    expect(urlDoEmbed(V)).toContain('youtube-nocookie.com/embed/')
  })
})

describe('aulas sem vídeo', () => {
  const passos = [1, 2, 3, 4].map((n) => passo(n))
  const semVideo = (ordem: number, extra: Partial<AulaSemVideo> = {}): AulaSemVideo => ({
    id: `sv${ordem}`, nivel: 'iniciante', ordem, nome: `Conceito ${ordem}`, descricao: null, ...extra,
  })

  it('entra na posição dela e empurra os passos seguintes uma semana', () => {
    expect(sequenciaDoNivel(passos, [semVideo(2)]).map((s) => s.passo?.id ?? s.semVideo?.id)).toEqual([
      'p1', 'sv2', 'p2', 'p3', 'p4',
    ])
  })

  it('duas na mesma posição ficam em seguida; depois do fim, vão para o final', () => {
    const seq = sequenciaDoNivel(passos, [semVideo(1), semVideo(1, { id: 'sv1b', nome: 'Z' }), semVideo(20)])
    expect(seq.map((s) => s.passo?.id ?? s.semVideo?.id)).toEqual(['sv1', 'sv1b', 'p1', 'p2', 'p3', 'p4', 'sv20'])
  })

  it('no cronograma da turma: ocupa a data e a turma inteira do nível anda junto', () => {
    const turma = turmas[0]
    const c = cronogramaDeTurma(turma, passos, [aulaSeg], [], [semVideo(2), semVideo(1, { nivel: 'avancado' })])
    expect(c.map((l) => [l.aula.data, l.passo?.id ?? l.semVideo?.id])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', 'sv2'], ['2026-10-19', 'p2'], ['2026-10-26', 'p3'], ['2026-11-02', 'p4'],
    ])
  })

  it('cancelamento empurra a aula sem vídeo como empurra um passo', () => {
    const c = cronogramaDeTurma(turmas[0], passos, [aulaSeg], [feriado('2026-10-12', null)], [semVideo(2)])
    expect(c.map((l) => [l.aula.data, l.passo?.id ?? l.semVideo?.id ?? null])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', null], ['2026-10-19', 'sv2'], ['2026-10-26', 'p2'],
      ['2026-11-02', 'p3'], ['2026-11-09', 'p4'],
    ])
  })

  it('na Agenda: a aula mostra a aula sem vídeo, e o passo vai para a semana seguinte', () => {
    const base = { turmas, passos, feriados: [] as Feriado[], eventos: [aulaSeg], semVideo: [semVideo(2)] }
    expect(conteudoDaAula(aulaSeg, '2026-10-12', base)).toEqual({ passo: null, semVideo: semVideo(2) })
    expect(passoDaAula(aulaSeg, '2026-10-12', base)).toBeNull()
    expect(passoDaAula(aulaSeg, '2026-10-19', base)?.id).toBe('p2')
  })

  it('na trilha do aluno: não aparece, mas atrasa a data dos passos', () => {
    const s = situacaoDoNivel('iniciante', ctx({ passos, semVideo: [semVideo(1)], hoje: '2026-10-05' }))
    expect(s.map((x) => x.passo.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(s[0].data).toBe('2026-10-12')
    expect(s[0].estado).not.toBe('aberto')
  })
})
