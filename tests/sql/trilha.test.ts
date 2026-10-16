import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { bancoComMigracao, comoUsuario, IDS, pessoa } from './banco'

const VIDEO = 'dQw4w9WgXcQ'

async function passo(
  db: PGlite,
  opcoes: { ordem?: number; podeChave?: boolean; video?: string | null } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into trilha_passos (nivel, ordem, nome, video_frente, pode_chave)
     values ('iniciante', $1::int, 'Passo ' || $1::int, $2, $3) returning id`,
    [opcoes.ordem ?? 1, opcoes.video === undefined ? VIDEO : opcoes.video, opcoes.podeChave ?? true],
  )
  return r.rows[0].id
}

/** Check-ins em noites diferentes (20h de São Paulo). */
async function noites(db: PGlite, uid: string, datas: string[], anulada = false) {
  for (const d of datas) {
    await db.query(
      `insert into checkins (user_id, criado_em, presenca_anulada) values ($1, $2, $3)`,
      [uid, `${d}T20:00:00-03:00`, anulada],
    )
  }
}

async function dupla(db: PGlite, a: string, b: string, data: string) {
  await db.query(
    `insert into duplas (data, de_user, para_user, confirmada) values ($1, $2, $3, true), ($1, $3, $2, true)`,
    [data, a, b],
  )
}

async function liberar(db: PGlite, uid: string, passoId: string, custo = 1) {
  await comoUsuario(db, uid)
  await db.query(`select liberar_passo_com_chave($1, $2)`, [passoId, custo])
}

async function liberacoes(db: PGlite, uid: string) {
  return (await db.query(`select 1 from trilha_liberacoes where user_id = $1`, [uid])).rows.length
}

describe('trilha — gastar chave', () => {
  it('sem pontos, recusa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p)).rejects.toThrow('Você ainda não tem chaves suficientes')
  })

  it('3 noites de check-in valem 1 chave, e só 1', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p1 = await passo(db, { ordem: 1 })
    const p2 = await passo(db, { ordem: 2 })
    await liberar(db, IDS.a, p1)
    await expect(liberar(db, IDS.a, p2)).rejects.toThrow('Você ainda não tem chaves suficientes')
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('duas fotos na mesma noite contam uma vez; foto anulada não conta', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-05', '2026-10-12'])
    await noites(db, IDS.a, ['2026-10-19'], true)
    await expect(liberar(db, IDS.a, await passo(db))).rejects.toThrow('Você ainda não tem chaves suficientes')
  })

  it('noite com dupla e parceria nova somam pontos', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Bia')
    await noites(db, IDS.a, ['2026-10-05'])
    await dupla(db, IDS.a, IDS.b, '2026-10-05') // +1 noite com dupla, +1 parceria nova
    await liberar(db, IDS.a, await passo(db))
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('pontos de antes do último encerramento não contam', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-03-02', '2026-03-09', '2026-03-16'])
    await db.query(`insert into semestres (encerrado_em) values ('2026-07-01T12:00:00Z')`)
    await expect(liberar(db, IDS.a, await passo(db))).rejects.toThrow('Você ainda não tem chaves suficientes')
  })

  it('liberar o mesmo passo de novo não gasta outra chave', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p = await passo(db)
    await liberar(db, IDS.a, p)
    await liberar(db, IDS.a, p)
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('passo que só abre depois da aula, ou sem vídeo, recusa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    await expect(liberar(db, IDS.a, await passo(db, { podeChave: false }))).rejects.toThrow(
      'Esse passo só abre depois da aula',
    )
    await expect(liberar(db, IDS.a, await passo(db, { ordem: 2, video: null }))).rejects.toThrow(
      'Esse passo ainda não tem vídeo',
    )
  })

  it('professor apaga o passo: a chave volta', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p1 = await passo(db, { ordem: 1 })
    const p2 = await passo(db, { ordem: 2 })
    await liberar(db, IDS.a, p1)
    await db.query(`delete from trilha_passos where id = $1`, [p1])
    await liberar(db, IDS.a, p2)
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('encerrar o semestre no meio da noite: a presença daquela noite vale nos dois lados', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    // Check-in às 19:30, semestre encerrado às 20:00 da mesma segunda (SP).
    // O app conta a noite (corte pela data), então o banco também precisa.
    await db.query(
      `insert into checkins (user_id, criado_em) values ($1, '2026-10-05T19:30:00-03:00')`,
      [IDS.a],
    )
    await db.query(`insert into semestres (encerrado_em) values ('2026-10-05T20:00:00-03:00')`)
    await noites(db, IDS.a, ['2026-10-12', '2026-10-19'])
    await liberar(db, IDS.a, await passo(db))
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('passo mais à frente custa o dobro: 2 chaves pedem o dobro de pontos', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p1 = await passo(db, { ordem: 1 })
    const p2 = await passo(db, { ordem: 2 })
    await expect(liberar(db, IDS.a, p2, 2)).rejects.toThrow('Você ainda não tem chaves suficientes')
    await noites(db, IDS.a, ['2026-10-26', '2026-11-02', '2026-11-09'])
    await liberar(db, IDS.a, p2, 2)
    // As 2 chaves (6 pontos) foram gastas: não sobra para mais nada
    await expect(liberar(db, IDS.a, p1, 1)).rejects.toThrow('Você ainda não tem chaves suficientes')
    const r = await db.query<{ custo: number }>(`select custo from trilha_liberacoes where user_id = $1`, [IDS.a])
    expect(r.rows).toEqual([{ custo: 2 }])
  })

  it('preço de chave fora da sequência 1, 2, 4, 8… é recusado', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p, 3)).rejects.toThrow('Preço de chave inválido')
    await expect(liberar(db, IDS.a, p, 0)).rejects.toThrow('Preço de chave inválido')
  })

  it('passo guarda os perfis de quem ensinou (vazio por padrão)', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    const id = await passo(db)
    const antes = await db.query<{ ids: string[] }>(`select professores_ids as ids from trilha_passos where id = $1`, [id])
    expect(antes.rows[0].ids).toEqual([])
    await db.query(`update trilha_passos set professores_ids = array[$2::uuid] where id = $1`, [id, IDS.prof])
    const depois = await db.query<{ ids: string[] }>(`select professores_ids as ids from trilha_passos where id = $1`, [id])
    expect(depois.rows[0].ids).toEqual([IDS.prof])
  })

  it('ID de vídeo inválido é recusado pela tabela', async () => {
    const db = await bancoComMigracao()
    await expect(passo(db, { video: 'https://youtu.be/x' })).rejects.toThrow()
  })
})

describe('trilha — quem edita', () => {
  async function pode(db: PGlite, uid: string) {
    await comoUsuario(db, uid)
    return (await db.query<{ r: boolean }>(`select pode_editar_trilha() as r`)).rows[0].r
  }

  it('professor, diretor de ensino, organizador e quem dá aula podem; aluno não', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await pessoa(db, IDS.prof2, 'Dir', { cargo: 'Diretor(a) de Ensino' })
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await pessoa(db, IDS.b, 'Monitor')
    await db.query(`insert into turma_professores values ($1, 'Iniciante 01')`, [IDS.b])
    await pessoa(db, IDS.a, 'Ana')
    expect(await pode(db, IDS.prof)).toBe(true)
    expect(await pode(db, IDS.prof2)).toBe(true)
    expect(await pode(db, IDS.org)).toBe(true)
    expect(await pode(db, IDS.b)).toBe(true)
    expect(await pode(db, IDS.a)).toBe(false)
  })

  it('definir_trilha_da_turma: professor grava, aluno é recusado', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await pessoa(db, IDS.a, 'Ana')
    await db.query(`insert into turmas (nome) values ('Iniciante 01')`)
    await comoUsuario(db, IDS.a)
    await expect(
      db.query(`select definir_trilha_da_turma('Iniciante 01', 'iniciante', '2026-10-05')`),
    ).rejects.toThrow('Só professores e a organização editam a trilha')
    await comoUsuario(db, IDS.prof)
    await db.query(`select definir_trilha_da_turma('Iniciante 01', 'iniciante', '2026-10-05')`)
    const t = await db.query<{ nivel: string; trilha_inicio: string }>(
      `select nivel, trilha_inicio::text from turmas where nome = 'Iniciante 01'`,
    )
    expect(t.rows[0]).toEqual({ nivel: 'iniciante', trilha_inicio: '2026-10-05' })
  })
})

describe('trilha — regras das chaves', () => {
  async function regras(db: PGlite, uid: string, pontos: number) {
    await comoUsuario(db, uid)
    await db.query(`select salvar_regras_trilha($1)`, [pontos])
  }

  it('começa com 3 pontos por chave', async () => {
    const db = await bancoComMigracao()
    const r = await db.query(`select pontos_por_chave from trilha_regras`)
    expect(r.rows).toEqual([{ pontos_por_chave: 3 }])
  })

  it('organização muda os pontos por chave, e o gasto passa a seguir a regra nova', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12'])
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p)).rejects.toThrow('Você ainda não tem chaves suficientes')
    await regras(db, IDS.org, 2)
    await liberar(db, IDS.a, p)
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('aluno e professor não mudam as regras', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await expect(regras(db, IDS.a, 1)).rejects.toThrow('Só a organização muda as regras das chaves')
    await expect(regras(db, IDS.prof, 1)).rejects.toThrow('Só a organização muda as regras das chaves')
  })

  it('recusa valores fora da faixa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await expect(regras(db, IDS.org, 0)).rejects.toThrow()
    await expect(regras(db, IDS.org, 21)).rejects.toThrow()
  })
})

describe('trilha — privilégios', () => {
  it('ninguém logado chama teto_pontos_trilha direto (vazaria a presença dos outros)', async () => {
    const db = await bancoComMigracao()
    for (const papel of ['anon', 'authenticated']) {
      const r = await db.query<{ pode: boolean }>(
        `select has_function_privilege($1, 'public.teto_pontos_trilha(uuid)', 'execute') as pode`,
        [papel],
      )
      expect(r.rows[0].pode).toBe(false)
    }
  })
})
