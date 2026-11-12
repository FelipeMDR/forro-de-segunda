import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  bancoComMigracao,
  checkinNaNoite,
  comoUsuario,
  desafioIngresso,
  IDS,
  pessoa,
} from './banco'

type Banco = Awaited<ReturnType<typeof bancoComMigracao>>

async function comFesta() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.org, 'Org', { organizador: true })
  await pessoa(db, IDS.a, 'Ana')
  await pessoa(db, IDS.b, 'Beto')
  const desafio = await desafioIngresso(db)
  await db.query(`insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [
    desafio,
    IDS.a,
  ])
  return { db, desafio }
}

async function ingressos(db: Banco, uid: string) {
  const r = await db.query<{
    desafio_id: string
    estado: string
    emoji: string
    titulo_distintivo: string
    desde: string
  }>(`select * from ingressos_do_perfil($1)`, [uid])
  return r.rows
}

describe('desafio de ingresso — segredo da planilha', () => {
  it('aluno não gera segredo', async () => {
    const { db, desafio } = await comFesta()
    await comoUsuario(db, IDS.a)
    await expect(db.query(`select gerar_segredo_ingresso($1)`, [desafio])).rejects.toThrow(
      'Só a organização liga a planilha',
    )
  })

  it('só desafio de ingresso tem segredo', async () => {
    const { db } = await comFesta()
    const comum = await db.query<{ id: string }>(
      `insert into challenges (data_inicio, data_fim) values ('2026-11-01', '2026-11-30') returning id`,
    )
    await comoUsuario(db, IDS.org)
    await expect(
      db.query(`select gerar_segredo_ingresso($1)`, [comum.rows[0].id]),
    ).rejects.toThrow('Este desafio não é de ingresso')
  })

  it('organizador recebe 64 caracteres e só o hash fica guardado; gerar de novo troca o hash', async () => {
    const { db, desafio } = await comFesta()
    await comoUsuario(db, IDS.org)
    const um = (
      await db.query<{ s: string }>(`select gerar_segredo_ingresso($1) as s`, [desafio])
    ).rows[0].s
    expect(um).toHaveLength(64)
    const h1 = await db.query<{ segredo_hash: string }>(
      `select segredo_hash from ingresso_segredos where challenge_id = $1`,
      [desafio],
    )
    expect(h1.rows[0].segredo_hash).toBe(createHash('sha256').update(um).digest('hex'))

    const dois = (
      await db.query<{ s: string }>(`select gerar_segredo_ingresso($1) as s`, [desafio])
    ).rows[0].s
    expect(dois).not.toBe(um)
    const h2 = await db.query<{ segredo_hash: string }>(
      `select segredo_hash from ingresso_segredos where challenge_id = $1`,
      [desafio],
    )
    expect(h2.rows).toHaveLength(1)
    expect(h2.rows[0].segredo_hash).toBe(createHash('sha256').update(dois).digest('hex'))
  })
})

describe('desafio de ingresso — distintivo derivado', () => {
  it('membro sem check-in tem ingresso garantido, com os textos padrão', async () => {
    const { db, desafio } = await comFesta()
    const r = await ingressos(db, IDS.a)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      desafio_id: desafio,
      estado: 'garantido',
      emoji: '🎟️',
      titulo_distintivo: 'Forró na Rep 2026.2 · Ingresso garantido',
    })
  })

  it('check-in dentro do horário vira presença, com os textos padrão', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-05T18:00:00-03:00')
    const r = await ingressos(db, IDS.a)
    expect(r[0]).toMatchObject({
      estado: 'presenca',
      emoji: '🎉',
      titulo_distintivo: 'Forró na Rep 2026.2 · Marquei presença',
    })
    expect(new Date(r[0].desde).toISOString()).toBe('2026-12-05T21:00:00.000Z')
  })

  it('textos configurados no desafio vencem os padrões', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    const d = await desafioIngresso(db, { ingressoTitulo: 'Tô dentro' })
    await db.query(`insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [
      d,
      IDS.a,
    ])
    expect((await ingressos(db, IDS.a))[0].titulo_distintivo).toBe('Tô dentro')
  })

  it('check-in de madrugada (01:30 do dia seguinte) ainda é da festa', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-06T01:30:00-03:00')
    expect((await ingressos(db, IDS.a))[0].estado).toBe('presenca')
  })

  it('04:01 e 17:59 ficam fora do horário', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-06T04:01:00-03:00')
    await checkinNaNoite(db, IDS.a, '2026-12-05T17:59:00-03:00')
    expect((await ingressos(db, IDS.a))[0].estado).toBe('garantido')
  })

  it('check-in anulado no horário não conta', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-05T22:00:00-03:00', true)
    expect((await ingressos(db, IDS.a))[0].estado).toBe('garantido')
  })

  it('"desde" é o primeiro check-in que valeu', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-05T17:00:00-03:00')
    await checkinNaNoite(db, IDS.a, '2026-12-05T23:00:00-03:00')
    await checkinNaNoite(db, IDS.a, '2026-12-06T02:00:00-03:00')
    const r = await ingressos(db, IDS.a)
    expect(new Date(r[0].desde).toISOString()).toBe('2026-12-06T02:00:00.000Z')
  })

  it('quem não é membro não recebe linha', async () => {
    const { db } = await comFesta()
    await checkinNaNoite(db, IDS.b, '2026-12-05T22:00:00-03:00')
    expect(await ingressos(db, IDS.b)).toEqual([])
  })
})

describe('desafio de ingresso — correção da presença', () => {
  it('só organizador corrige', async () => {
    const { db, desafio } = await comFesta()
    await comoUsuario(db, IDS.a)
    await expect(
      db.query(`select marcar_presenca_ingresso($1, $2, true)`, [desafio, IDS.a]),
    ).rejects.toThrow()
  })

  it('false vence o check-in válido; null volta ao automático', async () => {
    const { db, desafio } = await comFesta()
    await checkinNaNoite(db, IDS.a, '2026-12-05T22:00:00-03:00')
    await comoUsuario(db, IDS.org)
    await db.query(`select marcar_presenca_ingresso($1, $2, false)`, [desafio, IDS.a])
    expect((await ingressos(db, IDS.a))[0].estado).toBe('garantido')
    await db.query(`select marcar_presenca_ingresso($1, $2, null)`, [desafio, IDS.a])
    expect((await ingressos(db, IDS.a))[0].estado).toBe('presenca')
    const sobra = await db.query(`select 1 from ingresso_presencas`)
    expect(sobra.rows).toHaveLength(0)
  })

  it('true sem check-in dá presença', async () => {
    const { db, desafio } = await comFesta()
    await comoUsuario(db, IDS.org)
    await db.query(`select marcar_presenca_ingresso($1, $2, true)`, [desafio, IDS.a])
    expect((await ingressos(db, IDS.a))[0].estado).toBe('presenca')
  })
})

describe('desafio de ingresso — convite vira membro', () => {
  it('convite da planilha vira membro da planilha e o convite some', async () => {
    const { db, desafio } = await comFesta()
    await db.query(
      `insert into challenge_convidados (challenge_id, telefone, nome, origem)
       values ($1, '35999998888', 'Cida', 'planilha')`,
      [desafio],
    )
    await db.query(`select membro_por_convite($1, '(35) 99999-8888')`, [IDS.b])
    const m = await db.query(
      `select origem from challenge_members where challenge_id = $1 and user_id = $2`,
      [desafio, IDS.b],
    )
    expect(m.rows).toEqual([{ origem: 'planilha' }])
    const c = await db.query(`select 1 from challenge_convidados`)
    expect(c.rows).toHaveLength(0)
  })

  it('convite manual continua manual', async () => {
    const { db, desafio } = await comFesta()
    await db.query(
      `insert into challenge_convidados (challenge_id, telefone) values ($1, '35999998888')`,
      [desafio],
    )
    await db.query(`select membro_por_convite($1, '35999998888')`, [IDS.b])
    const m = await db.query(`select origem from challenge_members where user_id = $1`, [IDS.b])
    expect(m.rows).toEqual([{ origem: 'manual' }])
  })
})

describe('desafio de ingresso — estrutura', () => {
  it('data do evento exige entrada restrita e os dois horários', async () => {
    const db = await bancoComMigracao()
    await expect(
      db.query(
        `insert into challenges (data_inicio, data_fim, evento_data, evento_inicio, evento_fim)
         values ('2026-11-01', '2026-12-05', '2026-12-05', '18:00', '04:00')`,
      ),
    ).rejects.toThrow()
    await expect(
      db.query(
        `insert into challenges (data_inicio, data_fim, entrada_restrita, evento_data, evento_inicio)
         values ('2026-11-01', '2026-12-05', true, '2026-12-05', '18:00')`,
      ),
    ).rejects.toThrow()
  })

  it('a migração roda duas vezes sem erro', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const db = await bancoComMigracao()
    const sql = readFileSync(
      fileURLToPath(new URL('../../supabase/migracoes/043-desafio-de-ingresso.sql', import.meta.url)),
      'utf8',
    )
    await expect(db.exec(sql)).resolves.toBeDefined()
  })
})
