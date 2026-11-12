import { describe, expect, it } from 'vitest'
import { ativoAgora, janelaDoCheckin } from '../../src/lib/dates'
import {
  alvosDaNoiteExtra,
  aplicarNoitesExtras,
  badgeDeIngresso,
  fimQueCobreAFesta,
  noiteDoEvento,
  rotuloFesta,
  textosPadraoIngresso,
} from '../../src/lib/ingresso'
import type { Challenge, IngressoConfig, IngressoPerfil } from '../../src/lib/types'

function desafio(parcial: Partial<Challenge>): Challenge {
  return {
    id: 'x',
    titulo: 'Desafio',
    descricao: null,
    data_inicio: '2026-08-01',
    data_fim: '2026-12-20',
    janelas: [],
    local: null,
    entrada_restrita: false,
    modalidades: ['checkin'],
    forrodex: false,
    criado_por: null,
    participantes: 0,
    sou_membro: false,
    ingresso: null,
    noites_extras: [],
    ...parcial,
  }
}

const cfg = (para: string[]): IngressoConfig => ({
  evento_data: '2026-12-05',
  evento_inicio: '18:00',
  evento_fim: '04:00',
  noite_extra_para: para,
  ...textosPadraoIngresso('Forró na Rep 2026.2'),
})

const espacoLivre = desafio({
  id: 'livre',
  titulo: 'Espaço Livre',
  // sábado (6) 20:00–23:30
  janelas: [{ dia_semana: 6, hora_inicio: '20:00', hora_fim: '23:30' }],
})
const ingresso = desafio({
  id: 'rep',
  titulo: 'Forró na Rep 2026.2',
  data_inicio: '2026-12-05',
  data_fim: '2026-12-05',
  ingresso: cfg(['livre']),
})
const NOITE = { data: '2026-12-05', hora_inicio: '18:00', hora_fim: '04:00' }

describe('textosPadraoIngresso', () => {
  it('monta os textos dos dois estados', () => {
    expect(textosPadraoIngresso('Forró na Rep 2026.2')).toEqual({
      garantido: { emoji: '🎟️', titulo: 'Forró na Rep 2026.2 · Ingresso garantido' },
      presenca: { emoji: '🎉', titulo: 'Forró na Rep 2026.2 · Marquei presença' },
    })
  })
})

describe('noiteDoEvento', () => {
  it('lê a noite da configuração', () => {
    expect(noiteDoEvento(cfg([]))).toEqual(NOITE)
  })
})

describe('aplicarNoitesExtras', () => {
  it('dá a noite ao desafio de ingresso e aos de noite_extra_para', () => {
    const r = aplicarNoitesExtras([espacoLivre, ingresso])
    expect(r.find((c) => c.id === 'livre')!.noites_extras).toEqual([NOITE])
    expect(r.find((c) => c.id === 'rep')!.noites_extras).toEqual([NOITE])
  })

  it('não duplica ao rodar duas vezes e não muda a entrada', () => {
    const uma = aplicarNoitesExtras([espacoLivre, ingresso])
    const duas = aplicarNoitesExtras(uma)
    expect(duas.find((c) => c.id === 'livre')!.noites_extras).toEqual([NOITE])
    expect(espacoLivre.noites_extras).toEqual([])
  })

  it('ignora ids que não existem', () => {
    const r = aplicarNoitesExtras([{ ...ingresso, ingresso: cfg(['fantasma']) }])
    expect(r).toHaveLength(1)
    expect(r[0].noites_extras).toEqual([NOITE])
  })
})

describe('janelaDoCheckin com noite extra', () => {
  const livre = aplicarNoitesExtras([espacoLivre, ingresso])[0]

  it('aceita antes do horário normal na data da noite', () => {
    expect(janelaDoCheckin(new Date(2026, 11, 5, 18, 30), livre)).toBe('2026-12-05')
  })
  it('aceita a madrugada seguinte até o fim', () => {
    expect(janelaDoCheckin(new Date(2026, 11, 6, 1, 30), livre)).toBe('2026-12-05')
  })
  it('recusa depois do fim', () => {
    expect(janelaDoCheckin(new Date(2026, 11, 6, 4, 1), livre)).toBeNull()
  })
  it('vale só naquela data', () => {
    expect(janelaDoCheckin(new Date(2026, 11, 12, 18, 30), livre)).toBeNull()
  })
  it('mantém a janela normal', () => {
    expect(janelaDoCheckin(new Date(2026, 11, 12, 21, 0), livre)).toBe('2026-12-12')
  })
  it('vale no próprio desafio de ingresso, sem janelas', () => {
    const rep = aplicarNoitesExtras([ingresso])[0]
    expect(janelaDoCheckin(new Date(2026, 11, 5, 19, 0), rep)).toBe('2026-12-05')
  })
  it('vale mesmo com o dia suspenso', () => {
    const r = janelaDoCheckin(new Date(2026, 11, 5, 18, 30), livre, new Set(['2026-12-05']))
    expect(r).toBe('2026-12-05')
  })
})

describe('badgeDeIngresso', () => {
  const base: IngressoPerfil = {
    desafio_id: 'rep',
    titulo: 'Forró na Rep 2026.2',
    estado: 'garantido',
    emoji: '🎟️',
    titulo_distintivo: 'Ingresso garantido',
    desde: '2026-11-10',
    evento_data: '2026-12-05',
  }
  it('mantém o id entre os estados e troca o texto', () => {
    const a = badgeDeIngresso(base)
    const b = badgeDeIngresso({
      ...base,
      estado: 'presenca',
      emoji: '🎉',
      titulo_distintivo: 'Marquei presença',
    })
    expect(a.id).toBe('ingresso-rep')
    expect(b.id).toBe(a.id)
    expect(a.emoji).not.toBe(b.emoji)
    expect(a.titulo).not.toBe(b.titulo)
    expect(a.tipo).toBe('Forró na Rep 2026.2')
    expect(a.descricao).toBe('Garantiu o ingresso')
    expect(b.descricao).toBe('Marcou presença na festa')
    expect(a.alcancadoEm).toBe('2026-11-10')
  })
})

describe('alvosDaNoiteExtra', () => {
  it('lista só os outros desafios comuns que cobrem a data', () => {
    const fora = desafio({ id: 'fora', data_inicio: '2026-01-01', data_fim: '2026-02-01' })
    const alvos = alvosDaNoiteExtra([espacoLivre, ingresso, fora], '2026-12-05', 'novo')
    expect(alvos.map((c) => c.id)).toEqual(['livre'])
  })

  it('nunca oferece o próprio desafio', () => {
    expect(alvosDaNoiteExtra([espacoLivre], '2026-12-05', 'livre')).toEqual([])
  })
})

describe('ativoAgora', () => {
  // A festa de 05/12 vira a noite; o desafio termina no dia da festa
  const rep = aplicarNoitesExtras([ingresso])[0]

  it('vale no período, como challengePhase', () => {
    expect(ativoAgora(rep, new Date(2026, 11, 5, 12, 0))).toBe(true)
    expect(ativoAgora(rep, new Date(2026, 11, 4, 12, 0))).toBe(false)
  })
  it('na madrugada seguinte, com a noite extra aberta, ainda vale', () => {
    expect(ativoAgora(rep, new Date(2026, 11, 6, 1, 30))).toBe(true)
    expect(ativoAgora(rep, new Date(2026, 11, 6, 4, 0))).toBe(true)
  })
  it('depois que a noite fecha, encerrou', () => {
    expect(ativoAgora(rep, new Date(2026, 11, 6, 4, 1))).toBe(false)
    expect(ativoAgora(rep, new Date(2026, 11, 6, 12, 0))).toBe(false)
  })
  it('vale para o desafio que ganhou a noite, mesmo fora do período dele', () => {
    const livre = aplicarNoitesExtras([
      { ...espacoLivre, data_fim: '2026-12-05' },
      ingresso,
    ]).find((c) => c.id === 'livre')!
    expect(ativoAgora(livre, new Date(2026, 11, 6, 2, 0))).toBe(true)
  })
  it('sem noite extra, é só o período', () => {
    expect(ativoAgora(espacoLivre, new Date(2026, 11, 21, 1, 0))).toBe(false)
  })
})

describe('fimQueCobreAFesta', () => {
  it('festa que vira a noite no último dia: o fim passa para o dia seguinte', () => {
    expect(fimQueCobreAFesta('2026-12-05', cfg([]))).toBe('2026-12-06')
  })
  it('na virada de mês e de ano', () => {
    expect(fimQueCobreAFesta('2026-12-31', { ...cfg([]), evento_data: '2026-12-31' })).toBe(
      '2027-01-01',
    )
  })
  it('fim já depois da festa fica como está', () => {
    expect(fimQueCobreAFesta('2026-12-20', cfg([]))).toBe('2026-12-20')
  })
  it('festa que não vira a noite não mexe no fim', () => {
    expect(
      fimQueCobreAFesta('2026-12-05', { ...cfg([]), evento_inicio: '14:00', evento_fim: '22:00' }),
    ).toBe('2026-12-05')
  })
})

describe('rotuloFesta', () => {
  it('descreve data e horário', () => {
    expect(rotuloFesta(cfg([]))).toBe('Festa em 05/12, das 18:00 às 04:00')
  })
})
