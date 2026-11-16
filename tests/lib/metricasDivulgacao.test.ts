import { describe, expect, it } from 'vitest'
import {
  linhasCsvDivulgacao,
  metricasDivulgacao,
  SEM_TURMA,
  type EventoDivulgacao,
  type TipoEventoDivulgacao,
} from '../../src/lib/metricasDivulgacao'
import type { Profile } from '../../src/lib/types'

const perfil = (id: string, nome: string, turmas: string[]): Profile =>
  ({
    id,
    nome,
    turmas: turmas.map((turma) => ({ turma, papel_danca: null })),
  }) as unknown as Profile

const PERFIS = [
  perfil('ana', 'Ana', ['Iniciante 01']),
  perfil('beto', 'Beto', ['Iniciante 01']),
  perfil('caio', 'Caio', ['Avançado']),
  perfil('duda', 'Duda', ['Iniciante 01', 'Avançado']),
  perfil('eva', 'Eva', []),
]

const REP = 'forro-na-rep-2026-12'
const WS = 'workshop-2026-12'
const ev = (
  user_id: string,
  evento: TipoEventoDivulgacao,
  criado_em = '2026-11-20T21:00:00-03:00',
  divulgacao = REP,
): EventoDivulgacao => ({ divulgacao, user_id, evento, criado_em })

describe('metricasDivulgacao', () => {
  const eventos = [
    ev('ana', 'visto'),
    ev('ana', 'clique'),
    ev('ana', 'clique', '2026-11-21T10:00:00-03:00'),
    ev('beto', 'visto'),
    ev('beto', 'fechou'),
    ev('caio', 'visto'),
    ev('caio', 'detalhes'),
    ev('duda', 'clique'), // clicou sem "visto" anotado: conta como quem viu
    ev('eva', 'visto'),
    ev('caio', 'visto', '2026-11-20T21:00:00-03:00', WS),
  ]
  const [rep, ws] = metricasDivulgacao(eventos, PERFIS)

  it('conta pessoas distintas, não toques', () => {
    expect(rep).toMatchObject({
      divulgacao: REP,
      titulo: 'Forró na Rep',
      viram: 5,
      detalhes: 1,
      clicaram: 2,
      cliques: 3,
      fecharam: 1,
      ignoraram: 3,
    })
  })

  it('separa as ofertas e segue a ordem da configuração', () => {
    expect(ws).toMatchObject({ divulgacao: WS, viram: 1, clicaram: 0, ignoraram: 1 })
  })

  it('recorta por turma; duas turmas contam nas duas; sem turma vira "Sem turma"', () => {
    const por = Object.fromEntries(rep.porTurma.map((t) => [t.turma, t]))
    expect(por['Iniciante 01']).toMatchObject({ viram: 3, clicaram: 2, fecharam: 1, pessoas: 3 })
    expect(por['Avançado']).toMatchObject({ viram: 2, clicaram: 1, detalhes: 1, pessoas: 2 })
    expect(por[SEM_TURMA]).toMatchObject({ viram: 1, clicaram: 0, pessoas: 1 })
  })

  it('a turma que mais foi ao formulário vem primeiro', () => {
    expect(rep.porTurma.map((t) => t.turma)).toEqual(['Iniciante 01', 'Avançado', SEM_TURMA])
  })

  it('agrupa os cliques por dia no fuso de Itajubá', () => {
    // 21/11 00:30 em Itajubá ainda é 21/11, mesmo sendo 03:30 UTC
    const [m] = metricasDivulgacao(
      [...eventos, ev('beto', 'clique', '2026-11-21T00:30:00-03:00')],
      PERFIS,
    )
    expect(m.cliquesPorDia).toEqual([
      { dia: '2026-11-20', pessoas: 2 },
      { dia: '2026-11-21', pessoas: 2 },
    ])
  })
})

describe('linhasCsvDivulgacao', () => {
  it('uma linha por evento, em ordem, com nome, turma e o que fez por extenso', () => {
    const { cabecalho, linhas } = linhasCsvDivulgacao(
      [ev('duda', 'clique', '2026-11-21T10:00:00-03:00'), ev('eva', 'fechou')],
      PERFIS,
    )
    expect(cabecalho).toEqual(['Data e hora', 'Oferta', 'O que fez', 'Pessoa', 'Turma'])
    expect(linhas.map((l) => l.slice(1))).toEqual([
      ['Forró na Rep', 'Fechou o card', 'Eva', SEM_TURMA],
      ['Forró na Rep', 'Tocou em Comprar', 'Duda', 'Iniciante 01, Avançado'],
    ])
  })
})
