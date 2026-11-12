import { describe, expect, it } from 'vitest'
import { computeBadges } from '../../src/lib/badges'
import { chaveDestaque, colecao, escolherDestaques } from '../../src/lib/destaques'
import type { Badge } from '../../src/lib/types'

const dias = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(2026, 0, 1 + i * 7, 22))

const especial = (id: string, titulo: string): Badge => ({
  id: `custom-${id}`,
  emoji: '🏆',
  titulo,
  descricao: '',
})

/** Perfil cheio como o do Felipão: cargos, turma, especiais e marcos. */
const cheio = () =>
  computeBadges({
    userId: 'u',
    turmas: [{ turma: 'Avançada', papel_danca: 'Condutor(a)' }],
    cargos: ['DJ', 'Professor(a)'],
    distintivosCustom: [especial('a', 'Espaço Livre'), especial('b', 'Gusttavo Lima')],
    checkinDates: dias(30),
    parceiros: 59,
    musicasTocadas: 17,
  })

describe('destaques do perfil', () => {
  it('cargo e turma ficam fora da coleção (já estão nos chips)', () => {
    const ids = colecao(cheio()).map((b) => b.id)
    expect(ids.some((id) => id.startsWith('cargo-') || id.startsWith('turma-'))).toBe(false)
    expect(ids).toContain('custom-a')
  })

  it('chave de marco não tem o nível', () => {
    const presenca = cheio().find((b) => b.id.startsWith('presenca-'))!
    expect(chaveDestaque(presenca)).toBe('presenca')
    expect(chaveDestaque(especial('a', 'x'))).toBe('custom-a')
  })

  it('sem escolha: no máximo 3, especiais antes dos marcos, e o marco mais alto antes', () => {
    const d = escolherDestaques(cheio(), null)
    expect(d).toHaveLength(3)
    expect(d.map((b) => b.id).slice(0, 2)).toEqual(['custom-a', 'custom-b'])
    // 59 duplas (nível 4 de 4) passa à frente de 17 músicas (2 de 4)
    expect(d[2].id).toBe('rodizio-50')
  })

  it('com escolha: na ordem salva, ignorando o que não existe mais', () => {
    const d = escolherDestaques(cheio(), ['dj', 'sumiu', 'presenca'])
    expect(d.map(chaveDestaque)).toEqual(['dj', 'presenca'])
  })

  it('escolha que sumiu toda volta ao automático', () => {
    const d = escolherDestaques(cheio(), ['caca-2025-01-01'])
    expect(d[0].id).toBe('custom-a')
  })

  it('caça pendente nunca vira destaque', () => {
    const pendente: Badge = {
      id: 'caca-atual',
      emoji: '🎯',
      titulo: 'Caça',
      descricao: '',
      caca: { pegos: [], faltam: [], pendente: true },
    }
    expect(escolherDestaques([pendente], ['caca-atual'])).toEqual([])
  })
})

describe('destaques com distintivo de ingresso', () => {
  const linha = (estado: 'garantido' | 'presenca') => ({
    desafio_id: 'X',
    titulo: 'Forró na Rep',
    estado,
    emoji: estado === 'garantido' ? '🎟️' : '🎉',
    titulo_distintivo: estado === 'garantido' ? 'Ingresso garantido' : 'Marquei presença',
    desde: null,
  })
  const com = (estado: 'garantido' | 'presenca') =>
    computeBadges({
      userId: 'u',
      turmas: [],
      checkinDates: dias(30),
      parceiros: 59,
      distintivosCustom: [especial('a', 'Espaço Livre')],
      ingressos: [linha(estado)],
    })

  it('o salvo continua escolhido quando a linha passa de garantido para presenca', () => {
    expect(escolherDestaques(com('garantido'), ['ingresso-X']).map((b) => b.id)).toEqual(['ingresso-X'])
    const depois = escolherDestaques(com('presenca'), ['ingresso-X'])
    expect(depois.map((b) => b.id)).toEqual(['ingresso-X'])
    expect(depois[0].emoji).toBe('🎉')
  })

  it('sem escolha: depois do especial e antes dos marcos', () => {
    const d = escolherDestaques(com('garantido'), null).map((b) => b.id)
    expect(d.slice(0, 2)).toEqual(['custom-a', 'ingresso-X'])
  })
})