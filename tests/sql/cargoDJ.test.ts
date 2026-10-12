import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { bancoComMigracao, comoUsuario, IDS, pessoa, sessaoAberta } from './banco'

/** Ids de professores extras, para encher as 5 vagas. */
const prof = (n: number) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`

async function podeSerDJ(db: PGlite, uid: string) {
  return (await db.query<{ r: boolean }>(`select pode_ser_dj($1) as r`, [uid])).rows[0].r
}

async function conceder(db: PGlite, uid: string) {
  return (await db.query<{ r: boolean }>(`select conceder_cargo_dj($1) as r`, [uid])).rows[0].r
}

async function totalDJs(db: PGlite) {
  return (await db.query<{ n: number }>(`select total_djs() as n`)).rows[0].n
}

/** Banco com 5 professores que já viraram DJ e mais um professor. */
async function comCincoDJs() {
  const db = await bancoComMigracao()
  for (let i = 1; i <= 5; i++) {
    await pessoa(db, prof(i), `Prof ${i}`, { cargo: 'Professor(a)' })
    expect(await conceder(db, prof(i))).toBe(true)
  }
  await pessoa(db, IDS.prof, 'Sexto', { cargo: 'Professor(a)', conectado: false })
  return db
}

describe('cargo de DJ — concessão', () => {
  it('a migração cria o cargo DJ na lista de cargos', async () => {
    const db = await bancoComMigracao()
    const r = await db.query(`select 1 from cargos where nome = 'DJ'`)
    expect(r.rows).toHaveLength(1)
  })

  it('professor aceito pelo Spotify ganha o cargo; aluno não', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await pessoa(db, IDS.a, 'Ana')
    expect(await conceder(db, IDS.prof)).toBe(true)
    expect(await conceder(db, IDS.a)).toBe(false)
    expect(await totalDJs(db)).toBe(1)
  })

  it('conceder de novo a quem já é DJ não gasta vaga', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await conceder(db, IDS.prof)
    expect(await conceder(db, IDS.prof)).toBe(true)
    expect(await totalDJs(db)).toBe(1)
  })
})

describe('cargo de DJ — teto de 5', () => {
  it('com 5 DJs, o sexto professor não pode mais ser DJ', async () => {
    const db = await comCincoDJs()
    expect(await podeSerDJ(db, IDS.prof)).toBe(false)
    expect(await conceder(db, IDS.prof)).toBe(false)
    expect(await totalDJs(db)).toBe(5)
  })

  it('os 5 DJs continuam podendo', async () => {
    const db = await comCincoDJs()
    for (let i = 1; i <= 5; i++) expect(await podeSerDJ(db, prof(i))).toBe(true)
  })

  it('nem o organizador entra no lugar de um sexto', async () => {
    const db = await comCincoDJs()
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    expect(await podeSerDJ(db, IDS.org)).toBe(false)
  })

  it('com 5 DJs, o sexto professor não liga o Modo DJ', async () => {
    const db = await comCincoDJs()
    await db.query(
      `insert into dj_conexoes (user_id, spotify_id, access_token, refresh_token, expira_em)
       values ($1, 'sp', 'a', 'r', now() + interval '1 hour')`,
      [IDS.prof],
    )
    await comoUsuario(db, IDS.prof)
    await expect(db.query(`select ligar_modo_dj(false)`)).rejects.toThrow(
      'Só professores podem ligar o Modo DJ',
    )
  })

  it('o painel também não consegue dar o cargo a uma 6ª pessoa', async () => {
    const db = await comCincoDJs()
    await expect(
      db.query(`insert into profile_cargos values ($1, 'DJ')`, [IDS.prof]),
    ).rejects.toThrow('Já há 5 DJs')
  })

  it('upsert do cargo de quem já é DJ não conta como 6º', async () => {
    const db = await comCincoDJs()
    await db.query(
      `insert into profile_cargos values ($1, 'DJ') on conflict (user_id, cargo) do nothing`,
      [prof(1)],
    )
    expect(await totalDJs(db)).toBe(5)
  })

  it('tirar o cargo de alguém abre a vaga', async () => {
    const db = await comCincoDJs()
    await db.query(`delete from profile_cargos where user_id = $1 and cargo = 'DJ'`, [prof(1)])
    expect(await podeSerDJ(db, IDS.prof)).toBe(true)
    expect(await conceder(db, IDS.prof)).toBe(true)
  })
})

describe('cargo de DJ — remoção', () => {
  it('tirar o cargo desconecta o Spotify e fecha a sessão aberta da pessoa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await conceder(db, IDS.prof)
    await sessaoAberta(db, IDS.prof, '2026-10-12')

    await db.query(`delete from profile_cargos where user_id = $1 and cargo = 'DJ'`, [IDS.prof])

    const conexoes = await db.query(`select 1 from dj_conexoes where user_id = $1`, [IDS.prof])
    expect(conexoes.rows).toHaveLength(0)
    const s = await db.query<{ motivo_fechamento: string | null }>(
      `select motivo_fechamento from dj_sessoes where dj_user_id = $1`,
      [IDS.prof],
    )
    expect(s.rows[0].motivo_fechamento).toBe('desligou')
  })

  it('tirar outro cargo não mexe na conexão', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await conceder(db, IDS.prof)
    await db.query(
      `delete from profile_cargos where user_id = $1 and cargo = 'Professor(a)'`,
      [IDS.prof],
    )
    const conexoes = await db.query(`select 1 from dj_conexoes where user_id = $1`, [IDS.prof])
    expect(conexoes.rows).toHaveLength(1)
    // Continua DJ: o cargo vale mesmo sem ser mais professor
    expect(await podeSerDJ(db, IDS.prof)).toBe(true)
  })
})
