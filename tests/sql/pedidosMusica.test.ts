import { describe, expect, it } from 'vitest'
import {
  bancoComMigracao,
  checkinNaNoite,
  comoUsuario,
  fila,
  IDS,
  pedido,
  pessoa,
  sessaoAberta,
} from './banco'

const NOITE = '2026-10-12'
/** Hora `hh:mm` da noite de 12/10, em São Paulo. */
const as = (hhmm: string) => `2026-10-12T${hhmm}:00-03:00`

async function comTresAlunos() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.a, 'Ana')
  await pessoa(db, IDS.b, 'Beto')
  await pessoa(db, IDS.c, 'Caio')
  return db
}

describe('fila_da_noite — rodízio', () => {
  it('quem chega com 1 pedido passa na frente da 2ª música de quem pediu 20', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    for (let i = 2; i <= 20; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`))
    }
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:30'))

    const f = await fila(db, NOITE)
    expect(f.slice(0, 3).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a2',
      'spotify:track:a3',
    ])
    expect(f[0]).toMatchObject({ rodada: 1, posicao: 1 })
    expect(f[1]).toMatchObject({ rodada: 2, posicao: 2 })
  })

  it('quem chega depois de A tocar 15 entra na frente da 16ª de A', async () => {
    const db = await comTresAlunos()
    for (let i = 1; i <= 15; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`), 'tocou')
    }
    await pedido(db, IDS.a, NOITE, 'spotify:track:a16', as('21:16'))
    await pedido(db, IDS.c, NOITE, 'spotify:track:c1', as('23:00'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:c1',
      'spotify:track:a16',
    ])
  })

  it('mesma rodada: vai na frente quem fez o primeiro pedido da noite antes', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:05'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:10'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a1',
      'spotify:track:b2',
    ])
  })

  it('cancelar um pedido reorganiza as rodadas daquela pessoa', async () => {
    const db = await comTresAlunos()
    const a1 = await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:03'))
    await db.query(`update pedidos_musica set status = 'cancelado' where id = $1`, [a1])

    // A agora tem só a2, que vira rodada 1; e a chegada de A passa a ser
    // 21:01 (o cancelado não conta), ainda antes de B
    expect(await fila(db, NOITE)).toEqual([
      { track_uri: 'spotify:track:a2', rodada: 1, posicao: 1 },
      { track_uri: 'spotify:track:b1', rodada: 1, posicao: 2 },
      { track_uri: 'spotify:track:b2', rodada: 2, posicao: 3 },
    ])
  })

  it('quem já tocou 1 e pede outra mais tarde entra na rodada 2', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'), 'enviado')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a3', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:03'), 'tocou')
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('23:00'))

    // a3 é rodada 3 (2 já enviados + 1); b2 é rodada 2 → b2 primeiro
    expect((await fila(db, NOITE)).map((p) => [p.track_uri, p.rodada])).toEqual([
      ['spotify:track:b2', 2],
      ['spotify:track:a3', 3],
    ])
  })

  it('só olha a noite pedida', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, '2026-10-11', 'spotify:track:ontem', '2026-10-11T22:00:00-03:00')
    await pedido(db, IDS.a, NOITE, 'spotify:track:hoje', as('22:00'))
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual(['spotify:track:hoje'])
  })
})

describe('pedir_musica', () => {
  async function preparado() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.a, 'Ana')
    await sessaoAberta(db, IDS.prof, NOITE)
    await checkinNaNoite(db, IDS.a, as('21:30'))
    await comoUsuario(db, IDS.a)
    return db
  }
  const pedir = (db: Awaited<ReturnType<typeof bancoComMigracao>>, uri: string) =>
    db.query(`select pedir_musica($1, 'Título', 'Artista', null, 180000)`, [uri])

  it('aceita quem tem check-in na noite da sessão', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual(['spotify:track:abc123'])
  })

  it('recusa sem sessão aberta', async () => {
    const db = await preparado()
    await db.query(`update dj_sessoes set fechada_em = now()`)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('O Modo DJ não está ligado agora')
  })

  it('recusa sem check-in na noite', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, '2026-10-11T22:00:00-03:00') // noite anterior
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Faça seu check-in para pedir música')
  })

  it('recusa quem só tem check-in com presença anulada', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, as('22:00'), true)
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Faça seu check-in para pedir música')
  })

  it('a madrugada (antes das 5h) ainda é a noite da sessão', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, '2026-10-13T01:30:00-03:00')
    await comoUsuario(db, IDS.b)
    await pedir(db, 'spotify:track:madrugada')
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toContain('spotify:track:madrugada')
  })

  it('recusa música já pedida na noite, por qualquer pessoa', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, as('22:00'))
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Essa música já foi pedida hoje')
  })

  it('aceita de novo uma música cujo pedido foi cancelado', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    await db.query(`update pedidos_musica set status = 'cancelado'`)
    await pedir(db, 'spotify:track:abc123')
    expect((await fila(db, NOITE)).length).toBe(1)
  })

  it('recusa URI que não é de faixa do Spotify', async () => {
    const db = await preparado()
    for (const ruim of ['spotify:episode:abc', 'spotify:track:abc 1', "spotify:track:x'; drop table x;--", '']) {
      await expect(pedir(db, ruim)).rejects.toThrow('Música inválida')
    }
  })

  it('recusa deslogado', async () => {
    const db = await preparado()
    await comoUsuario(db, null)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Você precisa entrar primeiro')
  })
})

describe('cancelar_pedido', () => {
  async function comPedidoDaAna() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Beto')
    await sessaoAberta(db, IDS.prof, NOITE)
    const id = await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    return { db, id }
  }
  const cancelar = (db: Awaited<ReturnType<typeof bancoComMigracao>>, id: string) =>
    db.query(`select cancelar_pedido($1)`, [id])

  it('a dona do pedido cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.a)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('o DJ da sessão cancela qualquer um', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.prof)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('organizador cancela qualquer um', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.org)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('outro aluno não cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.b)
    await expect(cancelar(db, id)).rejects.toThrow('Você só pode cancelar os seus pedidos')
  })

  it('pedido já enviado não cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await db.query(`update pedidos_musica set status = 'enviado' where id = $1`, [id])
    await comoUsuario(db, IDS.a)
    await expect(cancelar(db, id)).rejects.toThrow('Esse pedido já foi para o Spotify')
  })
})

describe('ligar_modo_dj / desligar_modo_dj', () => {
  async function doisProfessores() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof Um', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.prof2, 'Prof Dois', { cargo: 'Diretor(a) de Ensino', conectado: true })
    return db
  }
  const ligar = async (db: Awaited<ReturnType<typeof bancoComMigracao>>, assumir: boolean) =>
    (await db.query<{ r: unknown }>(`select ligar_modo_dj($1) as r`, [assumir])).rows[0].r
  const abertas = async (db: Awaited<ReturnType<typeof bancoComMigracao>>) =>
    (await db.query<{ dj_user_id: string }>(`select dj_user_id from dj_sessoes where fechada_em is null`)).rows

  it('liga e abre a sessão', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    expect(await ligar(db, false)).toEqual({ tipo: 'ligado' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof }])
  })

  it('ligar de novo o próprio Modo DJ não abre outra sessão', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    expect(await ligar(db, false)).toEqual({ tipo: 'ligado' })
    expect((await abertas(db)).length).toBe(1)
  })

  it('com outro DJ ligado, avisa quem é, e só assume se pedir', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    await comoUsuario(db, IDS.prof2)
    expect(await ligar(db, false)).toEqual({ tipo: 'ocupado', dj_nome: 'Prof Um' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof }])

    expect(await ligar(db, true)).toEqual({ tipo: 'ligado' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof2 }])
    const motivo = await db.query<{ motivo_fechamento: string }>(
      `select motivo_fechamento from dj_sessoes where dj_user_id = $1`,
      [IDS.prof],
    )
    expect(motivo.rows[0].motivo_fechamento).toBe('assumida')
  })

  it('aluno não liga', async () => {
    const db = await doisProfessores()
    await pessoa(db, IDS.a, 'Ana')
    await comoUsuario(db, IDS.a)
    await expect(ligar(db, false)).rejects.toThrow('Só professores podem ligar o Modo DJ')
  })

  it('professor sem Spotify conectado não liga', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await comoUsuario(db, IDS.prof)
    await expect(ligar(db, false)).rejects.toThrow('Conecte seu Spotify antes de ligar o Modo DJ')
  })

  it('desligar fecha a própria sessão; outro professor não desliga a dos outros', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    await comoUsuario(db, IDS.prof2)
    await db.query(`select desligar_modo_dj()`)
    expect((await abertas(db)).length).toBe(1)
    await comoUsuario(db, IDS.prof)
    await db.query(`select desligar_modo_dj()`)
    expect(await abertas(db)).toEqual([])
  })
})

describe('conexão vista pelo app', () => {
  it('minha_conexao_dj não devolve as chaves', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await comoUsuario(db, IDS.prof)
    const r = (await db.query<{ r: Record<string, unknown> }>(`select minha_conexao_dj() as r`)).rows[0].r
    expect(r).toEqual({ conectado: true, spotify_nome: null, plano: null })
    expect(JSON.stringify(r)).not.toContain('acesso')
  })

  it('sem conexão devolve conectado = false', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await comoUsuario(db, IDS.a)
    const r = (await db.query<{ r: Record<string, unknown> }>(`select minha_conexao_dj() as r`)).rows[0].r
    expect(r).toEqual({ conectado: false, spotify_nome: null, plano: null })
  })

  it('desconectar apaga a conexão e fecha a sessão aberta da pessoa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await comoUsuario(db, IDS.prof)
    await db.query(`select ligar_modo_dj(false)`)
    await db.query(`select desconectar_spotify()`)
    expect((await db.query(`select 1 from dj_conexoes`)).rows.length).toBe(0)
    expect((await db.query(`select 1 from dj_sessoes where fechada_em is null`)).rows.length).toBe(0)
  })
})

describe('reservar_proximo_pedido / devolver_pedido (loop)', () => {
  async function comFila() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Beto')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:02'))
    return db
  }
  const reservar = async (db: Awaited<ReturnType<typeof bancoComMigracao>>) =>
    (await db.query<{ track_uri: string; status: string }>(
      `select track_uri, status from reservar_proximo_pedido($1)`,
      [NOITE],
    )).rows

  it('reserva o primeiro do rodízio e marca como enviado', async () => {
    const db = await comFila()
    expect(await reservar(db)).toEqual([{ track_uri: 'spotify:track:a1', status: 'enviado' }])
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a2',
    ])
  })

  it('duas reservas seguidas nunca devolvem o mesmo pedido', async () => {
    const db = await comFila()
    const [r1, r2] = [await reservar(db), await reservar(db)]
    expect(r1[0].track_uri).not.toBe(r2[0].track_uri)
  })

  it('fila vazia não reserva nada', async () => {
    const db = await bancoComMigracao()
    expect(await reservar(db)).toEqual([])
  })

  it('devolver põe o pedido de volta no lugar dele', async () => {
    const db = await comFila()
    await reservar(db)
    const id = (await db.query<{ id: string }>(`select id from pedidos_musica where track_uri = 'spotify:track:a1'`)).rows[0].id
    await db.query(`select devolver_pedido($1)`, [id])
    expect((await fila(db, NOITE))[0].track_uri).toBe('spotify:track:a1')
  })
})
describe('migração', () => {
  it('pode rodar mais de uma vez', async () => {
    const db = await bancoComMigracao()
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(
      new URL('../../supabase/migracoes/029-pedidos-de-musica.sql', import.meta.url),
      'utf8',
    )
    await expect(db.exec(sql)).resolves.toBeDefined()
  })
})
