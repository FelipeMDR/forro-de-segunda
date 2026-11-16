import { describe, expect, it } from 'vitest'
import { bancoComMigracao, comoUsuario, IDS, pessoa } from './banco'

type Banco = Awaited<ReturnType<typeof bancoComMigracao>>

async function comGente() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.org, 'Org', { organizador: true })
  await pessoa(db, IDS.a, 'Ana')
  await pessoa(db, IDS.b, 'Beto')
  return db
}

/** Roda `fn` como o app roda: papel authenticated, logado como `uid`. */
async function como<T>(db: Banco, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`)
  await comoUsuario(db, uid)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role`)
  }
}

const anotar = (db: Banco, evento: string, divulgacao = 'forro-na-rep-2026-12') =>
  db.query(`insert into divulgacao_eventos (divulgacao, evento) values ($1, $2)`, [
    divulgacao,
    evento,
  ])

describe('divulgacao_eventos', () => {
  it('aluno anota em nome próprio (user_id vem da sessão)', async () => {
    const db = await comGente()
    await como(db, IDS.a, () => anotar(db, 'clique'))
    const r = await db.query<{ user_id: string; evento: string }>(
      `select user_id, evento from divulgacao_eventos`,
    )
    expect(r.rows).toEqual([{ user_id: IDS.a, evento: 'clique' }])
  })

  it('aluno não anota em nome de outra pessoa', async () => {
    const db = await comGente()
    await expect(
      como(db, IDS.a, () =>
        db.query(
          `insert into divulgacao_eventos (divulgacao, evento, user_id) values ('x', 'clique', $1)`,
          [IDS.b],
        ),
      ),
    ).rejects.toThrow()
  })

  it('recusa evento fora da lista', async () => {
    const db = await comGente()
    await expect(como(db, IDS.a, () => anotar(db, 'comprou'))).rejects.toThrow()
  })

  it('só a organização lê; aluno não vê nem os próprios eventos', async () => {
    const db = await comGente()
    await como(db, IDS.a, () => anotar(db, 'visto'))
    await como(db, IDS.b, () => anotar(db, 'fechou'))
    const doAluno = await como(db, IDS.a, () => db.query(`select * from divulgacao_eventos`))
    expect(doAluno.rows).toHaveLength(0)
    const daOrg = await como(db, IDS.org, () => db.query(`select * from divulgacao_eventos`))
    expect(daOrg.rows).toHaveLength(2)
  })

  it('aluno não apaga nem edita, mesmo com as permissões padrão do Supabase', async () => {
    const db = await comGente()
    // No Supabase, authenticated tem todas as permissões de tabela: quem
    // barra é o RLS, que só deixa a linha invisível para o comando.
    await db.exec(`grant all on divulgacao_eventos to authenticated`)
    await como(db, IDS.a, () => anotar(db, 'clique'))
    await como(db, IDS.a, () => db.query(`delete from divulgacao_eventos`))
    await como(db, IDS.a, () => db.query(`update divulgacao_eventos set evento = 'visto'`))
    const r = await db.query<{ evento: string }>(`select evento from divulgacao_eventos`)
    expect(r.rows).toEqual([{ evento: 'clique' }])
  })
})
