import { describe, expect, it } from 'vitest'
import {
  nivelInicial,
  niveisVisiveis,
  situacaoDoNivel,
  type ContextoTrilha,
} from '../../src/lib/trilha'
import type { AgendaEvent, NivelTrilha, PassoTrilha, Turma } from '../../src/lib/types'

function passo(id: string, nivel: NivelTrilha, ordem: number): PassoTrilha {
  return {
    id, nivel, ordem, nome: id, video_frente: 'dQw4w9WgXcQ', video_condutor: null,
    video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
  }
}

function aulaSemanal(turma: string, dia: number): AgendaEvent {
  return { id: turma, titulo: turma, descricao: null, turma, dia_semana: dia, data: null, hora: '19:00' }
}

// Iniciante 01 começa segunda 05/10; Iniciante 02, segunda 12/10 (uma semana atrás)
const turmas: Turma[] = [
  { id: '1', nome: 'Iniciante 01', nivel: 'iniciante', trilha_inicio: '2026-10-05' },
  { id: '2', nome: 'Iniciante 02', nivel: 'iniciante', trilha_inicio: '2026-10-12' },
  { id: '3', nome: 'AV', nivel: 'avancado', trilha_inicio: '2026-10-05' },
]
const passos = [
  passo('i1', 'iniciante', 1), passo('i2', 'iniciante', 2), passo('i3', 'iniciante', 3),
  passo('a1', 'avancado', 1), passo('a2', 'avancado', 2),
]

function ctx(extra: Partial<ContextoTrilha> = {}): ContextoTrilha {
  return {
    passos, turmas, minhasTurmas: [],
    eventos: [aulaSemanal('Iniciante 01', 1), aulaSemanal('Iniciante 02', 1), aulaSemanal('AV', 1)],
    feriados: [], liberadas: new Set(), hoje: '2026-10-19', equipe: false,
    ...extra,
  }
}

const estados = (c: ContextoTrilha, n: NivelTrilha) =>
  Object.fromEntries(situacaoDoNivel(n, c).map((s) => [s.passo.id, s.estado]))

describe('trilha — aluno sem turma (acervo)', () => {
  it('padrão é Iniciante: só vê o nível Iniciante', () => {
    expect(niveisVisiveis(ctx())).toEqual(['iniciante'])
    expect(nivelInicial(ctx())).toBe('iniciante')
  })

  it('abre no dia em que a turma mais atrasada teve a aula', () => {
    // 19/10: Iniciante 01 já teve i1, i2, i3; Iniciante 02 só i1 e i2
    expect(estados(ctx(), 'iniciante')).toEqual({ i1: 'aberto', i2: 'aberto', i3: 'bloqueado' })
    const i3 = situacaoDoNivel('iniciante', ctx()).find((s) => s.passo.id === 'i3')!
    expect(i3.data).toBe('2026-10-26')
    expect(estados(ctx({ hoje: '2026-10-26' }), 'iniciante').i3).toBe('aberto')
  })

  it('nunca oferece chave', () => {
    const lista = situacaoDoNivel('iniciante', ctx())
    expect(lista.every((s) => s.estado !== 'chave' && s.custo === null)).toBe(true)
  })

  it('com acesso Avançado vê os níveis até o AV, pela mesma regra', () => {
    const c = ctx({ acessoSemTurma: 'avancado' })
    expect(niveisVisiveis(c)).toEqual(['iniciante', 'avancado'])
    expect(nivelInicial(c)).toBe('avancado')
    expect(estados(c, 'avancado')).toEqual({ a1: 'aberto', a2: 'aberto' })
    expect(estados(c, 'iniciante').i3).toBe('bloqueado')
  })

  it('turma sem trilha configurada não segura o acervo', () => {
    const c = ctx({ turmas: [...turmas, { id: '4', nome: 'Iniciante 03', nivel: 'iniciante', trilha_inicio: null }] })
    expect(estados(c, 'iniciante').i2).toBe('aberto')
  })

  it('passo comprado quando tinha turma continua aberto', () => {
    expect(estados(ctx({ liberadas: new Set(['i3']) }), 'iniciante').i3).toBe('aberto')
  })

  it('quem tem turma segue a regra de sempre', () => {
    const c = ctx({ minhasTurmas: ['Iniciante 02'], acessoSemTurma: 'avancado' })
    const semAcesso = ctx({ minhasTurmas: ['Iniciante 02'] })
    expect(niveisVisiveis(c)).toEqual(niveisVisiveis(semAcesso))
    expect(situacaoDoNivel('avancado', c)).toEqual(situacaoDoNivel('avancado', semAcesso))
    expect(situacaoDoNivel('iniciante', c).find((s) => s.passo.id === 'i3')!.estado).toBe('chave')
  })
})
