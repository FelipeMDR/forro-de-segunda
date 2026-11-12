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

// ---------- Sincronização da planilha ----------
// Nomes e telefones de teste: todos fictícios.

type Linha = { indice: number; situacao: string }
type Resposta = {
  status: string
  coluna_marcar: number | null
  linhas: Linha[]
  removidos: number
  remocoes_travadas: number
}

/** A aba como ela é (Review Focus 2): título, faixa, linhas vazias, cabeçalho na linha 6. */
function grade(pessoas: [string, string][]): string[][] {
  return [
    ['LISTA DESAFIO FORRÓ NA REP', '', '', ''],
    ['APP FORRÓ DE SEGUNDA', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['QT.', 'NOME', 'CELULAR', 'ADICIONADO NO DESAFIO'],
    ...pessoas.map(([nome, cel], i) => [String(i + 1), nome, cel, 'FALSE']),
    ['9', '', '', 'FALSE'],
    ['9', '', '', 'FALSE'],
  ]
}

/** Dez pessoas fictícias, sem conta: 35 99000-0001 … 35 99000-0010. */
const DEZ: [string, string][] = Array.from({ length: 10 }, (_, i) => [
  `Pessoa Teste ${i + 1}`,
  `35 99000-${String(i + 1).padStart(4, '0')}`,
])

/** Substitui o "agora" da sincronização (ISO com fuso). */
async function agora(db: Banco, quando: string) {
  await db.exec(`create or replace function public.ingresso_agora() returns timestamptz
    language sql stable as $$ select '${quando}'::timestamptz $$;`)
}

async function comPlanilha() {
  const { db, desafio } = await comFesta()
  // Antes da festa, para o teste não vencer quando o calendário passar de 05/12
  await agora(db, '2026-11-20T12:00:00-03:00')
  await comoUsuario(db, IDS.org)
  const segredo = (
    await db.query<{ s: string }>(`select gerar_segredo_ingresso($1) as s`, [desafio])
  ).rows[0].s
  // O Apps Script chama com a chave anon: ninguém logado
  await comoUsuario(db, null)
  return { db, desafio, segredo }
}

async function sincronizar(db: Banco, segredo: string, g: string[][]): Promise<Resposta> {
  const r = await db.query<{ r: Resposta }>(
    `select sincronizar_planilha_ingresso($1, $2::jsonb) as r`,
    [segredo, JSON.stringify(g)],
  )
  return r.rows[0].r
}

async function telefone(db: Banco, uid: string, tel: string) {
  await db.query(`update profiles set telefone = $2 where id = $1`, [uid, tel])
}

async function membros(db: Banco, desafio: string) {
  const r = await db.query<{ user_id: string; origem: string }>(
    `select user_id, origem from challenge_members where challenge_id = $1 order by user_id`,
    [desafio],
  )
  return r.rows
}

async function convidados(db: Banco, desafio: string) {
  const r = await db.query<{
    telefone: string
    telefone_exibicao: string
    nome: string
    origem: string
  }>(
    `select telefone, telefone_exibicao, nome, origem from challenge_convidados
     where challenge_id = $1 order by telefone`,
    [desafio],
  )
  return r.rows
}

async function resumo(db: Banco, desafio: string) {
  const r = await db.query<{ resumo: Record<string, unknown> }>(
    `select resumo from ingresso_sincronizacoes where challenge_id = $1`,
    [desafio],
  )
  return r.rows[0]?.resumo
}

/** `esperado`: as travadas que o painel mostrou para a organização. */
async function confirmar(db: Banco, desafio: string, esperado: number) {
  const r = await db.query<{ n: number }>(`select confirmar_remocoes_ingresso($1, $2) as n`, [
    desafio,
    esperado,
  ])
  return r.rows[0].n
}

function situacao(r: Resposta, indice: number) {
  return r.linhas.find((l) => l.indice === indice)?.situacao
}

describe('desafio de ingresso — telefone da planilha', () => {
  it('tira o 55 só de quem copiou com +55 (12 ou 13 dígitos)', async () => {
    const db = await bancoComMigracao()
    const r = await db.query<{ a: string; b: string; c: string; d: string }>(
      `select telefone_da_planilha('+55 35 98888-7777') as a,
              telefone_da_planilha('55 35 8888-7777') as b,
              telefone_da_planilha('(35) 99999-8888') as c,
              telefone_da_planilha('55999998888') as d`,
    )
    expect(r.rows[0]).toEqual({
      a: '35988887777',
      b: '3588887777',
      c: '35999998888',
      d: '55999998888',
    })
  })
})

describe('desafio de ingresso — sincronização da planilha', () => {
  it('acha o cabeçalho na linha 6, marca a coluna 3 e ignora as linhas vazias do fim', async () => {
    const { db, segredo } = await comPlanilha()
    const r = await sincronizar(db, segredo, grade([['Cida Teste', '35 98888-7777']]))
    expect(r.status).toBe('ok')
    expect(r.coluna_marcar).toBe(3)
    expect(r.linhas).toEqual([{ indice: 7, situacao: 'aguardando_conta' }])
  })

  it('cabeçalho em minúsculas, com TELEFONE e sem a coluna de marcar', async () => {
    const { db, segredo } = await comPlanilha()
    const r = await sincronizar(db, segredo, [
      ['Lista'],
      [' nome ', 'Telefone'],
      ['Cida Teste', '35 98888-7777'],
    ])
    expect(r.status).toBe('ok')
    expect(r.coluna_marcar).toBeNull()
    expect(r.linhas).toEqual([{ indice: 2, situacao: 'aguardando_conta' }])
  })

  it('quem tem conta entra como membro da planilha', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await telefone(db, IDS.b, '35999998888')
    const r = await sincronizar(db, segredo, grade([['Beto Teste', '35 99999-8888']]))
    expect(situacao(r, 7)).toBe('dentro')
    expect(await membros(db, desafio)).toContainEqual({ user_id: IDS.b, origem: 'planilha' })
  })

  it('+55 sem conta vira convidado, com o telefone como estava na célula', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    const r = await sincronizar(db, segredo, grade([['Cida Teste', '+55 35 98888-7777']]))
    expect(situacao(r, 7)).toBe('aguardando_conta')
    expect(await convidados(db, desafio)).toEqual([
      {
        telefone: '3588887777',
        telefone_exibicao: '+55 35 98888-7777',
        nome: 'Cida Teste',
        origem: 'planilha',
      },
    ])
  })

  it('o convidado da planilha vira membro da planilha quando cria a conta', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade([['Cida Teste', '+55 35 98888-7777']]))
    await db.query(`select membro_por_convite($1, '35988887777')`, [IDS.b])
    expect(await membros(db, desafio)).toContainEqual({ user_id: IDS.b, origem: 'planilha' })
    expect(await convidados(db, desafio)).toEqual([])
  })

  it('telefone sem DDD ou vazio é inválido e vai para o resumo com a linha e o nome', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    const r = await sincronizar(
      db,
      segredo,
      grade([
        ['Cida Teste', '35 98888-7777'],
        ['Davi Teste', '99999-8888'],
        ['Edu Teste', ''],
      ]),
    )
    expect(situacao(r, 8)).toBe('telefone_invalido')
    expect(situacao(r, 9)).toBe('telefone_invalido')
    expect(await convidados(db, desafio)).toHaveLength(1)
    expect(await resumo(db, desafio)).toEqual({
      status: 'ok',
      dentro: 0,
      aguardando: 1,
      invalidos: [
        { linha: 9, nome: 'Davi Teste' },
        { linha: 10, nome: 'Edu Teste' },
      ],
      ambiguos: [],
      removidos: 0,
      remocoes_travadas: 0,
      chaves: ['3588887777'],
    })
  })

  it('o mesmo telefone em duas grafias: a segunda linha é repetida', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    const r = await sincronizar(
      db,
      segredo,
      grade([
        ['Cida Teste', '35 98888-7777'],
        ['Cida de Novo', '+55 (35) 98888-7777'],
      ]),
    )
    expect(situacao(r, 7)).toBe('aguardando_conta')
    expect(situacao(r, 8)).toBe('repetido')
    expect(await convidados(db, desafio)).toHaveLength(1)
  })

  it('telefone que bate com duas contas antigas sem DDD é ambíguo e ninguém entra', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await telefone(db, IDS.a, '9999-6666')
    await telefone(db, IDS.b, '99999-6666')
    const r = await sincronizar(db, segredo, grade([['Fábio Teste', '35 99999-6666']]))
    expect(situacao(r, 7)).toBe('ambiguo')
    // Ana já era membro manual (comFesta) e continua manual; Beto não entra
    expect(await membros(db, desafio)).toEqual([{ user_id: IDS.a, origem: 'manual' }])
    expect(await convidados(db, desafio)).toEqual([])
    expect((await resumo(db, desafio))?.ambiguos).toEqual([{ linha: 8, nome: 'Fábio Teste' }])
  })

  it('membro manual na planilha passa a ser da planilha; fora dela, nunca sai', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    // Ana (comFesta) é manual e não está na planilha; Beto é manual e está
    await telefone(db, IDS.a, '35977776666')
    await telefone(db, IDS.b, '35999998888')
    await db.query(`insert into challenge_members (challenge_id, user_id) values ($1, $2)`, [
      desafio,
      IDS.b,
    ])
    await sincronizar(db, segredo, grade([['Beto Teste', '35 99999-8888']]))
    expect(await membros(db, desafio)).toEqual([
      { user_id: IDS.a, origem: 'manual' },
      { user_id: IDS.b, origem: 'planilha' },
    ])
    // Nem a planilha esvaziada, nem a confirmação de remoção tiram o manual
    expect((await sincronizar(db, segredo, grade([]))).remocoes_travadas).toBe(1)
    await comoUsuario(db, IDS.org)
    expect(await confirmar(db, desafio, 1)).toBe(1)
    expect(await membros(db, desafio)).toEqual([{ user_id: IDS.a, origem: 'manual' }])
  })

  it('convite manual único na planilha passa a ser da planilha, sem duplicar', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await db.query(
      `insert into challenge_convidados (challenge_id, telefone, nome) values ($1, '3599996666', 'Fábio')`,
      [desafio],
    )
    const r = await sincronizar(db, segredo, grade([['Fábio Teste', '35 99999-6666']]))
    expect(situacao(r, 7)).toBe('aguardando_conta')
    expect(await convidados(db, desafio)).toEqual([
      {
        telefone: '3599996666',
        telefone_exibicao: '35 99999-6666',
        nome: 'Fábio Teste',
        origem: 'planilha',
      },
    ])
  })

  it('dois convites manuais que batem com a linha ficam manuais e nunca saem', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    // Um antigo sem DDD casa só pela linha; os dois casam com 35 99999-6666
    await db.query(
      `insert into challenge_convidados (challenge_id, telefone, nome) values
         ($1, '99996666', 'Fábio antigo'), ($1, '3599996666', 'Fábio')`,
      [desafio],
    )
    const r = await sincronizar(db, segredo, grade([['Fábio Teste', '35 99999-6666']]))
    expect(situacao(r, 7)).toBe('aguardando_conta')
    const manuais = [
      { telefone: '3599996666', telefone_exibicao: null, nome: 'Fábio', origem: 'manual' },
      { telefone: '99996666', telefone_exibicao: null, nome: 'Fábio antigo', origem: 'manual' },
    ]
    expect(await convidados(db, desafio)).toEqual(manuais)

    // Sai da planilha: os convites manuais continuam
    const r2 = await sincronizar(db, segredo, grade([['Cida Teste', '35 98888-7777']]))
    expect(r2).toMatchObject({ removidos: 0, remocoes_travadas: 0 })
    expect((await convidados(db, desafio)).filter((c) => c.origem === 'manual')).toEqual(manuais)
  })

  it('quem sai da planilha sai do desafio, e a correção de presença fica', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    // A primeira das dez tem conta
    await pessoa(db, IDS.c, 'Pessoa Teste 1')
    await telefone(db, IDS.c, DEZ[0][1])
    await sincronizar(db, segredo, grade(DEZ))
    expect(await membros(db, desafio)).toContainEqual({ user_id: IDS.c, origem: 'planilha' })
    expect(await convidados(db, desafio)).toHaveLength(9)
    await db.query(
      `insert into ingresso_presencas (challenge_id, user_id, esteve) values ($1, $2, true)`,
      [desafio, IDS.c],
    )

    const r = await sincronizar(db, segredo, grade(DEZ.slice(1)))
    expect(r.removidos).toBe(1)
    expect(r.remocoes_travadas).toBe(0)
    expect((await membros(db, desafio)).map((m) => m.user_id)).not.toContain(IDS.c)
    const p = await db.query(`select 1 from ingresso_presencas where user_id = $1`, [IDS.c])
    expect(p.rows).toHaveLength(1)

    // E um convidado (sem conta) também sai
    const r2 = await sincronizar(db, segredo, grade(DEZ.slice(2)))
    expect(r2.removidos).toBe(1)
    expect(await convidados(db, desafio)).toHaveLength(8)
  })

  it('trava: planilha sem nenhuma linha válida não tira ninguém', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade(DEZ))
    const r = await sincronizar(db, segredo, grade([['Davi Teste', '99999-8888']]))
    expect(r.removidos).toBe(0)
    expect(r.remocoes_travadas).toBe(10)
    expect(await convidados(db, desafio)).toHaveLength(10)
    expect(await resumo(db, desafio)).toMatchObject({ removidos: 0, remocoes_travadas: 10 })
  })

  it('trava: tirar 4 de 10 espera a confirmação da organização', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade(DEZ))
    // Quem é novo entra mesmo assim; só a remoção espera
    const r = await sincronizar(
      db,
      segredo,
      grade([...DEZ.slice(4), ['Cida Teste', '35 98888-7777']]),
    )
    expect(r.removidos).toBe(0)
    expect(r.remocoes_travadas).toBe(4)
    expect(await convidados(db, desafio)).toHaveLength(11)

    await comoUsuario(db, IDS.a)
    await expect(confirmar(db, desafio, 4)).rejects.toThrow(
      'Só a organização confirma a remoção',
    )

    await comoUsuario(db, IDS.org)
    expect(await confirmar(db, desafio, 4)).toBe(4)
    expect(await convidados(db, desafio)).toHaveLength(7)
    expect(await resumo(db, desafio)).toMatchObject({ remocoes_travadas: 0, removidos: 4 })
  })

  it('trava: se a lista mudou depois que a organização conferiu, ninguém sai', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade(DEZ))
    // O painel mostra 4 travadas…
    expect((await sincronizar(db, segredo, grade(DEZ.slice(4)))).remocoes_travadas).toBe(4)
    // …e, antes da confirmação, alguém esvazia a planilha
    expect((await sincronizar(db, segredo, grade([]))).remocoes_travadas).toBe(10)

    await comoUsuario(db, IDS.org)
    await expect(confirmar(db, desafio, 4)).rejects.toThrow(
      'A lista mudou desde que você conferiu. Confira de novo.',
    )
    expect(await convidados(db, desafio)).toHaveLength(10)
    expect(await resumo(db, desafio)).toMatchObject({ removidos: 0, remocoes_travadas: 10 })
  })

  it('tirar 3 de 10 passa direto (a trava exige mais de 3 pessoas)', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade(DEZ))
    const r = await sincronizar(db, segredo, grade(DEZ.slice(3)))
    expect(r.removidos).toBe(3)
    expect(r.remocoes_travadas).toBe(0)
    expect(await convidados(db, desafio)).toHaveLength(7)
  })

  it('aba sem cabeçalho não muda nada, nem pela confirmação de remoção', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await sincronizar(db, segredo, grade(DEZ))
    const r = await sincronizar(db, segredo, [
      ['Planilha nova', ''],
      ['Fulano Teste', '35 99999-8888'],
    ])
    expect(r).toEqual({
      status: 'sem_cabecalho',
      coluna_marcar: null,
      linhas: [],
      removidos: 0,
      remocoes_travadas: 0,
    })
    expect(await convidados(db, desafio)).toHaveLength(10)
    expect((await resumo(db, desafio))?.status).toBe('sem_cabecalho')
    await comoUsuario(db, IDS.org)
    expect(await confirmar(db, desafio, 0)).toBe(0)
    expect(await convidados(db, desafio)).toHaveLength(10)
  })

  it('na madrugada da festa (04:30 de 06/12) ainda sincroniza', async () => {
    const { db, segredo } = await comPlanilha()
    await agora(db, '2026-12-06T04:30:00-03:00')
    const r = await sincronizar(db, segredo, grade([['Cida Teste', '35 98888-7777']]))
    expect(r.status).toBe('ok')
  })

  it('depois da festa congela: lê o estado atual e não grava nem remove', async () => {
    const { db, desafio, segredo } = await comPlanilha()
    await telefone(db, IDS.b, '35999998888')
    await sincronizar(
      db,
      segredo,
      grade([
        ['Beto Teste', '35 99999-8888'],
        ['Cida Teste', '35 98888-7777'],
      ]),
    )
    const antes = { m: await membros(db, desafio), c: await convidados(db, desafio) }

    await agora(db, '2026-12-06T12:00:00-03:00')
    // Gabi criou a conta depois da festa; Hugo nem conta tem
    await pessoa(db, IDS.c, 'Gabi Teste')
    await telefone(db, IDS.c, '35977776666')
    const r = await sincronizar(
      db,
      segredo,
      grade([
        ['Beto Teste', '35 99999-8888'],
        ['Cida Teste', '35 98888-7777'],
        ['Gabi Teste', '35 97777-6666'],
        ['Hugo Teste', '35 96666-5555'],
      ]),
    )
    expect(r.status).toBe('congelado')
    expect(r.coluna_marcar).toBe(3)
    expect(situacao(r, 7)).toBe('dentro')
    expect(situacao(r, 8)).toBe('aguardando_conta')
    // Quem a festa não registrou fica fora da resposta: o script não mexe na caixa
    expect(situacao(r, 9)).toBeUndefined()
    expect(situacao(r, 10)).toBeUndefined()
    expect({ m: await membros(db, desafio), c: await convidados(db, desafio) }).toEqual(antes)

    // Planilha esvaziada depois da festa: ninguém sai, nem confirmando
    const vazia = await sincronizar(db, segredo, grade([]))
    expect(vazia).toMatchObject({ status: 'congelado', removidos: 0, remocoes_travadas: 0 })
    await comoUsuario(db, IDS.org)
    expect(await confirmar(db, desafio, 0)).toBe(0)
    expect({ m: await membros(db, desafio), c: await convidados(db, desafio) }).toEqual(antes)
    expect((await resumo(db, desafio))?.status).toBe('congelado')
  })

  it('segredo errado é recusado', async () => {
    const { db } = await comPlanilha()
    await expect(sincronizar(db, 'segredo-errado', grade(DEZ))).rejects.toThrow(
      'Segredo inválido',
    )
  })

  it('a resposta não traz telefone nem nome de ninguém', async () => {
    const { db, segredo } = await comPlanilha()
    await telefone(db, IDS.b, '35999998888')
    const r = await sincronizar(
      db,
      segredo,
      grade([
        ['Beto Teste', '35 99999-8888'],
        ['Davi Teste', '99999-8888'],
      ]),
    )
    expect(Object.keys(r).sort()).toEqual([
      'coluna_marcar',
      'linhas',
      'remocoes_travadas',
      'removidos',
      'status',
    ])
    for (const l of r.linhas) expect(Object.keys(l).sort()).toEqual(['indice', 'situacao'])
    expect(JSON.stringify(r)).not.toMatch(/Teste|9999/)
  })

  it('anon chama a sincronização, mas não a remoção interna nem a confirmação', async () => {
    const db = await bancoComMigracao()
    const r = await db.query<{ sync: boolean; conf: boolean; interna: boolean }>(
      `select
         has_function_privilege('anon', 'sincronizar_planilha_ingresso(text, jsonb)', 'execute') as sync,
         has_function_privilege('anon', 'confirmar_remocoes_ingresso(uuid, int)', 'execute') as conf,
         has_function_privilege('anon', 'remover_fora_da_planilha(uuid, text[], boolean)', 'execute') as interna`,
    )
    expect(r.rows[0]).toEqual({ sync: true, conf: false, interna: false })
  })
})
