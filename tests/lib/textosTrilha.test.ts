import { describe, expect, it } from 'vitest'
import { comoAbriu, linhaCronograma, quandoLibera } from '../../src/lib/textosTrilha'
import type { LinhaCronograma, PassoComSituacao } from '../../src/lib/trilha'

const s = (extra: Partial<PassoComSituacao>): PassoComSituacao => ({
  passo: {
    id: 'p1', nivel: 'iniciante', ordem: 1, nome: 'Giro', video_frente: 'dQw4w9WgXcQ',
    video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
  },
  numero: 1,
  estado: 'bloqueado',
  motivo: null,
  data: '2026-10-26',
  ...extra,
})

describe('quandoLibera', () => {
  it('conta os dias até a aula', () => {
    expect(quandoLibera(s({}), '2026-10-20')).toBe('Libera em 6 dias')
    expect(quandoLibera(s({}), '2026-10-25')).toBe('Libera amanhã')
    expect(quandoLibera(s({}), '2026-10-26')).toBe('Libera hoje')
  })

  it('passo de chave lembra que dá para adiantar', () => {
    expect(quandoLibera(s({ estado: 'chave' }), '2026-10-20')).toBe('Libera em 6 dias, ou agora com 1 chave')
  })

  it('sem data: abre com a turma', () => {
    expect(quandoLibera(s({ data: null }), '2026-10-20')).toBe('Abre com a turma')
  })
})

describe('comoAbriu', () => {
  it('diz por que o passo está aberto', () => {
    expect(comoAbriu(s({ estado: 'aberto', motivo: 'chave' }))).toBe('Liberado com chave')
    expect(comoAbriu(s({ estado: 'aberto', motivo: 'revisao' }))).toBe('Revisão do nível anterior')
    expect(comoAbriu(s({ estado: 'aberto', motivo: 'data', data: '2026-10-12' }))).toMatch(/^Ensinado na aula de 12/)
    expect(comoAbriu(s({ estado: 'aberto', motivo: 'equipe', data: null }))).toBe('Aberto')
  })
})

describe('linhaCronograma', () => {
  const passo = s({}).passo
  const linha = (data: string, tipo: 'aula' | 'reposicao' | 'cancelada', extra: Partial<LinhaCronograma['aula']> = {}): LinhaCronograma => ({
    aula: { data, tipo, motivo: null, reposicaoEm: null, ...extra },
    passo: tipo === 'cancelada' ? null : passo,
  })

  it('aula que já passou abriu o vídeo; a próxima ganha destaque; as outras estão agendadas', () => {
    expect(linhaCronograma(linha('2026-10-12', 'aula'), '2026-10-20', false)).toEqual({
      texto: 'Dado · vídeo aberto para a turma', tom: 'feito',
    })
    expect(linhaCronograma(linha('2026-10-26', 'aula'), '2026-10-20', true)).toEqual({
      texto: 'Próxima aula', tom: 'proxima',
    })
    expect(linhaCronograma(linha('2026-11-02', 'aula'), '2026-10-20', false)).toEqual({ texto: 'Agendado', tom: 'normal' })
  })

  it('cancelada com e sem reposição, e a própria reposição', () => {
    expect(linhaCronograma(linha('2026-10-26', 'cancelada', { reposicaoEm: '2026-10-31' }), '2026-10-20', false).texto).toMatch(
      /^Reposta em 31.* · trilha não atrasa$/,
    )
    expect(linhaCronograma(linha('2026-10-26', 'cancelada', { motivo: 'Finados' }), '2026-10-20', false)).toEqual({
      texto: 'Finados · trilha andou uma semana', tom: 'cancelada',
    })
    expect(linhaCronograma(linha('2026-10-31', 'reposicao'), '2026-10-20', false).tom).toBe('reposicao')
  })
})
