import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bancoComMigracao, comoUsuario, IDS, pessoa } from './banco'

const PAYLOAD = {
  inicio: '2026-08-03T03:00:00+00:00',
  equipe: [
    { user_id: IDS.prof, papel: 'Condutor(a)' },
    { user_id: IDS.prof2, papel: 'Conduzido(a)' },
  ],
  resultados: [{ user_id: IDS.a, nivel: 2, pegos: 1, meta: 2, total_equipe: 2 }],
}

async function guardar(db: Awaited<ReturnType<typeof bancoComMigracao>>, p: unknown) {
  return db.query<{ id: string }>(`select guardar_caca_do_semestre($1::jsonb) as id`, [
    JSON.stringify(p),
  ])
}

async function comTime() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.org, 'Org', { organizador: true })
  await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
  await pessoa(db, IDS.prof2, 'Prof2', { cargo: 'Professor(a)' })
  await pessoa(db, IDS.a, 'Ana')
  return db
}

describe('caça aos professores — congelamento do semestre', () => {
  it('organizador grava semestre, equipe e resultados', async () => {
    const db = await comTime()
    await comoUsuario(db, IDS.org)
    const { rows } = await guardar(db, PAYLOAD)
    const id = rows[0].id
    const s = await db.query<{ inicio: string | null }>(
      `select inicio::text as inicio from caca_semestres where id = $1`,
      [id],
    )
    expect(new Date(s.rows[0].inicio as string).toISOString()).toBe('2026-08-03T03:00:00.000Z')
    const r = await db.query(`select user_id, nivel, pegos, meta, total_equipe from caca_resultados where semestre_id = $1`, [id])
    expect(r.rows).toEqual([{ user_id: IDS.a, nivel: 2, pegos: 1, meta: 2, total_equipe: 2 }])
    const e = await db.query(`select 1 from caca_equipe where semestre_id = $1`, [id])
    expect(e.rows).toHaveLength(2)
  })

  it('aceita início nulo', async () => {
    const db = await comTime()
    await comoUsuario(db, IDS.org)
    const { rows } = await guardar(db, { ...PAYLOAD, inicio: null })
    const s = await db.query(`select inicio from caca_semestres where id = $1`, [rows[0].id])
    expect(s.rows[0]).toEqual({ inicio: null })
  })

  it('aluno não grava', async () => {
    const db = await comTime()
    await comoUsuario(db, IDS.a)
    await expect(guardar(db, PAYLOAD)).rejects.toThrow('Só a organização encerra o semestre')
  })

  it('nível 0 é recusado e nada fica gravado', async () => {
    const db = await comTime()
    await comoUsuario(db, IDS.org)
    const ruim = { ...PAYLOAD, resultados: [{ ...PAYLOAD.resultados[0], nivel: 0 }] }
    await expect(guardar(db, ruim)).rejects.toThrow()
    const s = await db.query(`select 1 from caca_semestres`)
    expect(s.rows).toHaveLength(0)
  })

  it('só o app (função) escreve: aluno não insere direto', async () => {
    const db = await comTime()
    await db.exec(`grant all on all tables in schema public to authenticated`)
    await db.exec(`set role authenticated`)
    await comoUsuario(db, IDS.org)
    await expect(db.query(`insert into caca_semestres default values`)).rejects.toThrow()
    await db.exec(`reset role`)
  })
})

describe('profiles.papel_principal', () => {
  it('recusa valor fora da lista e aceita nulo', async () => {
    const db = await comTime()
    await expect(
      db.query(`update profiles set papel_principal = 'Outro' where id = $1`, [IDS.a]),
    ).rejects.toThrow()
    await db.query(`update profiles set papel_principal = 'Condutor(a)' where id = $1`, [IDS.a])
    await db.query(`update profiles set papel_principal = null where id = $1`, [IDS.a])
  })
})

describe('migração 041', () => {
  it('pode rodar mais de uma vez', async () => {
    const db = await bancoComMigracao()
    const sql = readFileSync(
      new URL('../../supabase/migracoes/041-caca-aos-professores.sql', import.meta.url),
      'utf8',
    )
    await db.exec(sql)
  })
})
