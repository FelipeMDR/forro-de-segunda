// Roda no banco do Supabase as migrações de supabase/migracoes que ainda
// não foram rodadas — sem colar nada no SQL Editor.
//
//   npm run migrar                      roda as que faltam, em ordem
//   npm run migrar -- --status          só lista o que já rodou e o que falta
//   npm run migrar -- --ja-rodadas-ate 033
//                                       primeira vez: marca 001…033 como já
//                                       rodadas (foram coladas à mão), sem rodar
//
// A conexão vem de SUPABASE_DB_URL, no .env.local (fora do git):
//   Supabase > Project Settings > Database > Connection string > "Session pooler"
//
// O registro do que já rodou fica em interno.migracoes, um schema que a
// API do app não enxerga. Cada arquivo roda numa transação: se der erro,
// nada daquele arquivo fica pela metade. No fim, a API recarrega o schema
// (o antigo "Reload schema cache").

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const PASTA = `${RAIZ}supabase/migracoes`

function lerUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  for (const arquivo of ['.env.local', '.env']) {
    const caminho = `${RAIZ}${arquivo}`
    if (!existsSync(caminho)) continue
    for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  }
  return null
}

const args = process.argv.slice(2)
const soStatus = args.includes('--status')
const iAte = args.indexOf('--ja-rodadas-ate')
const jaRodadasAte = iAte >= 0 ? args[iAte + 1] : null
if (iAte >= 0 && !/^\d{3}$/.test(jaRodadasAte ?? '')) {
  console.error('Use: npm run migrar -- --ja-rodadas-ate 033')
  process.exit(1)
}

const url = lerUrl()
if (!url) {
  console.error(
    'Falta SUPABASE_DB_URL no .env.local.\n' +
      'Supabase > Project Settings > Database > Connection string > "Session pooler",\n' +
      'troque [YOUR-PASSWORD] pela senha do banco e cole assim:\n' +
      '  SUPABASE_DB_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
  )
  process.exit(1)
}

const arquivos = readdirSync(PASTA)
  .filter((a) => /^\d{3}-.+\.sql$/.test(a))
  .sort()

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()
try {
  await db.query(`
    create schema if not exists interno;
    revoke all on schema interno from public;
    create table if not exists interno.migracoes (
      arquivo text primary key,
      rodada_em timestamptz not null default now(),
      -- false: marcada como já rodada à mão (--ja-rodadas-ate)
      pelo_script boolean not null default true
    );
  `)
  const { rows } = await db.query('select arquivo from interno.migracoes')
  const rodadas = new Set(rows.map((r) => r.arquivo))

  if (jaRodadasAte) {
    const marcar = arquivos.filter((a) => a.slice(0, 3) <= jaRodadasAte && !rodadas.has(a))
    for (const a of marcar) {
      await db.query('insert into interno.migracoes (arquivo, pelo_script) values ($1, false)', [a])
      rodadas.add(a)
    }
    console.log(`Marcadas como já rodadas: ${marcar.length} (até a ${jaRodadasAte}).`)
  }

  const faltam = arquivos.filter((a) => !rodadas.has(a))

  if (rodadas.size === 0 && !soStatus) {
    console.error(
      'Nenhuma migração registrada ainda. As antigas foram coladas à mão no SQL Editor,\n' +
        'então diga até qual já rodou (as seguintes rodam agora):\n' +
        '  npm run migrar -- --ja-rodadas-ate 033',
    )
    process.exit(1)
  }

  if (soStatus) {
    console.log(`Já rodadas: ${rodadas.size}`)
    console.log(faltam.length ? `Faltam:\n${faltam.map((a) => `  ${a}`).join('\n')}` : 'Nada faltando.')
  } else if (faltam.length === 0) {
    console.log('Banco em dia: nenhuma migração faltando.')
  } else {
    for (const a of faltam) {
      process.stdout.write(`Rodando ${a}… `)
      try {
        await db.query('begin')
        await db.query(readFileSync(`${PASTA}/${a}`, 'utf8'))
        await db.query('insert into interno.migracoes (arquivo) values ($1)', [a])
        await db.query('commit')
        console.log('ok')
      } catch (e) {
        await db.query('rollback')
        console.log('ERRO')
        console.error(`\n${a} não foi aplicada (nada dela ficou no banco):\n${e.message}`)
        process.exitCode = 1
        break
      }
    }
    // O antigo "Reload schema cache": a API passa a ver tabelas e colunas novas
    await db.query(`notify pgrst, 'reload schema'`)
  }
} finally {
  await db.end()
}
