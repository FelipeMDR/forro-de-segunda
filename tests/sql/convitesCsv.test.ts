import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bancoComMigracao, IDS, pessoa } from './banco'

/**
 * Migração 044: convites importados por CSV antes da correção foram
 * gravados com os 10 ÚLTIMOS dígitos do celular ("35988887777" →
 * "5988887777", DDD 59). A migração recalcula a chave a partir do valor
 * original (`telefone_exibicao`) e põe no desafio quem já criou conta e
 * ficou de fora por causa disso.
 */

const MIGRACAO_044 = readFileSync(
  fileURLToPath(new URL('../../supabase/migracoes/044-convites-com-ddd.sql', import.meta.url)),
  'utf8',
)

async function cenario() {
  const db = await bancoComMigracao()
  const r = await db.query<{ id: string }>(
    `insert into challenges (titulo, data_inicio, data_fim, entrada_restrita)
     values ('Festa fechada', '2026-11-01', '2026-12-31', true) returning id`,
  )
  return { db, desafio: r.rows[0].id }
}

async function convite(
  db: Awaited<ReturnType<typeof bancoComMigracao>>,
  desafio: string,
  telefone: string,
  exibicao: string | null,
  nome = 'Convidada',
) {
  await db.query(
    `insert into challenge_convidados (challenge_id, telefone, telefone_exibicao, nome)
     values ($1, $2, $3, $4)`,
    [desafio, telefone, exibicao, nome],
  )
}

async function convites(db: Awaited<ReturnType<typeof bancoComMigracao>>) {
  const r = await db.query<{ telefone: string; nome: string }>(
    `select telefone, nome from challenge_convidados order by telefone`,
  )
  return r.rows
}

describe('migração 044 — convites com o DDD certo', () => {
  it('recalcula a chave do convite quebrado a partir do valor original', async () => {
    const { db, desafio } = await cenario()
    await convite(db, desafio, '5988887777', '(35) 98888-7777')
    await db.exec(MIGRACAO_044)
    expect(await convites(db)).toEqual([{ telefone: '3588887777', nome: 'Convidada' }])
  })

  it('quem já criou conta e ficou de fora entra no desafio e sai da espera', async () => {
    const { db, desafio } = await cenario()
    await pessoa(db, IDS.a, 'Ana')
    await db.query(`update profiles set telefone = '35988887777' where id = $1`, [IDS.a])
    await convite(db, desafio, '5988887777', '35 98888-7777')
    await db.exec(MIGRACAO_044)
    const m = await db.query(
      `select origem from challenge_members where challenge_id = $1 and user_id = $2`,
      [desafio, IDS.a],
    )
    expect(m.rows).toEqual([{ origem: 'manual' }])
    expect(await convites(db)).toEqual([])
  })

  it('convite quebrado que duplica um convite certo some, sem erro de chave', async () => {
    const { db, desafio } = await cenario()
    await convite(db, desafio, '3588887777', '3588887777', 'Certa')
    await convite(db, desafio, '5988887777', '35988887777', 'Quebrada')
    await db.exec(MIGRACAO_044)
    expect(await convites(db)).toEqual([{ telefone: '3588887777', nome: 'Certa' }])
  })

  it('telefone que bate com mais de uma conta fica esperando (ninguém entra no chute)', async () => {
    const { db, desafio } = await cenario()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Bia')
    // Contas antigas sem DDD casam pela linha sozinha
    await db.query(`update profiles set telefone = '988887777' where id in ($1, $2)`, [
      IDS.a,
      IDS.b,
    ])
    await convite(db, desafio, '5988887777', '35988887777')
    await db.exec(MIGRACAO_044)
    const m = await db.query(`select 1 from challenge_members where challenge_id = $1`, [desafio])
    expect(m.rows).toHaveLength(0)
    expect(await convites(db)).toEqual([{ telefone: '3588887777', nome: 'Convidada' }])
  })

  it('convite sem o valor original não é mexido', async () => {
    const { db, desafio } = await cenario()
    await convite(db, desafio, '5988887777', null)
    await db.exec(MIGRACAO_044)
    expect(await convites(db)).toEqual([{ telefone: '5988887777', nome: 'Convidada' }])
  })

  it('convite que já estava certo e conta de outro DDD não se misturam', async () => {
    const { db, desafio } = await cenario()
    await pessoa(db, IDS.a, 'Ana')
    await db.query(`update profiles set telefone = '11988887777' where id = $1`, [IDS.a])
    await convite(db, desafio, '3588887777', '35988887777')
    await db.exec(MIGRACAO_044)
    const m = await db.query(`select 1 from challenge_members where challenge_id = $1`, [desafio])
    expect(m.rows).toHaveLength(0)
    expect(await convites(db)).toEqual([{ telefone: '3588887777', nome: 'Convidada' }])
  })

  it('pode rodar mais de uma vez', async () => {
    const { db, desafio } = await cenario()
    await convite(db, desafio, '5988887777', '(35) 98888-7777')
    await db.exec(MIGRACAO_044)
    await db.exec(MIGRACAO_044)
    expect(await convites(db)).toEqual([{ telefone: '3588887777', nome: 'Convidada' }])
  })
})
