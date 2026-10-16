import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { bancoComMigracao as bancoVazio, comoUsuario, IDS, pessoa } from './banco'

const VIDEO = 'dQw4w9WgXcQ'

/**
 * Banco com o desafio principal (o da Forródex) cobrindo o ano: é dele
 * que saem os pontos das chaves. `periodo` estreita o desafio.
 */
async function bancoComMigracao(periodo: { inicio: string; fim: string } = { inicio: '2026-01-01', fim: '2026-12-31' }) {
  const db = await bancoVazio()
  await db.query(
    `insert into challenges (titulo, data_inicio, data_fim, forrodex) values ('Espaço Livre', $1, $2, true)`,
    [periodo.inicio, periodo.fim],
  )
  // Conta simples para os testes de gasto: 1 ponto por presença ou
  // parceria, 3 pontos = 1 chave. O padrão real tem teste próprio.
  await db.query(`update trilha_regras set pontos_por_chave = 3, peso_presenca = 1, peso_parceria = 1`)
  return db
}

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

  it('parcerias do desafio somam com a presença (no teto, uma por dupla confirmada)', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Bia')
    await pessoa(db, IDS.c, 'Caio')
    await noites(db, IDS.a, ['2026-10-05'])
    // 1 presença + 2 cartas de Primeira dança = 3 pontos
    await dupla(db, IDS.a, IDS.b, '2026-10-05')
    await dupla(db, IDS.a, IDS.c, '2026-10-05')
    await liberar(db, IDS.a, await passo(db))
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('sem desafio principal (Forródex), ninguém tem chave', async () => {
    const db = await bancoVazio()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    await expect(liberar(db, IDS.a, await passo(db))).rejects.toThrow('Você ainda não tem chaves suficientes')
  })

  it('noites e duplas fora do período do desafio principal não contam', async () => {
    const db = await bancoComMigracao({ inicio: '2026-08-01', fim: '2026-12-15' })
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Bia')
    await noites(db, IDS.a, ['2026-03-02', '2026-03-09', '2026-03-16'])
    await dupla(db, IDS.a, IDS.b, '2026-03-02')
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

  it('chaves gastas antes do desafio principal não descontam', async () => {
    const db = await bancoComMigracao({ inicio: '2026-08-01', fim: '2026-12-15' })
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const antigo = await passo(db, { ordem: 1 })
    await db.query(
      `insert into trilha_liberacoes (user_id, passo_id, custo, criado_em) values ($1, $2, 4, '2026-05-01T12:00:00Z')`,
      [IDS.a, antigo],
    )
    await liberar(db, IDS.a, await passo(db, { ordem: 2 }))
    expect(await liberacoes(db, IDS.a)).toBe(2)
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

  it('preço de chave tem que ser de 1 a 100', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p, 0)).rejects.toThrow('Preço de chave inválido')
    await expect(liberar(db, IDS.a, p, 101)).rejects.toThrow('Preço de chave inválido')
    // 3 chaves não é potência de 2, e agora vale (tabela de preços editável)
    await noites(db, IDS.a, ['2026-11-16', '2026-11-23', '2026-11-30'])
    await liberar(db, IDS.a, p, 3)
    expect(await liberacoes(db, IDS.a)).toBe(1)
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
  const PADRAO = { pontos: 10, presenca: 3, parceria: 1, porPasso: 1 }
  async function regras(db: PGlite, uid: string, r: Partial<typeof PADRAO> = {}) {
    const x = { ...PADRAO, ...r }
    await comoUsuario(db, uid)
    await db.query(`select salvar_regras_trilha($1, $2, $3, $4)`, [x.pontos, x.presenca, x.parceria, x.porPasso])
  }

  it('padrão: 3 por presença, 1 por parceria, 10 pontos por chave, 1 chave por passo de distância', async () => {
    const db = await bancoVazio()
    const r = await db.query(
      `select pontos_por_chave, peso_presenca, peso_parceria, preco_por_passo from trilha_regras`,
    )
    expect(r.rows).toEqual([{ pontos_por_chave: 10, peso_presenca: 3, peso_parceria: 1, preco_por_passo: 1 }])
  })

  it('no padrão, presença pesa 3: 4 noites (12 pontos) já dão 1 chave', async () => {
    const db = await bancoVazio()
    await db.query(`insert into challenges (data_inicio, data_fim, forrodex) values ('2026-01-01', '2026-12-31', true)`)
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p)).rejects.toThrow('Você ainda não tem chaves suficientes') // 9 pontos
    await noites(db, IDS.a, ['2026-10-26'])
    await liberar(db, IDS.a, p) // 12 pontos
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('organização muda os pesos e os pontos por chave, e o gasto segue a regra nova', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12'])
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p)).rejects.toThrow('Você ainda não tem chaves suficientes')
    await regras(db, IDS.org, { pontos: 4, presenca: 2 })
    await liberar(db, IDS.a, p)
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('aluno e professor não mudam as regras', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await expect(regras(db, IDS.a)).rejects.toThrow('Só a organização muda as regras das chaves')
    await expect(regras(db, IDS.prof)).rejects.toThrow('Só a organização muda as regras das chaves')
  })

  it('recusa valores fora da faixa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await expect(regras(db, IDS.org, { pontos: 0 })).rejects.toThrow()
    await expect(regras(db, IDS.org, { pontos: 51 })).rejects.toThrow()
    await expect(regras(db, IDS.org, { presenca: 11 })).rejects.toThrow()
    await expect(regras(db, IDS.org, { porPasso: 0 })).rejects.toThrow()
    await expect(regras(db, IDS.org, { porPasso: 11 })).rejects.toThrow()
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
