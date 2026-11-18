import { describe, expect, it } from 'vitest'
import {
  bancoComMigracao,
  checkinNaNoite,
  comoUsuario,
  desafioIngresso,
  IDS,
  pessoa,
} from './banco'

/**
 * Migração 047: desafio de ingresso cujo distintivo NÃO evolui (o
 * workshop). Não dá para garantir o check-in de quem vai ao workshop,
 * então o distintivo fica em "Ingresso garantido" — nem check-in no
 * horário nem correção da organização o fazem virar "Marquei presença".
 */

async function comWorkshop() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.org, 'Org', { organizador: true })
  await pessoa(db, IDS.a, 'Ana')
  const desafio = await desafioIngresso(db, { titulo: 'Workshop de Forró', data: '2026-12-06' })
  await db.query(`update challenges set ingresso_evolui = false where id = $1`, [desafio])
  await db.query(`insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [
    desafio,
    IDS.a,
  ])
  return { db, desafio }
}

describe('migração 047 — desafio de ingresso sem evolução', () => {
  it('desafio novo evolui por padrão (o Forró na Rep continua igual)', async () => {
    const db = await bancoComMigracao()
    const desafio = await desafioIngresso(db)
    const r = await db.query<{ ingresso_evolui: boolean }>(
      `select ingresso_evolui from challenges where id = $1`,
      [desafio],
    )
    expect(r.rows[0].ingresso_evolui).toBe(true)
  })

  it('check-in no horário não evolui o distintivo', async () => {
    const { db } = await comWorkshop()
    await checkinNaNoite(db, IDS.a, '2026-12-06T19:00:00-03:00')
    const r = await db.query<{ estado: string }>(`select estado from ingressos_do_perfil($1)`, [
      IDS.a,
    ])
    expect(r.rows).toEqual([{ estado: 'garantido' }])
  })

  it('nem a correção "esteve lá" evolui', async () => {
    const { db, desafio } = await comWorkshop()
    await comoUsuario(db, IDS.org)
    await db.query(`select marcar_presenca_ingresso($1, $2, true)`, [desafio, IDS.a])
    const r = await db.query<{ estado: string }>(`select estado from ingressos_do_perfil($1)`, [
      IDS.a,
    ])
    expect(r.rows).toEqual([{ estado: 'garantido' }])
  })

  it('a lista do desafio não marca ninguém como presente', async () => {
    const { db, desafio } = await comWorkshop()
    await checkinNaNoite(db, IDS.a, '2026-12-06T19:00:00-03:00')
    const r = await db.query(`select * from presencas_do_clube($1)`, [desafio])
    expect(r.rows).toEqual([{ user_id: IDS.a, presente: false }])
  })
})
