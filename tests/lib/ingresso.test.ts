import { describe, expect, it } from 'vitest'
import { janelaDoCheckin } from '../../src/lib/dates'
import {
  aplicarNoitesExtras,
  badgeDeIngresso,
  noiteDoEvento,
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
