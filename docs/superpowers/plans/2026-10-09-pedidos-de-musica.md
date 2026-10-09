# Pedidos de música no Espaço Livre — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** alunos com check-in na noite pedem músicas pelo app, e um loop no servidor entrega os pedidos, em rodízio, ao Spotify do professor que está de DJ.

**Architecture:**
- **Banco.** A migração 029 cria três tabelas (conexões, sessões e pedidos) e funções SQL que guardam todas as regras: ordem do rodízio, quem pode pedir, cancelar e ligar o Modo DJ.
- **Servidor.** Três Edge Functions (Deno) fazem a conexão OAuth do professor, a busca de músicas e o loop. O loop é chamado pelo pg_cron a cada minuto, só com sessão aberta.
- **Lógica pura.** O que o loop decide fica num módulo sem rede nem Deno (`supabase/functions/_shared/djPuro.ts`), compartilhado pelas Edge Functions, pelo modo demonstração do app e pelos testes.
- **App.** Ganha métodos novos no `ForroApi` (Supabase e Demo), três telas, um cartão no feed, um bloco na Conta e um distintivo.

**Tech Stack:**
- React 18 + Vite 6 + TypeScript + Tailwind v4;
- Supabase (Postgres, RLS, Edge Functions em Deno, pg_cron + pg_net);
- Spotify Web API;
- Vitest 3 + PGlite (Postgres em memória) para os testes.

**Spec:** `docs/superpowers/specs/2026-10-09-pedidos-de-musica-design.md`

## Global Constraints

- **Branch:** trabalhar em `Dev`. Nunca fazer merge/push para `main` sem o Felipe pedir.
- **Commits:**
  - mensagem em português, sem acentos, com o porquê;
  - **sem** trailer `Co-Authored-By` e sem menção ao Claude (preferência do Felipe, vale para tudo no repositório).
- **Textos de tela:** em português, com acentos, no tom do app ("Faça seu check-in para pedir música").
- **Spotify:**
  - Client ID: `b50dd222d8e9498faf4744ed49a799dd`;
  - Redirect URIs exatos: `https://forro-de-segunda.vercel.app/spotify/conectado` e `http://127.0.0.1:5173/spotify/conectado`;
  - escopos: `user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private`.
- **Client Secret:** nunca entra no repositório, em `.env` versionado, no app ou no chat. Só em `supabase secrets` (`SPOTIFY_CLIENT_SECRET`).
- **Cota de logs:**
  - **nenhuma** assinatura de tempo real nova;
  - telas que se atualizam sozinhas: no máximo a cada 30 s, e só com a aba visível;
  - busca só ao enviar o formulário, nunca a cada tecla.
- **Rodízio:**
  - `rodada` = enviados/tocados da pessoa na noite + posição entre os esperando dela;
  - `chegada` = primeiro pedido da pessoa na noite (sem os cancelados);
  - ordem: rodada, chegada, pedido_em, id.
- **Distintivo:** 🎵 1, 🎶 10, 🎧 25, 🔊 50 músicas tocadas (🪩 já é do rodízio).
- **Quem pode ser DJ:** cargo `Professor(a)` ou `Diretor(a) de Ensino`, ou papel `organizador`.
- **API dupla:** todo método novo do `ForroApi` existe em `SupabaseApi` **e** em `DemoApi`.
- **Fuso:** São Paulo. A "noite" vira às 5h (`noite_do_checkin` no banco, `diaDaNoite` no app). O app pressupõe UTC−3 fixo (sem horário de verão desde 2019) só em `fimDaNoite`.

## Review Focus

1. **Duas passadas do loop ao mesmo tempo** (cron + app cutucando ao ligar): o mesmo pedido não pode ir duas vezes ao Spotify. Teste: `reservar_proximo_pedido` chamado duas vezes devolve pedidos diferentes, e nunca o mesmo (Task 2).
2. **Faixa sem capa ou episódio de podcast** na fila do Spotify do professor: o loop não pode quebrar. Testes: `faixaDaApi` sem `album.images` e com `show` (Task 3).
3. **Renovação de chave sem `refresh_token` novo:** o Spotify às vezes não manda; o antigo precisa continuar. Teste: `mesclarToken` mantém o antigo (Task 3).
4. **Professor desconecta ou revoga o acesso com o Modo DJ ligado:** a sessão precisa fechar, e não ficar ligada sem ninguém tocar. Testes: `desconectar_spotify` fecha a sessão (Task 2) e `decidirPassada` sem conexão fecha com `conexao_perdida` (Task 3).
5. **URI malformada no pedido** (chamada direta à função, fora da tela): precisa ser recusada antes de chegar ao Spotify. Teste: `pedir_musica` com URI inválida (Task 2).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `vitest.config.ts` | configuração mínima de testes (sem carregar o plugin PWA) |
| `tests/sql/banco.ts` | PGlite com o mínimo do banco de produção + migração 029 |
| `tests/sql/pedidosMusica.test.ts` | regras do banco |
| `tests/dj/djPuro.test.ts` | lógica pura do loop e dos dados do Spotify |
| `tests/lib/filaMusica.test.ts`, `tests/lib/dj.test.ts`, `tests/lib/badges.test.ts`, `tests/lib/demoDj.test.ts` | regras do app |
| `supabase/migracoes/029-pedidos-de-musica.sql` | tabelas, rodízio, funções e passos de implantação |
| `supabase/functions/_shared/djPuro.ts` | decisão do loop, leitura das respostas do Spotify, tokens (sem Deno) |
| `supabase/functions/_shared/http.ts` | CORS e resposta JSON |
| `supabase/functions/_shared/spotify.ts` | chamadas HTTP ao Spotify (Deno) |
| `supabase/functions/spotify-buscar/index.ts` | busca com a chave do app |
| `supabase/functions/spotify-conectar/index.ts` | OAuth do professor |
| `supabase/functions/dj-loop/index.ts` | o loop |
| `src/lib/filaMusica.ts` | ordem do rodízio em TS (para o demo) |
| `src/lib/dj.ts` | `podeSerDJ`, URL de autorização, `state` |
| `src/lib/catalogoDemo.ts` | músicas do modo demonstração |
| `src/lib/useAtualizacaoPeriodica.ts` | recarga a cada N s só com a aba visível |
| `src/lib/types.ts`, `src/lib/api.ts`, `src/lib/supabaseApi.ts`, `src/lib/demoApi.ts` | tipos e API |
| `src/lib/badges.ts`, `src/lib/perfilStats.ts` | distintivo |
| `src/components/ConexaoSpotify.tsx`, `src/components/PedidosAbertos.tsx` | bloco na Conta e cartão no feed |
| `src/pages/SpotifyConectadoPage.tsx`, `src/pages/DJPage.tsx`, `src/pages/MusicaPage.tsx` | telas |
| `src/App.tsx`, `src/pages/ContaPage.tsx`, `src/pages/FeedPage.tsx` | rotas e montagem |
| `supabase/conferir-migracoes.sql`, `DESIGN.md` | conferência e documentação |

---

### Task 1: Infra de testes, tabelas e a ordem do rodízio no banco

**Files:**
- Modify: `package.json` (script `test`, devDependencies)
- Create: `vitest.config.ts`
- Create: `tests/sql/banco.ts`
- Create: `tests/sql/pedidosMusica.test.ts`
- Create: `supabase/migracoes/029-pedidos-de-musica.sql` (primeira parte)

**Interfaces:**
- Produces:
  - tabelas `dj_conexoes`, `pedidos_musica`, `dj_sessoes`;
  - `fila_da_noite(p_noite date)` → linhas `(id uuid, noite date, user_id uuid, nome text, avatar_url text, track_uri text, titulo text, artista text, capa_url text, duracao_ms int, pedido_em timestamptz, status text, rodada int, posicao int)`;
  - `pode_ser_dj(p_uid uuid) → boolean`;
  - `tests/sql/banco.ts`: `bancoComMigracao(): Promise<PGlite>`, `comoUsuario(db, uid | null)`, `IDS`, `pessoa(db, id, nome, opcoes?)`, `checkinNaNoite(db, uid, quando)`, `sessaoAberta(db, djId, noite)`, `pedido(db, uid, noite, uri, pedidoEm, status?)`.

- [ ] **Step 1: Instalar as ferramentas de teste**

```bash
npm i -D vitest@^3.2.4 @electric-sql/pglite@^0.2.17
```

Em `package.json`, dentro de `"scripts"`, acrescentar:

```json
    "test": "vitest run",
```

Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

// Arquivo próprio para os testes não carregarem o vite.config.ts, que
// liga o plugin do PWA e gera service worker a cada execução.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // O PGlite sobe um Postgres inteiro em memória por teste
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 2: Escrever o banco de teste**

Criar `tests/sql/banco.ts`:

```ts
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRACAO = fileURLToPath(
  new URL('../../supabase/migracoes/029-pedidos-de-musica.sql', import.meta.url),
)

/**
 * O mínimo do banco de produção de que a migração 029 depende. As
 * definições de `is_organizador` e `noite_do_checkin` são cópias das de
 * produção (schema.sql e migração 018); se elas mudarem lá, mudam aqui.
 */
const BASE = `
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('teste.uid', true), '')::uuid
$$;
create table public.profiles (
  id uuid primary key, nome text not null, avatar_url text
);
create table public.roles (
  user_id uuid primary key references public.profiles(id), papel text not null
);
create table public.profile_cargos (
  user_id uuid references public.profiles(id), cargo text not null,
  primary key (user_id, cargo)
);
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  presenca_anulada boolean not null default false
);
create function public.is_organizador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from roles where user_id = auth.uid() and papel = 'organizador');
$$;
create function public.noite_do_checkin(quando timestamptz) returns date
language sql immutable as $$
  select ((quando at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
$$;
`

export const IDS = {
  prof: '00000000-0000-0000-0000-0000000000d1',
  prof2: '00000000-0000-0000-0000-0000000000d2',
  org: '00000000-0000-0000-0000-0000000000e1',
  a: '00000000-0000-0000-0000-00000000000a',
  b: '00000000-0000-0000-0000-00000000000b',
  c: '00000000-0000-0000-0000-00000000000c',
}

export async function bancoComMigracao(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(BASE)
  await db.exec(readFileSync(MIGRACAO, 'utf8'))
  return db
}

/** Faz `auth.uid()` devolver essa pessoa (null = deslogado/serviço). */
export async function comoUsuario(db: PGlite, uid: string | null) {
  await db.query(`select set_config('teste.uid', $1, false)`, [uid ?? ''])
}

export async function pessoa(
  db: PGlite,
  id: string,
  nome: string,
  opcoes: { cargo?: string; organizador?: boolean; conectado?: boolean } = {},
) {
  await db.query(`insert into profiles (id, nome) values ($1, $2)`, [id, nome])
  if (opcoes.cargo) {
    await db.query(`insert into profile_cargos values ($1, $2)`, [id, opcoes.cargo])
  }
  if (opcoes.organizador) {
    await db.query(`insert into roles values ($1, 'organizador')`, [id])
  }
  if (opcoes.conectado) {
    await db.query(
      `insert into dj_conexoes (user_id, spotify_id, access_token, refresh_token, expira_em)
       values ($1, 'sp-' || $1, 'acesso', 'renovacao', now() + interval '1 hour')`,
      [id],
    )
  }
}

/** Check-in num instante dado (ISO com fuso, ex. '2026-10-12T22:00:00-03:00'). */
export async function checkinNaNoite(
  db: PGlite,
  uid: string,
  quando: string,
  anulada = false,
) {
  await db.query(
    `insert into checkins (user_id, criado_em, presenca_anulada) values ($1, $2, $3)`,
    [uid, quando, anulada],
  )
}

/** Abre uma sessão direto na tabela (sem passar por `ligar_modo_dj`). */
export async function sessaoAberta(db: PGlite, djId: string, noite: string) {
  await db.query(`insert into dj_sessoes (dj_user_id, noite) values ($1, $2)`, [djId, noite])
}

/** Pedido direto na tabela, com hora controlada — para testar a ordem. */
export async function pedido(
  db: PGlite,
  uid: string,
  noite: string,
  uri: string,
  pedidoEm: string,
  status: 'esperando' | 'enviado' | 'tocou' | 'cancelado' = 'esperando',
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into pedidos_musica (noite, user_id, track_uri, titulo, artista, pedido_em, status)
     values ($1, $2, $3, $3, 'artista', $4, $5) returning id`,
    [noite, uid, uri, pedidoEm, status],
  )
  return r.rows[0].id
}

export async function fila(db: PGlite, noite: string) {
  const r = await db.query<{ track_uri: string; rodada: number; posicao: number }>(
    `select track_uri, rodada, posicao from fila_da_noite($1)`,
    [noite],
  )
  return r.rows
}
```

- [ ] **Step 3: Escrever os testes do rodízio (vão falhar)**

Criar `tests/sql/pedidosMusica.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bancoComMigracao, fila, IDS, pedido, pessoa } from './banco'

const NOITE = '2026-10-12'
/** Hora `hh:mm` da noite de 12/10, em São Paulo. */
const as = (hhmm: string) => `2026-10-12T${hhmm}:00-03:00`

async function comTresAlunos() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.a, 'Ana')
  await pessoa(db, IDS.b, 'Beto')
  await pessoa(db, IDS.c, 'Caio')
  return db
}

describe('fila_da_noite — rodízio', () => {
  it('quem chega com 1 pedido passa na frente da 2ª música de quem pediu 20', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    for (let i = 2; i <= 20; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`))
    }
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:30'))

    const f = await fila(db, NOITE)
    expect(f.slice(0, 3).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a2',
      'spotify:track:a3',
    ])
    expect(f[0]).toMatchObject({ rodada: 1, posicao: 1 })
    expect(f[1]).toMatchObject({ rodada: 2, posicao: 2 })
  })

  it('quem chega depois de A tocar 15 entra na frente da 16ª de A', async () => {
    const db = await comTresAlunos()
    for (let i = 1; i <= 15; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`), 'tocou')
    }
    await pedido(db, IDS.a, NOITE, 'spotify:track:a16', as('21:16'))
    await pedido(db, IDS.c, NOITE, 'spotify:track:c1', as('23:00'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:c1',
      'spotify:track:a16',
    ])
  })

  it('mesma rodada: vai na frente quem fez o primeiro pedido da noite antes', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:05'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:10'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a1',
      'spotify:track:b2',
    ])
  })

  it('cancelar um pedido reorganiza as rodadas daquela pessoa', async () => {
    const db = await comTresAlunos()
    const a1 = await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:03'))
    await db.query(`update pedidos_musica set status = 'cancelado' where id = $1`, [a1])

    // A agora tem só a2, que vira rodada 1; e a chegada de A passa a ser
    // 21:01 (o cancelado não conta), ainda antes de B
    expect(await fila(db, NOITE)).toEqual([
      { track_uri: 'spotify:track:a2', rodada: 1, posicao: 1 },
      { track_uri: 'spotify:track:b1', rodada: 1, posicao: 2 },
      { track_uri: 'spotify:track:b2', rodada: 2, posicao: 3 },
    ])
  })

  it('quem já tocou 1 e pede outra mais tarde entra na rodada 2', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'), 'enviado')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a3', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:03'), 'tocou')
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('23:00'))

    // a3 é rodada 3 (2 já enviados + 1); b2 é rodada 2 → b2 primeiro
    expect((await fila(db, NOITE)).map((p) => [p.track_uri, p.rodada])).toEqual([
      ['spotify:track:b2', 2],
      ['spotify:track:a3', 3],
    ])
  })

  it('só olha a noite pedida', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, '2026-10-11', 'spotify:track:ontem', '2026-10-11T22:00:00-03:00')
    await pedido(db, IDS.a, NOITE, 'spotify:track:hoje', as('22:00'))
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual(['spotify:track:hoje'])
  })
})
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run tests/sql/pedidosMusica.test.ts`
Expected: FAIL com `ENOENT ... 029-pedidos-de-musica.sql` (a migração ainda não existe).

- [ ] **Step 5: Escrever a primeira parte da migração**

Criar `supabase/migracoes/029-pedidos-de-musica.sql`:

```sql
-- ============================================================
-- MIGRAÇÃO 029 — Pedidos de música no Espaço Livre
--
-- Spec: docs/superpowers/specs/2026-10-09-pedidos-de-musica-design.md
--
-- A Jam do Spotify deixa uma pessoa enfileirar vinte músicas seguidas.
-- Aqui os pedidos ficam no app, numa fila em rodízio (uma música de
-- cada pessoa por rodada), e um loop no servidor (Edge Function
-- `dj-loop`) entrega um pedido por vez ao Spotify do professor que
-- está de DJ.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- ---------- Conexão Spotify de cada professor ----------
-- Só as Edge Functions (service role) leem e escrevem: RLS ligado e
-- nenhuma policy. As chaves nunca chegam a um celular.
create table if not exists public.dj_conexoes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  spotify_id text not null,
  spotify_nome text,
  plano text,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  conectado_em timestamptz not null default now()
);
alter table public.dj_conexoes enable row level security;

-- ---------- Pedidos ----------
-- A fila é da NOITE, não da sessão: trocar de DJ no meio do Espaço
-- Livre não zera nada.
create table if not exists public.pedidos_musica (
  id uuid primary key default gen_random_uuid(),
  noite date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_uri text not null,
  titulo text not null,
  artista text not null,
  capa_url text,
  duracao_ms int not null default 0,
  pedido_em timestamptz not null default now(),
  status text not null default 'esperando'
    check (status in ('esperando', 'enviado', 'tocou', 'cancelado')),
  enviado_em timestamptz,
  tocou_em timestamptz,
  cancelado_por uuid
);
-- A mesma música não entra duas vezes na mesma noite, por ninguém
create unique index if not exists pedidos_musica_uma_por_noite
  on public.pedidos_musica (noite, track_uri) where status <> 'cancelado';
create index if not exists pedidos_musica_noite_status
  on public.pedidos_musica (noite, status);
alter table public.pedidos_musica enable row level security;
drop policy if exists "pedidos_musica_select" on public.pedidos_musica;
create policy "pedidos_musica_select" on public.pedidos_musica
  for select to authenticated using (true);

-- ---------- Sessões de DJ ----------
create table if not exists public.dj_sessoes (
  id uuid primary key default gen_random_uuid(),
  dj_user_id uuid not null references public.profiles(id) on delete cascade,
  noite date not null,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  motivo_fechamento text
    check (motivo_fechamento in ('desligou', 'assumida', 'virada', 'conexao_perdida')),
  aviso text check (aviso in ('sem_aparelho', 'sem_premium')),
  tocando_uri text,
  tocando_titulo text,
  tocando_artista text,
  tocando_capa text,
  tocando_pedido_id uuid references public.pedidos_musica(id) on delete set null,
  atualizado_em timestamptz
);
-- No máximo UMA sessão aberta no projeto: há um Espaço Livre só
create unique index if not exists dj_sessoes_uma_aberta
  on public.dj_sessoes ((true)) where fechada_em is null;
alter table public.dj_sessoes enable row level security;
drop policy if exists "dj_sessoes_select" on public.dj_sessoes;
create policy "dj_sessoes_select" on public.dj_sessoes
  for select to authenticated using (true);

-- ---------- Quem pode ser DJ ----------
create or replace function public.pode_ser_dj(p_uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profile_cargos
    where user_id = p_uid and cargo in ('Professor(a)', 'Diretor(a) de Ensino')
  ) or exists (
    select 1 from roles where user_id = p_uid and papel = 'organizador'
  );
$$;

-- ---------- A ordem do rodízio (ÚNICA definição) ----------
-- rodada  = pedidos da pessoa já enviados/tocados na noite
--           + posição deste entre os que ela tem esperando
-- chegada = o primeiro pedido da pessoa na noite (sem os cancelados)
-- Ordem: rodada, chegada, pedido_em, id.
-- O modo demonstração repete esta regra em src/lib/filaMusica.ts; os
-- dois são testados com os mesmos exemplos.
create or replace function public.fila_da_noite(p_noite date)
returns table (
  id uuid, noite date, user_id uuid, nome text, avatar_url text,
  track_uri text, titulo text, artista text, capa_url text,
  duracao_ms int, pedido_em timestamptz, status text,
  rodada int, posicao int
)
language sql stable security definer
set search_path = public
as $$
  with ativos as (
    select p.*,
      count(*) filter (where p.status in ('enviado', 'tocou'))
        over (partition by p.user_id) as ja_enviados,
      min(p.pedido_em) over (partition by p.user_id) as chegada
    from pedidos_musica p
    where p.noite = p_noite and p.status <> 'cancelado'
  ),
  esperando as (
    select a.*,
      a.ja_enviados
        + row_number() over (partition by a.user_id order by a.pedido_em, a.id)
        as rodada_calc
    from ativos a
    where a.status = 'esperando'
  )
  select e.id, e.noite, e.user_id, pr.nome, pr.avatar_url,
         e.track_uri, e.titulo, e.artista, e.capa_url,
         e.duracao_ms, e.pedido_em, e.status,
         e.rodada_calc::int,
         (row_number() over (
           order by e.rodada_calc, e.chegada, e.pedido_em, e.id
         ))::int
  from esperando e
  join profiles pr on pr.id = e.user_id
  order by 14;
$$;
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run tests/sql/pedidosMusica.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/sql supabase/migracoes/029-pedidos-de-musica.sql
git commit -m "Pedidos de musica: tabelas e ordem do rodizio no banco

Migracao 029, primeira parte: conexoes Spotify dos professores (so o
servidor le), sessoes de DJ (uma aberta por vez) e pedidos por noite.
fila_da_noite e a unica definicao da ordem: menor rodada primeiro, e na
mesma rodada quem chegou antes. Testes rodam a migracao de verdade num
Postgres em memoria (PGlite)."
```

---

### Task 2: Pedir, cancelar, ligar o Modo DJ e as funções do loop

**Files:**
- Modify: `supabase/migracoes/029-pedidos-de-musica.sql` (acrescentar no fim)
- Modify: `tests/sql/pedidosMusica.test.ts` (acrescentar no fim)

**Interfaces:**
- Consumes: tudo da Task 1.
- Produces (SQL):
  - `pedir_musica(p_uri text, p_titulo text, p_artista text, p_capa text, p_duracao int) → uuid`
  - `cancelar_pedido(p_id uuid) → void`
  - `ligar_modo_dj(p_assumir boolean) → jsonb` (`{"tipo":"ligado"}` ou `{"tipo":"ocupado","dj_nome":"…"}`)
  - `desligar_modo_dj() → void`
  - `minha_conexao_dj() → jsonb` (`{conectado, spotify_nome, plano}`)
  - `desconectar_spotify() → void`
  - `reservar_proximo_pedido(p_noite date) → setof pedidos_musica` (só service role)
  - `devolver_pedido(p_id uuid) → void` (só service role)
- Nota sobre a spec (§4.4): ela fala em `proximo_pedido(noite)`. No lugar dele entra `reservar_proximo_pedido`, que lê o primeiro de `fila_da_noite` **e** marca como `enviado` na mesma operação. É o que impede duas passadas simultâneas do loop de mandarem o mesmo pedido (Review Focus 1). Para mostrar "a próxima" na tela, basta o primeiro item de `fila_da_noite`.
- Mensagens de erro exatas (o app mostra como vierem):
  - `Você precisa entrar primeiro`
  - `Música inválida`
  - `O Modo DJ não está ligado agora`
  - `Faça seu check-in para pedir música`
  - `Essa música já foi pedida hoje`
  - `Pedido não encontrado`
  - `Esse pedido já foi para o Spotify`
  - `Você só pode cancelar os seus pedidos`
  - `Só professores podem ligar o Modo DJ`
  - `Conecte seu Spotify antes de ligar o Modo DJ`

- [ ] **Step 1: Escrever os testes (vão falhar)**

Acrescentar ao fim de `tests/sql/pedidosMusica.test.ts`, e trocar o import do topo por:

```ts
import { describe, expect, it } from 'vitest'
import {
  bancoComMigracao,
  checkinNaNoite,
  comoUsuario,
  fila,
  IDS,
  pedido,
  pessoa,
  sessaoAberta,
} from './banco'
```

```ts
describe('pedir_musica', () => {
  async function preparado() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.a, 'Ana')
    await sessaoAberta(db, IDS.prof, NOITE)
    await checkinNaNoite(db, IDS.a, as('21:30'))
    await comoUsuario(db, IDS.a)
    return db
  }
  const pedir = (db: Awaited<ReturnType<typeof bancoComMigracao>>, uri: string) =>
    db.query(`select pedir_musica($1, 'Título', 'Artista', null, 180000)`, [uri])

  it('aceita quem tem check-in na noite da sessão', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual(['spotify:track:abc123'])
  })

  it('recusa sem sessão aberta', async () => {
    const db = await preparado()
    await db.query(`update dj_sessoes set fechada_em = now()`)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('O Modo DJ não está ligado agora')
  })

  it('recusa sem check-in na noite', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, '2026-10-11T22:00:00-03:00') // noite anterior
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Faça seu check-in para pedir música')
  })

  it('recusa quem só tem check-in com presença anulada', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, as('22:00'), true)
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Faça seu check-in para pedir música')
  })

  it('a madrugada (antes das 5h) ainda é a noite da sessão', async () => {
    const db = await preparado()
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, '2026-10-13T01:30:00-03:00')
    await comoUsuario(db, IDS.b)
    await pedir(db, 'spotify:track:madrugada')
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toContain('spotify:track:madrugada')
  })

  it('recusa música já pedida na noite, por qualquer pessoa', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    await pessoa(db, IDS.b, 'Beto')
    await checkinNaNoite(db, IDS.b, as('22:00'))
    await comoUsuario(db, IDS.b)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Essa música já foi pedida hoje')
  })

  it('aceita de novo uma música cujo pedido foi cancelado', async () => {
    const db = await preparado()
    await pedir(db, 'spotify:track:abc123')
    await db.query(`update pedidos_musica set status = 'cancelado'`)
    await pedir(db, 'spotify:track:abc123')
    expect((await fila(db, NOITE)).length).toBe(1)
  })

  it('recusa URI que não é de faixa do Spotify', async () => {
    const db = await preparado()
    for (const ruim of ['spotify:episode:abc', 'spotify:track:abc 1', "spotify:track:x'; drop table x;--", '']) {
      await expect(pedir(db, ruim)).rejects.toThrow('Música inválida')
    }
  })

  it('recusa deslogado', async () => {
    const db = await preparado()
    await comoUsuario(db, null)
    await expect(pedir(db, 'spotify:track:abc123')).rejects.toThrow('Você precisa entrar primeiro')
  })
})

describe('cancelar_pedido', () => {
  async function comPedidoDaAna() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.org, 'Org', { organizador: true })
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Beto')
    await sessaoAberta(db, IDS.prof, NOITE)
    const id = await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    return { db, id }
  }
  const cancelar = (db: Awaited<ReturnType<typeof bancoComMigracao>>, id: string) =>
    db.query(`select cancelar_pedido($1)`, [id])

  it('a dona do pedido cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.a)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('o DJ da sessão cancela qualquer um', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.prof)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('organizador cancela qualquer um', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.org)
    await cancelar(db, id)
    expect(await fila(db, NOITE)).toEqual([])
  })

  it('outro aluno não cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await comoUsuario(db, IDS.b)
    await expect(cancelar(db, id)).rejects.toThrow('Você só pode cancelar os seus pedidos')
  })

  it('pedido já enviado não cancela', async () => {
    const { db, id } = await comPedidoDaAna()
    await db.query(`update pedidos_musica set status = 'enviado' where id = $1`, [id])
    await comoUsuario(db, IDS.a)
    await expect(cancelar(db, id)).rejects.toThrow('Esse pedido já foi para o Spotify')
  })
})

describe('ligar_modo_dj / desligar_modo_dj', () => {
  async function doisProfessores() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof Um', { cargo: 'Professor(a)', conectado: true })
    await pessoa(db, IDS.prof2, 'Prof Dois', { cargo: 'Diretor(a) de Ensino', conectado: true })
    return db
  }
  const ligar = async (db: Awaited<ReturnType<typeof bancoComMigracao>>, assumir: boolean) =>
    (await db.query<{ r: unknown }>(`select ligar_modo_dj($1) as r`, [assumir])).rows[0].r
  const abertas = async (db: Awaited<ReturnType<typeof bancoComMigracao>>) =>
    (await db.query<{ dj_user_id: string }>(`select dj_user_id from dj_sessoes where fechada_em is null`)).rows

  it('liga e abre a sessão', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    expect(await ligar(db, false)).toEqual({ tipo: 'ligado' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof }])
  })

  it('ligar de novo o próprio Modo DJ não abre outra sessão', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    expect(await ligar(db, false)).toEqual({ tipo: 'ligado' })
    expect((await abertas(db)).length).toBe(1)
  })

  it('com outro DJ ligado, avisa quem é, e só assume se pedir', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    await comoUsuario(db, IDS.prof2)
    expect(await ligar(db, false)).toEqual({ tipo: 'ocupado', dj_nome: 'Prof Um' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof }])

    expect(await ligar(db, true)).toEqual({ tipo: 'ligado' })
    expect(await abertas(db)).toEqual([{ dj_user_id: IDS.prof2 }])
    const motivo = await db.query<{ motivo_fechamento: string }>(
      `select motivo_fechamento from dj_sessoes where dj_user_id = $1`,
      [IDS.prof],
    )
    expect(motivo.rows[0].motivo_fechamento).toBe('assumida')
  })

  it('aluno não liga', async () => {
    const db = await doisProfessores()
    await pessoa(db, IDS.a, 'Ana')
    await comoUsuario(db, IDS.a)
    await expect(ligar(db, false)).rejects.toThrow('Só professores podem ligar o Modo DJ')
  })

  it('professor sem Spotify conectado não liga', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)' })
    await comoUsuario(db, IDS.prof)
    await expect(ligar(db, false)).rejects.toThrow('Conecte seu Spotify antes de ligar o Modo DJ')
  })

  it('desligar fecha a própria sessão; outro professor não desliga a dos outros', async () => {
    const db = await doisProfessores()
    await comoUsuario(db, IDS.prof)
    await ligar(db, false)
    await comoUsuario(db, IDS.prof2)
    await db.query(`select desligar_modo_dj()`)
    expect((await abertas(db)).length).toBe(1)
    await comoUsuario(db, IDS.prof)
    await db.query(`select desligar_modo_dj()`)
    expect(await abertas(db)).toEqual([])
  })
})

describe('conexão vista pelo app', () => {
  it('minha_conexao_dj não devolve as chaves', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await comoUsuario(db, IDS.prof)
    const r = (await db.query<{ r: Record<string, unknown> }>(`select minha_conexao_dj() as r`)).rows[0].r
    expect(r).toEqual({ conectado: true, spotify_nome: null, plano: null })
    expect(JSON.stringify(r)).not.toContain('acesso')
  })

  it('sem conexão devolve conectado = false', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await comoUsuario(db, IDS.a)
    const r = (await db.query<{ r: Record<string, unknown> }>(`select minha_conexao_dj() as r`)).rows[0].r
    expect(r).toEqual({ conectado: false, spotify_nome: null, plano: null })
  })

  it('desconectar apaga a conexão e fecha a sessão aberta da pessoa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.prof, 'Prof', { cargo: 'Professor(a)', conectado: true })
    await comoUsuario(db, IDS.prof)
    await db.query(`select ligar_modo_dj(false)`)
    await db.query(`select desconectar_spotify()`)
    expect((await db.query(`select 1 from dj_conexoes`)).rows.length).toBe(0)
    expect((await db.query(`select 1 from dj_sessoes where fechada_em is null`)).rows.length).toBe(0)
  })
})

describe('reservar_proximo_pedido / devolver_pedido (loop)', () => {
  async function comFila() {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await pessoa(db, IDS.b, 'Beto')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:02'))
    return db
  }
  const reservar = async (db: Awaited<ReturnType<typeof bancoComMigracao>>) =>
    (await db.query<{ track_uri: string; status: string }>(
      `select track_uri, status from reservar_proximo_pedido($1)`,
      [NOITE],
    )).rows

  it('reserva o primeiro do rodízio e marca como enviado', async () => {
    const db = await comFila()
    expect(await reservar(db)).toEqual([{ track_uri: 'spotify:track:a1', status: 'enviado' }])
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a2',
    ])
  })

  it('duas reservas seguidas nunca devolvem o mesmo pedido', async () => {
    const db = await comFila()
    const [r1, r2] = [await reservar(db), await reservar(db)]
    expect(r1[0].track_uri).not.toBe(r2[0].track_uri)
  })

  it('fila vazia não reserva nada', async () => {
    const db = await bancoComMigracao()
    expect(await reservar(db)).toEqual([])
  })

  it('devolver põe o pedido de volta no lugar dele', async () => {
    const db = await comFila()
    await reservar(db)
    const id = (await db.query<{ id: string }>(`select id from pedidos_musica where track_uri = 'spotify:track:a1'`)).rows[0].id
    await db.query(`select devolver_pedido($1)`, [id])
    expect((await fila(db, NOITE))[0].track_uri).toBe('spotify:track:a1')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/sql/pedidosMusica.test.ts`
Expected: os 6 testes da Task 1 passam, e os novos falham com `function pedir_musica(...) does not exist` (e equivalentes).

- [ ] **Step 3: Acrescentar as funções no fim da migração**

Acrescentar ao fim de `supabase/migracoes/029-pedidos-de-musica.sql`:

```sql
-- ---------- Pedir e cancelar ----------
create or replace function public.pedir_musica(
  p_uri text, p_titulo text, p_artista text, p_capa text, p_duracao int
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_noite date;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  if p_uri is null or p_uri !~ '^spotify:track:[A-Za-z0-9]+$' then
    raise exception 'Música inválida';
  end if;
  -- A noite é a da sessão aberta, nunca a do relógio: um pedido às
  -- 5h01 com o DJ ainda ligado não pode cair numa fila que ninguém toca.
  select s.noite into v_noite from dj_sessoes s where s.fechada_em is null;
  if v_noite is null then
    raise exception 'O Modo DJ não está ligado agora';
  end if;
  if not exists (
    select 1 from checkins c
    where c.user_id = v_uid
      and noite_do_checkin(c.criado_em) = v_noite
      and not c.presenca_anulada
  ) then
    raise exception 'Faça seu check-in para pedir música';
  end if;
  begin
    insert into pedidos_musica (noite, user_id, track_uri, titulo, artista, capa_url, duracao_ms)
    values (v_noite, v_uid, p_uri, left(p_titulo, 200), left(p_artista, 200), p_capa, coalesce(p_duracao, 0))
    returning pedidos_musica.id into v_id;
  exception when unique_violation then
    raise exception 'Essa música já foi pedida hoje';
  end;
  return v_id;
end;
$$;

create or replace function public.cancelar_pedido(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dono uuid;
  v_status text;
  v_dj uuid;
begin
  select p.user_id, p.status into v_dono, v_status
  from pedidos_musica p where p.id = p_id;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_status <> 'esperando' then
    raise exception 'Esse pedido já foi para o Spotify';
  end if;
  select s.dj_user_id into v_dj from dj_sessoes s where s.fechada_em is null;
  if v_dono <> v_uid and v_dj is distinct from v_uid and not is_organizador() then
    raise exception 'Você só pode cancelar os seus pedidos';
  end if;
  update pedidos_musica
  set status = 'cancelado', cancelado_por = v_uid
  where id = p_id;
end;
$$;

-- ---------- Ligar e desligar o Modo DJ ----------
create or replace function public.ligar_modo_dj(p_assumir boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aberta_id uuid;
  v_aberta_dj uuid;
  v_nome text;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  if not pode_ser_dj(v_uid) then
    raise exception 'Só professores podem ligar o Modo DJ';
  end if;
  if not exists (select 1 from dj_conexoes where user_id = v_uid) then
    raise exception 'Conecte seu Spotify antes de ligar o Modo DJ';
  end if;
  select s.id, s.dj_user_id into v_aberta_id, v_aberta_dj
  from dj_sessoes s where s.fechada_em is null
  for update;
  if v_aberta_id is not null then
    if v_aberta_dj = v_uid then
      return jsonb_build_object('tipo', 'ligado');
    end if;
    if not p_assumir then
      select nome into v_nome from profiles where id = v_aberta_dj;
      return jsonb_build_object('tipo', 'ocupado', 'dj_nome', v_nome);
    end if;
    update dj_sessoes
    set fechada_em = now(), motivo_fechamento = 'assumida'
    where id = v_aberta_id;
  end if;
  insert into dj_sessoes (dj_user_id, noite)
  values (v_uid, noite_do_checkin(now()));
  return jsonb_build_object('tipo', 'ligado');
end;
$$;

create or replace function public.desligar_modo_dj()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update dj_sessoes
  set fechada_em = now(), motivo_fechamento = 'desligou'
  where fechada_em is null
    and (dj_user_id = auth.uid() or is_organizador());
end;
$$;

-- ---------- Conexão vista pelo app (sem as chaves) ----------
create or replace function public.minha_conexao_dj()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
       'conectado', true, 'spotify_nome', spotify_nome, 'plano', plano)
     from dj_conexoes where user_id = auth.uid()),
    jsonb_build_object('conectado', false, 'spotify_nome', null, 'plano', null)
  );
$$;

create or replace function public.desconectar_spotify()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Sem conexão não há quem toque: a sessão aberta dessa pessoa fecha junto
  update dj_sessoes
  set fechada_em = now(), motivo_fechamento = 'desligou'
  where fechada_em is null and dj_user_id = auth.uid();
  delete from dj_conexoes where user_id = auth.uid();
end;
$$;

-- ---------- Só para o loop (service role) ----------
-- Reserva o próximo do rodízio marcando como `enviado` ANTES de mandar
-- ao Spotify: duas passadas ao mesmo tempo (cron + app cutucando)
-- nunca mandam o mesmo pedido duas vezes — só uma ganha o update.
create or replace function public.reservar_proximo_pedido(p_noite date)
returns setof public.pedidos_musica
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select f.id into v_id from fila_da_noite(p_noite) f limit 1;
  if v_id is null then
    return;
  end if;
  return query
    update pedidos_musica
    set status = 'enviado', enviado_em = now()
    where pedidos_musica.id = v_id and pedidos_musica.status = 'esperando'
    returning pedidos_musica.*;
end;
$$;

-- Desfaz a reserva quando o Spotify recusou o envio
create or replace function public.devolver_pedido(p_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update pedidos_musica
  set status = 'esperando', enviado_em = null
  where id = p_id and status = 'enviado';
$$;

-- ---------- Permissões ----------
revoke all on function public.pode_ser_dj(uuid) from public, anon;
revoke all on function public.fila_da_noite(date) from public, anon;
revoke all on function public.pedir_musica(text, text, text, text, int) from public, anon;
revoke all on function public.cancelar_pedido(uuid) from public, anon;
revoke all on function public.ligar_modo_dj(boolean) from public, anon;
revoke all on function public.desligar_modo_dj() from public, anon;
revoke all on function public.minha_conexao_dj() from public, anon;
revoke all on function public.desconectar_spotify() from public, anon;
grant execute on function public.pode_ser_dj(uuid) to authenticated;
grant execute on function public.fila_da_noite(date) to authenticated;
grant execute on function public.pedir_musica(text, text, text, text, int) to authenticated;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
grant execute on function public.ligar_modo_dj(boolean) to authenticated;
grant execute on function public.desligar_modo_dj() to authenticated;
grant execute on function public.minha_conexao_dj() to authenticated;
grant execute on function public.desconectar_spotify() to authenticated;
-- O loop roda com a service role; aluno nenhum reserva nem devolve pedido
revoke all on function public.reservar_proximo_pedido(date) from public, anon, authenticated;
revoke all on function public.devolver_pedido(uuid) from public, anon, authenticated;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/sql/pedidosMusica.test.ts`
Expected: PASS, todos os testes (6 da Task 1 + os novos).

Também conferir que a migração roda duas vezes seguidas sem erro (exigência "pode rodar mais de uma vez"). Acrescentar este teste e rodar de novo:

```ts
describe('migração', () => {
  it('pode rodar mais de uma vez', async () => {
    const db = await bancoComMigracao()
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(
      new URL('../../supabase/migracoes/029-pedidos-de-musica.sql', import.meta.url),
      'utf8',
    )
    await expect(db.exec(sql)).resolves.toBeDefined()
  })
})
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migracoes/029-pedidos-de-musica.sql tests/sql/pedidosMusica.test.ts
git commit -m "Pedidos de musica: regras de pedir, cancelar e ligar o Modo DJ

Toda regra mora no banco, nao so na tela: pedir exige DJ ligado e
check-in na noite da sessao (nao anulado), URI de faixa do Spotify e
musica ainda nao pedida na noite. Cancelar: dono, DJ ou organizador.
Ligar com outro DJ ativo avisa quem e, e so assume se pedir.
reservar_proximo_pedido marca como enviado antes do envio, para duas
passadas simultaneas do loop nunca mandarem o mesmo pedido."
```

---

### Task 3: Lógica pura do loop e dos dados do Spotify

**Files:**
- Create: `supabase/functions/_shared/djPuro.ts`
- Create: `tests/dj/djPuro.test.ts`

**Interfaces:**
- Produces (importável pelas Edge Functions como `../_shared/djPuro.ts` e pelo app como `../../supabase/functions/_shared/djPuro`):

```ts
export interface FaixaApi { uri: string; titulo: string; artista: string; capa_url: string | null; duracao_ms: number }
export function faixaDaApi(t: unknown): FaixaApi | null
export interface EstadoPlayer { tocando: FaixaApi; filaUris: string[] }
export function estadoDoPlayer(resposta: unknown): EstadoPlayer | null
export interface TokenGuardado { access_token: string; refresh_token: string; expira_em: string }
export function mesclarToken(antigo: TokenGuardado | null, resposta: { access_token: string; refresh_token?: string; expires_in: number }, agora: Date): TokenGuardado
export function precisaRenovar(expiraEm: string, agora: Date): boolean
export function fimDaNoite(noite: string): Date
export type AcaoLoop =
  | { tipo: 'fechar'; motivo: 'virada' | 'conexao_perdida' }
  | { tipo: 'sem_aparelho' }
  | { tipo: 'passada'; marcarTocou: string | null; enviar: boolean }
export function decidirPassada(e: { agora: Date; noite: string; temConexao: boolean; player: EstadoPlayer | null; enviadoPendente: { id: string; trackUri: string } | null; temProximo: boolean }): AcaoLoop
```

- [ ] **Step 1: Escrever os testes (vão falhar)**

Criar `tests/dj/djPuro.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  decidirPassada,
  estadoDoPlayer,
  faixaDaApi,
  fimDaNoite,
  mesclarToken,
  precisaRenovar,
  type EstadoPlayer,
} from '../../supabase/functions/_shared/djPuro'

const faixa = (uri: string) => ({
  uri,
  name: `Música ${uri}`,
  duration_ms: 180000,
  artists: [{ name: 'Dominguinhos' }, { name: 'Gil' }],
  album: { images: [{ url: 'https://capa/1.jpg' }] },
})

describe('faixaDaApi', () => {
  it('converte uma faixa do Spotify', () => {
    expect(faixaDaApi(faixa('spotify:track:x'))).toEqual({
      uri: 'spotify:track:x',
      titulo: 'Música spotify:track:x',
      artista: 'Dominguinhos, Gil',
      capa_url: 'https://capa/1.jpg',
      duracao_ms: 180000,
    })
  })

  it('faixa sem capa não quebra', () => {
    const f = faixaDaApi({ ...faixa('spotify:track:x'), album: { images: [] } })
    expect(f?.capa_url).toBeNull()
  })

  it('episódio de podcast vira item com o nome do programa', () => {
    const f = faixaDaApi({
      uri: 'spotify:episode:e1',
      name: 'Episódio 1',
      duration_ms: 1000,
      show: { name: 'Um podcast' },
      images: [{ url: 'https://capa/e.jpg' }],
    })
    expect(f).toMatchObject({ artista: 'Um podcast', capa_url: 'https://capa/e.jpg' })
  })

  it('sem uri ou sem nome devolve null', () => {
    expect(faixaDaApi(null)).toBeNull()
    expect(faixaDaApi({ name: 'x' })).toBeNull()
    expect(faixaDaApi({ uri: 'spotify:track:x' })).toBeNull()
  })
})

describe('estadoDoPlayer', () => {
  it('sem resposta (204) ou sem música tocando = nenhum aparelho', () => {
    expect(estadoDoPlayer(null)).toBeNull()
    expect(estadoDoPlayer({ currently_playing: null, queue: [] })).toBeNull()
  })

  it('lê o que está tocando e as uris da fila, pulando itens quebrados', () => {
    const e = estadoDoPlayer({
      currently_playing: faixa('spotify:track:agora'),
      queue: [faixa('spotify:track:q1'), { lixo: true }, faixa('spotify:track:q2')],
    })
    expect(e?.tocando.uri).toBe('spotify:track:agora')
    expect(e?.filaUris).toEqual(['spotify:track:q1', 'spotify:track:q2'])
  })
})

describe('tokens', () => {
  const agora = new Date('2026-10-12T22:00:00Z')

  it('guarda a expiração a partir de expires_in', () => {
    const t = mesclarToken(null, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }, agora)
    expect(t).toEqual({ access_token: 'a', refresh_token: 'r', expira_em: '2026-10-12T23:00:00.000Z' })
  })

  it('renovação sem refresh_token novo mantém o antigo', () => {
    const antigo = { access_token: 'a', refresh_token: 'r-velho', expira_em: '2026-10-12T22:00:00.000Z' }
    const t = mesclarToken(antigo, { access_token: 'b', expires_in: 3600 }, agora)
    expect(t.refresh_token).toBe('r-velho')
    expect(t.access_token).toBe('b')
  })

  it('sem refresh_token nenhum é erro', () => {
    expect(() => mesclarToken(null, { access_token: 'a', expires_in: 3600 }, agora)).toThrow()
  })

  it('renova quando falta menos de 1 minuto', () => {
    expect(precisaRenovar('2026-10-12T22:00:59.000Z', agora)).toBe(true)
    expect(precisaRenovar('2026-10-12T22:01:01.000Z', agora)).toBe(false)
    expect(precisaRenovar('2026-10-12T21:00:00.000Z', agora)).toBe(true)
  })
})

describe('fimDaNoite', () => {
  it('é 5h do dia seguinte em São Paulo (8h UTC)', () => {
    expect(fimDaNoite('2026-10-12').toISOString()).toBe('2026-10-13T08:00:00.000Z')
    // virada de mês
    expect(fimDaNoite('2026-10-31').toISOString()).toBe('2026-11-01T08:00:00.000Z')
  })
})

describe('decidirPassada', () => {
  const NOITE = '2026-10-12'
  const agora = new Date('2026-10-13T00:30:00Z') // 21h30 em SP
  const player = (tocando: string, fila: string[] = []): EstadoPlayer => ({
    tocando: faixaDaApi(faixa(tocando))!,
    filaUris: fila,
  })
  const base = {
    agora,
    noite: NOITE,
    temConexao: true,
    player: player('spotify:track:playlist1'),
    enviadoPendente: null,
    temProximo: true,
  }

  it('depois das 5h fecha por virada, antes de olhar qualquer outra coisa', () => {
    expect(
      decidirPassada({ ...base, agora: new Date('2026-10-13T08:00:00Z'), temConexao: false, player: null }),
    ).toEqual({ tipo: 'fechar', motivo: 'virada' })
  })

  it('sem conexão (desconectou ou revogou) fecha por conexão perdida', () => {
    expect(decidirPassada({ ...base, temConexao: false })).toEqual({
      tipo: 'fechar',
      motivo: 'conexao_perdida',
    })
  })

  it('sem aparelho tocando não manda nada', () => {
    expect(decidirPassada({ ...base, player: null })).toEqual({ tipo: 'sem_aparelho' })
  })

  it('sem pedido nosso pendente e com fila: manda o próximo', () => {
    expect(decidirPassada(base)).toEqual({ tipo: 'passada', marcarTocou: null, enviar: true })
  })

  it('sem pedidos esperando: não manda nada', () => {
    expect(decidirPassada({ ...base, temProximo: false })).toEqual({
      tipo: 'passada',
      marcarTocou: null,
      enviar: false,
    })
  })

  it('nosso pedido ainda na fila do Spotify: espera', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:playlist1', ['spotify:track:nosso', 'spotify:track:playlist2']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: null, enviar: false })
  })

  it('nosso pedido tocando: marca tocou e manda o próximo', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:nosso', ['spotify:track:playlist2']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: 'p1', enviar: true })
  })

  it('nosso pedido sumiu (pulado no Spotify): não conta, e manda o próximo', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:playlist3', ['spotify:track:playlist4']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: null, enviar: true })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/dj/djPuro.test.ts`
Expected: FAIL com "Failed to resolve import ../../supabase/functions/_shared/djPuro".

- [ ] **Step 3: Implementar**

Criar `supabase/functions/_shared/djPuro.ts`:

```ts
// Lógica pura do Modo DJ: sem Deno, sem rede, sem banco.
//
// Importada pelas Edge Functions (`../_shared/djPuro.ts`), pelo modo
// demonstração do app (que simula o Spotify com a MESMA decisão do
// loop) e pelos testes (tests/dj/djPuro.test.ts). Por isso não pode
// importar nada: um import aqui teria de funcionar no Deno e no Vite.

/** Uma faixa como o app guarda e mostra. */
export interface FaixaApi {
  uri: string
  titulo: string
  artista: string
  capa_url: string | null
  duracao_ms: number
}

interface ItemSpotify {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: Array<{ name?: string }>
  album?: { images?: Array<{ url?: string }> }
  // Episódio de podcast (pode aparecer na fila do professor)
  show?: { name?: string }
  images?: Array<{ url?: string }>
}

/**
 * Converte um item da Web API. Devolve null para o que não dá para
 * mostrar (sem uri ou sem nome) em vez de quebrar: a fila do Spotify do
 * professor pode ter qualquer coisa, inclusive episódio de podcast.
 */
export function faixaDaApi(t: unknown): FaixaApi | null {
  const f = t as ItemSpotify | null
  if (!f?.uri || !f.name) return null
  const artistas = (f.artists ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ')
  return {
    uri: f.uri,
    titulo: f.name,
    artista: artistas || f.show?.name || '',
    capa_url: f.album?.images?.[0]?.url ?? f.images?.[0]?.url ?? null,
    duracao_ms: f.duration_ms ?? 0,
  }
}

/** O que o loop precisa saber do player do professor. */
export interface EstadoPlayer {
  tocando: FaixaApi
  filaUris: string[]
}

/**
 * Lê a resposta de GET /me/player/queue. null = nenhum aparelho tocando:
 * o Spotify responde 204 (corpo vazio) ou `currently_playing: null`.
 */
export function estadoDoPlayer(resposta: unknown): EstadoPlayer | null {
  const r = resposta as { currently_playing?: unknown; queue?: unknown[] } | null
  const tocando = faixaDaApi(r?.currently_playing ?? null)
  if (!tocando) return null
  const filaUris = (r?.queue ?? [])
    .map((q) => faixaDaApi(q)?.uri)
    .filter((u): u is string => Boolean(u))
  return { tocando, filaUris }
}

export interface TokenGuardado {
  access_token: string
  refresh_token: string
  expira_em: string
}

/**
 * Junta a resposta do /api/token com o que já estava guardado. Na
 * renovação o Spotify às vezes NÃO manda refresh_token novo — aí o
 * antigo continua valendo e não pode ser apagado.
 */
export function mesclarToken(
  antigo: TokenGuardado | null,
  resposta: { access_token: string; refresh_token?: string; expires_in: number },
  agora: Date,
): TokenGuardado {
  const refresh = resposta.refresh_token ?? antigo?.refresh_token
  if (!refresh) throw new Error('O Spotify não devolveu refresh_token')
  return {
    access_token: resposta.access_token,
    refresh_token: refresh,
    expira_em: new Date(agora.getTime() + resposta.expires_in * 1000).toISOString(),
  }
}

/** Renova com folga de 1 minuto, para a chave não vencer no meio da passada. */
export function precisaRenovar(expiraEm: string, agora: Date): boolean {
  return new Date(expiraEm).getTime() - agora.getTime() < 60_000
}

/**
 * Quando acaba a noite `noite` (YYYY-MM-DD): 5h do dia seguinte em São
 * Paulo. UTC−3 fixo — o Brasil não tem horário de verão desde 2019. É a
 * mesma virada de `noite_do_checkin` no banco e de `diaDaNoite` no app.
 */
export function fimDaNoite(noite: string): Date {
  const [a, m, d] = noite.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + 1, 5 + 3))
}

export type AcaoLoop =
  | { tipo: 'fechar'; motivo: 'virada' | 'conexao_perdida' }
  | { tipo: 'sem_aparelho' }
  | { tipo: 'passada'; marcarTocou: string | null; enviar: boolean }

/**
 * O que fazer nesta passada do loop.
 *
 * A fila do Spotify nunca tem mais de UM pedido nosso esperando: só se
 * manda o próximo quando o último enviado já começou a tocar (ou sumiu,
 * pulado no Spotify). É isso que mantém a ordem justa do nosso lado —
 * a API do Spotify só deixa acrescentar, nunca reordenar.
 *
 * `enviadoPendente` é o pedido `enviado` mais recente da noite.
 */
export function decidirPassada(e: {
  agora: Date
  noite: string
  temConexao: boolean
  player: EstadoPlayer | null
  enviadoPendente: { id: string; trackUri: string } | null
  temProximo: boolean
}): AcaoLoop {
  if (e.agora.getTime() >= fimDaNoite(e.noite).getTime()) {
    return { tipo: 'fechar', motivo: 'virada' }
  }
  if (!e.temConexao) return { tipo: 'fechar', motivo: 'conexao_perdida' }
  if (!e.player) return { tipo: 'sem_aparelho' }

  const p = e.enviadoPendente
  const tocando = p !== null && e.player.tocando.uri === p.trackUri
  const aindaNaFila =
    p !== null && !tocando && e.player.filaUris.includes(p.trackUri)
  return {
    tipo: 'passada',
    marcarTocou: tocando && p ? p.id : null,
    enviar: !aindaNaFila && e.temProximo,
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/dj/djPuro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/djPuro.ts tests/dj/djPuro.test.ts
git commit -m "Modo DJ: decisao do loop e leitura do Spotify como funcoes puras

O que o loop faz a cada minuto vira uma funcao sem rede: virada das 5h,
conexao perdida, sem aparelho, pedido ainda na fila (espera), tocando
(conta e manda o proximo) ou pulado (nao conta e manda o proximo). Fica
num modulo sem imports, usado pelas Edge Functions, pelo demo e pelos
testes. Faixa sem capa, episodio de podcast e renovacao sem
refresh_token novo nao quebram nada."
```

---

### Task 4: Edge Functions de busca e de conexão

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/spotify.ts`
- Create: `supabase/functions/spotify-buscar/index.ts`
- Create: `supabase/functions/spotify-conectar/index.ts`

**Interfaces:**
- Consumes: `faixaDaApi`, `mesclarToken`, `FaixaApi` (Task 3); `pode_ser_dj` e `dj_conexoes` (Tasks 1–2).
- Produces:
  - `_shared/http.ts`: `cors`, `json(corpo, status?)`
  - `_shared/spotify.ts`: `class ErroSpotify { status: number }`, `pedirToken(params) → Promise<{ access_token; refresh_token?; expires_in }>`, `chamarSpotify(token, caminho, init?) → Promise<unknown>` (null quando o corpo é vazio ou não é JSON)
  - `spotify-buscar`: POST `{ q }` (com JWT do usuário) → `{ faixas: FaixaApi[] }` ou `{ erro }`
  - `spotify-conectar`: POST `{ code, redirect_uri }` (com JWT) → `{ resultado: 'ok' | 'sem_premium' | 'nao_liberado' }` ou `{ erro }`

Estas funções rodam em Deno e não têm teste automatizado neste repositório: o que dá para testar sem rede já está em `djPuro.ts` (Task 3). A verificação delas é a da Task 13, depois de publicadas.

- [ ] **Step 1: Escrever `_shared/http.ts`**

```ts
// CORS e resposta JSON das funções chamadas pelo app (o navegador manda
// um OPTIONS antes do POST, e sem estes cabeçalhos a chamada morre ali).
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Escrever `_shared/spotify.ts`**

```ts
// Chamadas HTTP ao Spotify. O Client Secret só existe aqui, lido dos
// segredos das funções (supabase secrets) — nunca no app.

export class ErroSpotify extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

function credenciais(): string {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID')
  const segredo = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !segredo) throw new Error('Faltam SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET nos segredos')
  return 'Basic ' + btoa(`${id}:${segredo}`)
}

/** POST /api/token (código, renovação ou chave do próprio app). */
export async function pedirToken(
  params: Record<string, string>,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: credenciais(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new ErroSpotify(r.status, corpo.error_description ?? corpo.error ?? 'token recusado')
  }
  return corpo
}

/**
 * Chama a Web API. Devolve o JSON, ou null quando a resposta é vazia
 * (204) ou não é JSON — o "adicionar à fila" responde com um código em
 * texto, e foi isso que quebrou a primeira versão do teste de
 * viabilidade.
 */
export async function chamarSpotify(
  token: string,
  caminho: string,
  init: RequestInit = {},
): Promise<unknown> {
  const r = await fetch(`https://api.spotify.com/v1${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })
  const texto = await r.text()
  if (!r.ok) {
    let mensagem = texto
    try {
      mensagem = JSON.parse(texto)?.error?.message ?? texto
    } catch {
      // corpo em texto puro: fica como veio
    }
    throw new ErroSpotify(r.status, mensagem)
  }
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Escrever `spotify-buscar/index.ts`**

```ts
// Edge Function: busca músicas no Spotify para o aluno pedir.
//
// Usa a chave do PRÓPRIO APP (client credentials), não a de um
// professor: não ocupa vaga nos 5 usuários do modo de desenvolvimento,
// e o aluno não precisa logar no Spotify.
//
// Publicar: npx supabase functions deploy spotify-buscar

import { createClient } from 'npm:@supabase/supabase-js@2'
import { faixaDaApi, type FaixaApi } from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, pedirToken } from '../_shared/spotify.ts'

// A chave do app dura 1 hora; guardada enquanto a instância viver
let chaveDoApp: { token: string; ate: number } | null = null

async function tokenDoApp(): Promise<string> {
  if (chaveDoApp && chaveDoApp.ate > Date.now() + 60_000) return chaveDoApp.token
  const r = await pedirToken({ grant_type: 'client_credentials' })
  chaveDoApp = { token: r.access_token, ate: Date.now() + r.expires_in * 1000 }
  return r.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Só quem está logado no app: sem isso a função vira um proxy aberto
  // de busca do Spotify, pago pela cota do projeto
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data } = await admin.auth.getUser(jwt)
  if (!data.user) return json({ erro: 'Entre no app para buscar músicas' }, 401)

  const { q } = await req.json().catch(() => ({ q: '' }))
  const termo = String(q ?? '').trim().slice(0, 100)
  if (termo.length < 2) return json({ faixas: [] })

  try {
    const r = (await chamarSpotify(
      await tokenDoApp(),
      '/search?' + new URLSearchParams({ q: termo, type: 'track', market: 'BR', limit: '10' }),
    )) as { tracks?: { items?: unknown[] } } | null
    const faixas = (r?.tracks?.items ?? [])
      .map(faixaDaApi)
      .filter((f): f is FaixaApi => f !== null)
    return json({ faixas })
  } catch (e) {
    console.error('[spotify-buscar]', e)
    return json({ erro: 'A busca do Spotify falhou. Tente de novo.' }, 502)
  }
})
```

- [ ] **Step 4: Escrever `spotify-conectar/index.ts`**

```ts
// Edge Function: conecta o Spotify de um professor (OAuth).
//
// O app manda o `code` que o Spotify devolveu em /spotify/conectado; a
// troca pelo par de chaves usa o Client Secret e por isso acontece
// aqui, nunca no celular. As chaves vão para `dj_conexoes`, que nenhum
// usuário consegue ler (migração 029).
//
// Publicar: npx supabase functions deploy spotify-conectar

import { createClient } from 'npm:@supabase/supabase-js@2'
import { mesclarToken } from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, ErroSpotify, pedirToken } from '../_shared/spotify.ts'

// Os mesmos cadastrados no painel do Spotify. Qualquer outro é recusado
// antes de chegar ao Spotify (ele recusaria também, mas com erro feio).
const REDIRECTS = [
  'https://forro-de-segunda.vercel.app/spotify/conectado',
  'http://127.0.0.1:5173/spotify/conectado',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: u } = await admin.auth.getUser(jwt)
  const user = u.user
  if (!user) return json({ erro: 'Entre no app antes de conectar o Spotify' }, 401)

  const { code, redirect_uri } = await req.json().catch(() => ({}))
  if (typeof code !== 'string' || !REDIRECTS.includes(redirect_uri)) {
    return json({ erro: 'Pedido de conexão inválido' }, 400)
  }

  const { data: pode } = await admin.rpc('pode_ser_dj', { p_uid: user.id })
  if (!pode) return json({ erro: 'Só professores podem ser DJ' }, 403)

  try {
    const tokens = mesclarToken(
      null,
      await pedirToken({ grant_type: 'authorization_code', code, redirect_uri }),
      new Date(),
    )

    let eu: { id: string; display_name?: string | null; product?: string }
    try {
      eu = (await chamarSpotify(tokens.access_token, '/me')) as typeof eu
    } catch (e) {
      // No modo de desenvolvimento, conta fora da lista do painel
      // (User Management) recebe 403 aqui
      if (e instanceof ErroSpotify && e.status === 403) {
        return json({ resultado: 'nao_liberado' })
      }
      throw e
    }

    const { error } = await admin.from('dj_conexoes').upsert({
      user_id: user.id,
      spotify_id: eu.id,
      spotify_nome: eu.display_name ?? null,
      plano: eu.product ?? null,
      ...tokens,
      conectado_em: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)

    return json({ resultado: eu.product === 'premium' ? 'ok' : 'sem_premium' })
  } catch (e) {
    console.error('[spotify-conectar]', e)
    return json({ erro: 'Não deu para conectar ao Spotify. Tente de novo.' }, 502)
  }
})
```

- [ ] **Step 5: Conferir que o app não foi afetado**

Run: `npm test && npx tsc -p tsconfig.json --noEmit`
Expected: testes passam; `tsc` sem erros (as funções em Deno ficam fora do `tsconfig` do app, que só inclui `src`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/_shared/spotify.ts supabase/functions/spotify-buscar supabase/functions/spotify-conectar
git commit -m "Edge Functions de busca e de conexao do Spotify

spotify-buscar usa a chave do proprio app (client credentials): nao
ocupa vaga nos 5 usuarios do modo de desenvolvimento e o aluno nao loga
no Spotify. Exige estar logado no app para nao virar proxy aberto.
spotify-conectar troca o codigo OAuth pelas chaves com o Client Secret,
so no servidor, e distingue conta nao liberada no painel (403 em /me)
de conta sem Premium."
```

---

### Task 5: Edge Function do loop

**Files:**
- Create: `supabase/functions/dj-loop/index.ts`

**Interfaces:**
- Consumes:
  - `decidirPassada`, `estadoDoPlayer`, `mesclarToken`, `precisaRenovar`, `EstadoPlayer` (Task 3);
  - `chamarSpotify`, `ErroSpotify`, `pedirToken`, `cors`, `json` (Task 4);
  - SQL: `fila_da_noite`, `reservar_proximo_pedido`, `devolver_pedido` (Tasks 1–2).
- Produces: POST `dj-loop`
  - aceita a service role (cron) ou o JWT do DJ da sessão aberta (app);
  - responde `{ feito: 'sem_sessao' | 'virada' | 'conexao_perdida' | 'sem_aparelho' | 'sem_premium' | 'esperar' | 'passada', acao? }`.

- [ ] **Step 1: Escrever `dj-loop/index.ts`**

```ts
// Edge Function: o loop do Modo DJ.
//
// O pg_cron chama a cada minuto, mas SÓ quando há sessão aberta (ver o
// agendamento no topo da migração 029); o app chama uma vez quando o
// professor liga o Modo DJ, para o primeiro pedido não esperar o
// minuto virar. Cada passada faz uma leitura do player do professor e,
// no máximo, um envio. O que decidir mora em `_shared/djPuro.ts`.
//
// Publicar: npx supabase functions deploy dj-loop

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  decidirPassada,
  estadoDoPlayer,
  mesclarToken,
  precisaRenovar,
  type EstadoPlayer,
} from '../_shared/djPuro.ts'
import { cors, json } from '../_shared/http.ts'
import { chamarSpotify, ErroSpotify, pedirToken } from '../_shared/spotify.ts'

interface Conexao {
  user_id: string
  access_token: string
  refresh_token: string
  expira_em: string
}

/** Renova a chave e grava. null = o professor revogou o acesso. */
async function renovar(admin: SupabaseClient, c: Conexao): Promise<string | null> {
  try {
    const novo = mesclarToken(
      c,
      await pedirToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token }),
      new Date(),
    )
    await admin.from('dj_conexoes').update(novo).eq('user_id', c.user_id)
    Object.assign(c, novo)
    return novo.access_token
  } catch (e) {
    // 400 invalid_grant: o professor tirou o acesso do app no Spotify
    if (e instanceof ErroSpotify && e.status === 400) return null
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, service)

  const { data: sessao } = await admin
    .from('dj_sessoes')
    .select('id, dj_user_id, noite')
    .is('fechada_em', null)
    .maybeSingle()
  if (!sessao) return json({ feito: 'sem_sessao' })

  // Cron (service role) ou o próprio DJ da noite, pelo app
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${service}`) {
    const { data } = await admin.auth.getUser(auth.replace(/^Bearer /, ''))
    if (data.user?.id !== sessao.dj_user_id) {
      return json({ erro: 'Só o DJ da noite pode fazer isso' }, 403)
    }
  }

  const agoraIso = () => new Date().toISOString()
  const atualizarSessao = (campos: Record<string, unknown>) =>
    admin.from('dj_sessoes').update(campos).eq('id', sessao.id)

  try {
    const { data: conexao } = await admin
      .from('dj_conexoes')
      .select('user_id, access_token, refresh_token, expira_em')
      .eq('user_id', sessao.dj_user_id)
      .maybeSingle<Conexao>()

    let token: string | null = null
    if (conexao) {
      token = precisaRenovar(conexao.expira_em, new Date())
        ? await renovar(admin, conexao)
        : conexao.access_token
    }

    let player: EstadoPlayer | null = null
    if (token && conexao) {
      try {
        player = estadoDoPlayer(await chamarSpotify(token, '/me/player/queue'))
      } catch (e) {
        // 401: a chave venceu antes da hora. Renova e tenta UMA vez.
        if (!(e instanceof ErroSpotify) || e.status !== 401) throw e
        token = await renovar(admin, conexao)
        if (token) player = estadoDoPlayer(await chamarSpotify(token, '/me/player/queue'))
      }
    }

    const { data: pendente } = await admin
      .from('pedidos_musica')
      .select('id, track_uri')
      .eq('noite', sessao.noite)
      .eq('status', 'enviado')
      .order('enviado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data: proximos } = await admin
      .rpc('fila_da_noite', { p_noite: sessao.noite })
      .limit(1)

    const acao = decidirPassada({
      agora: new Date(),
      noite: sessao.noite,
      temConexao: token !== null,
      player,
      enviadoPendente: pendente ? { id: pendente.id, trackUri: pendente.track_uri } : null,
      temProximo: (proximos ?? []).length > 0,
    })

    if (acao.tipo === 'fechar') {
      await atualizarSessao({ fechada_em: agoraIso(), motivo_fechamento: acao.motivo })
      return json({ feito: acao.motivo })
    }
    if (acao.tipo === 'sem_aparelho' || !player || !token) {
      await atualizarSessao({ aviso: 'sem_aparelho', atualizado_em: agoraIso() })
      return json({ feito: 'sem_aparelho' })
    }

    if (acao.marcarTocou) {
      await admin
        .from('pedidos_musica')
        .update({ status: 'tocou', tocou_em: agoraIso() })
        .eq('id', acao.marcarTocou)
        .eq('status', 'enviado')
    }

    // "Tocando agora" que o aluno vê vem daqui, nunca do Spotify direto
    const { data: pedidoTocando } = await admin
      .from('pedidos_musica')
      .select('id')
      .eq('noite', sessao.noite)
      .eq('track_uri', player.tocando.uri)
      .in('status', ['enviado', 'tocou'])
      .maybeSingle()
    await atualizarSessao({
      aviso: null,
      tocando_uri: player.tocando.uri,
      tocando_titulo: player.tocando.titulo,
      tocando_artista: player.tocando.artista,
      tocando_capa: player.tocando.capa_url,
      tocando_pedido_id: pedidoTocando?.id ?? null,
      atualizado_em: agoraIso(),
    })

    if (acao.enviar) {
      const { data: reservados } = await admin.rpc('reservar_proximo_pedido', {
        p_noite: sessao.noite,
      })
      const pedido = (reservados ?? [])[0] as { id: string; track_uri: string } | undefined
      if (pedido) {
        try {
          await chamarSpotify(
            token,
            '/me/player/queue?' + new URLSearchParams({ uri: pedido.track_uri }),
            { method: 'POST' },
          )
        } catch (e) {
          // O Spotify recusou: o pedido volta para o lugar dele na fila
          await admin.rpc('devolver_pedido', { p_id: pedido.id })
          throw e
        }
      }
    }
    return json({ feito: 'passada', acao })
  } catch (e) {
    if (e instanceof ErroSpotify && e.status === 403) {
      await atualizarSessao({ aviso: 'sem_premium', atualizado_em: agoraIso() })
      return json({ feito: 'sem_premium' })
    }
    if (e instanceof ErroSpotify && e.status === 404) {
      await atualizarSessao({ aviso: 'sem_aparelho', atualizado_em: agoraIso() })
      return json({ feito: 'sem_aparelho' })
    }
    if (e instanceof ErroSpotify && e.status === 429) {
      // O Spotify pediu calma: o próximo minuto tenta de novo
      return json({ feito: 'esperar' })
    }
    console.error('[dj-loop]', e)
    return json({ erro: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Conferir**

Run: `npm test && npx tsc -p tsconfig.json --noEmit`
Expected: tudo passa (a função é verificada de ponta a ponta na Task 13).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/dj-loop
git commit -m "Edge Function do loop do Modo DJ

Uma leitura do player por passada (/me/player/queue) e no maximo um
envio. Renova a chave antes de vencer e, num 401, renova e tenta uma
vez. Reserva o pedido antes de mandar ao Spotify e devolve se o Spotify
recusar. Grava o que esta tocando na sessao: e dali que o aluno le,
nunca do Spotify. Sem Premium, sem aparelho e 429 viram aviso ou
espera, nao derrubam o loop."
```

---

### Task 6: Ordem do rodízio em TS e utilitários do DJ no app

**Files:**
- Create: `src/lib/filaMusica.ts`
- Create: `src/lib/dj.ts`
- Modify: `src/lib/types.ts` (acrescentar no fim)
- Create: `tests/lib/filaMusica.test.ts`
- Create: `tests/lib/dj.test.ts`

**Interfaces:**
- Produces (types.ts):

```ts
export interface FaixaSpotify { uri: string; titulo: string; artista: string; capa_url: string | null; duracao_ms: number }
export type StatusPedido = 'esperando' | 'enviado' | 'tocou' | 'cancelado'
export interface PedidoMusica extends FaixaSpotify { id: string; noite: string; user_id: string; nome: string; avatar_url: string | null; pedido_em: string; status: StatusPedido }
export interface PedidoNaFila extends PedidoMusica { rodada: number; posicao: number }
export interface SessaoDJ { id: string; dj_user_id: string; dj_nome: string; noite: string; aberta_em: string; aviso: 'sem_aparelho' | 'sem_premium' | null; tocando: { titulo: string; artista: string; capa_url: string | null; pedido_id: string | null; pedido_por: string | null } | null; atualizado_em: string | null }
export interface ConexaoDJ { conectado: boolean; spotify_nome: string | null; plano: string | null }
export type ResultadoConexao = 'ok' | 'sem_premium' | 'nao_liberado'
export type ResultadoLigarDJ = { tipo: 'ligado' } | { tipo: 'ocupado'; dj_nome: string }
```

- Produces (filaMusica.ts): `ordenarFila<T extends { id: string; user_id: string; pedido_em: string; status: StatusPedido }>(pedidos: T[]): Array<T & { rodada: number; posicao: number }>`. Recebe pedidos de UMA noite, em qualquer status, e devolve só os `esperando`, ordenados.
- Produces (dj.ts):
  - `SPOTIFY_CLIENT_ID`, `CARGOS_DJ`, `ESCOPOS_SPOTIFY`, `CHAVE_STATE_SPOTIFY`;
  - `podeSerDJ(cargos: readonly string[], papel: Papel): boolean`;
  - `redirectSpotify(origem: string): string`;
  - `urlAutorizacaoSpotify(redirectUri: string, state: string): string`;
  - `novoStateSpotify(): string`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Criar `tests/lib/filaMusica.test.ts`. São os mesmos exemplos da Task 1, para o demo não divergir do banco:

```ts
import { describe, expect, it } from 'vitest'
import { ordenarFila } from '../../src/lib/filaMusica'
import type { StatusPedido } from '../../src/lib/types'

const as = (hhmm: string) => `2026-10-13T${hhmm}:00.000Z`
let n = 0
const p = (user_id: string, uri: string, hora: string, status: StatusPedido = 'esperando') => ({
  id: `id-${String(++n).padStart(3, '0')}`,
  user_id,
  uri,
  pedido_em: as(hora),
  status,
})
const uris = (l: { uri: string }[]) => l.map((x) => x.uri)

describe('ordenarFila (mesma regra de fila_da_noite)', () => {
  it('quem chega com 1 passa na frente da 2ª de quem pediu 20', () => {
    const lista = [p('A', 'a1', '00:00', 'tocou')]
    for (let i = 2; i <= 20; i++) lista.push(p('A', `a${i}`, `00:${String(i).padStart(2, '0')}`))
    lista.push(p('B', 'b1', '00:30'))
    const f = ordenarFila(lista)
    expect(uris(f).slice(0, 3)).toEqual(['b1', 'a2', 'a3'])
    expect(f[0]).toMatchObject({ rodada: 1, posicao: 1 })
    expect(f[1]).toMatchObject({ rodada: 2, posicao: 2 })
  })

  it('quem chega depois de A tocar 15 entra na frente da 16ª', () => {
    const lista = []
    for (let i = 1; i <= 15; i++) lista.push(p('A', `a${i}`, `00:${String(i).padStart(2, '0')}`, 'tocou'))
    lista.push(p('A', 'a16', '00:16'), p('C', 'c1', '02:00'))
    expect(uris(ordenarFila(lista))).toEqual(['c1', 'a16'])
  })

  it('mesma rodada: quem fez o primeiro pedido antes', () => {
    expect(uris(ordenarFila([p('B', 'b1', '00:00'), p('A', 'a1', '00:05'), p('B', 'b2', '00:10')]))).toEqual([
      'b1',
      'a1',
      'b2',
    ])
  })

  it('cancelado sai da conta da rodada e da chegada', () => {
    const f = ordenarFila([
      p('A', 'a1', '00:00', 'cancelado'),
      p('A', 'a2', '00:01'),
      p('B', 'b1', '00:02'),
      p('B', 'b2', '00:03'),
    ])
    expect(f.map((x) => [x.uri, x.rodada, x.posicao])).toEqual([
      ['a2', 1, 1],
      ['b1', 1, 2],
      ['b2', 2, 3],
    ])
  })

  it('quem já tocou 1 e pede outra mais tarde entra na rodada 2', () => {
    const f = ordenarFila([
      p('A', 'a1', '00:00', 'tocou'),
      p('A', 'a2', '00:01', 'enviado'),
      p('A', 'a3', '00:02'),
      p('B', 'b1', '00:03', 'tocou'),
      p('B', 'b2', '02:00'),
    ])
    expect(f.map((x) => [x.uri, x.rodada])).toEqual([
      ['b2', 2],
      ['a3', 3],
    ])
  })

  it('não altera a lista recebida', () => {
    const lista = [p('B', 'b1', '00:05'), p('A', 'a1', '00:00')]
    const copia = JSON.stringify(lista)
    ordenarFila(lista)
    expect(JSON.stringify(lista)).toBe(copia)
  })
})
```

Criar `tests/lib/dj.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ESCOPOS_SPOTIFY,
  novoStateSpotify,
  podeSerDJ,
  redirectSpotify,
  SPOTIFY_CLIENT_ID,
  urlAutorizacaoSpotify,
} from '../../src/lib/dj'

describe('podeSerDJ', () => {
  it('professor, diretor de ensino e organizador podem', () => {
    expect(podeSerDJ(['Professor(a)'], 'aluno')).toBe(true)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de Ensino'], 'aluno')).toBe(true)
    expect(podeSerDJ([], 'organizador')).toBe(true)
  })

  it('aluno, monitor e outros cargos não', () => {
    expect(podeSerDJ([], 'aluno')).toBe(false)
    expect(podeSerDJ(['Monitor(a)', 'Diretor(a) de RH'], 'aluno')).toBe(false)
  })
})

describe('autorização do Spotify', () => {
  it('monta o endereço de volta a partir da origem', () => {
    expect(redirectSpotify('https://forro-de-segunda.vercel.app')).toBe(
      'https://forro-de-segunda.vercel.app/spotify/conectado',
    )
  })

  it('a URL leva client_id, code, redirect, escopos e state', () => {
    const url = new URL(urlAutorizacaoSpotify('http://127.0.0.1:5173/spotify/conectado', 'abc'))
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('client_id')).toBe(SPOTIFY_CLIENT_ID)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/spotify/conectado')
    expect(url.searchParams.get('scope')).toBe(ESCOPOS_SPOTIFY)
    expect(url.searchParams.get('state')).toBe('abc')
  })

  it('state é aleatório, com 32 caracteres hexadecimais', () => {
    const a = novoStateSpotify()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(novoStateSpotify()).not.toBe(a)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/lib/filaMusica.test.ts tests/lib/dj.test.ts`
Expected: FAIL com "Failed to resolve import ../../src/lib/filaMusica" (e `dj`).

- [ ] **Step 3: Acrescentar os tipos ao fim de `src/lib/types.ts`**

```ts
// ---- Pedidos de música (Modo DJ, migração 029) ----

/** Uma música como o app guarda e mostra (vem da busca do Spotify). */
export interface FaixaSpotify {
  uri: string
  titulo: string
  artista: string
  capa_url: string | null
  duracao_ms: number
}

export type StatusPedido = 'esperando' | 'enviado' | 'tocou' | 'cancelado'

/** Um pedido da noite, com quem pediu. */
export interface PedidoMusica extends FaixaSpotify {
  id: string
  noite: string
  user_id: string
  nome: string
  avatar_url: string | null
  pedido_em: string
  status: StatusPedido
}

/** Pedido esperando, com o lugar dele no rodízio (1 = o próximo). */
export interface PedidoNaFila extends PedidoMusica {
  rodada: number
  posicao: number
}

/** A sessão de DJ aberta (no máximo uma no projeto). */
export interface SessaoDJ {
  id: string
  dj_user_id: string
  dj_nome: string
  noite: string
  aberta_em: string
  aviso: 'sem_aparelho' | 'sem_premium' | null
  /** O que o loop viu tocando na última passada. */
  tocando: {
    titulo: string
    artista: string
    capa_url: string | null
    pedido_id: string | null
    pedido_por: string | null
  } | null
  atualizado_em: string | null
}

/** A conexão Spotify de quem está logado, sem as chaves. */
export interface ConexaoDJ {
  conectado: boolean
  spotify_nome: string | null
  plano: string | null
}

export type ResultadoConexao = 'ok' | 'sem_premium' | 'nao_liberado'

export type ResultadoLigarDJ =
  | { tipo: 'ligado' }
  | { tipo: 'ocupado'; dj_nome: string }
```

- [ ] **Step 4: Escrever `src/lib/filaMusica.ts`**

```ts
import type { StatusPedido } from './types'

/**
 * A ordem do rodízio, em TS, para o modo demonstração.
 *
 * Em produção quem ordena é o banco (`fila_da_noite`, migração 029).
 * Esta é uma cópia da MESMA regra, testada com os mesmos exemplos
 * (tests/lib/filaMusica.test.ts × tests/sql/pedidosMusica.test.ts):
 *
 *   rodada  = enviados/tocados da pessoa na noite
 *             + posição do pedido entre os que ela tem esperando
 *   chegada = o primeiro pedido da pessoa na noite (sem os cancelados)
 *   ordem   = rodada, chegada, pedido_em, id
 *
 * Recebe os pedidos de UMA noite, em qualquer situação, e devolve só os
 * que estão esperando, já na ordem.
 */
export function ordenarFila<
  T extends { id: string; user_id: string; pedido_em: string; status: StatusPedido },
>(pedidos: T[]): Array<T & { rodada: number; posicao: number }> {
  const porPessoa = new Map<string, { enviados: number; chegada: string; esperando: T[] }>()
  for (const p of pedidos) {
    if (p.status === 'cancelado') continue
    const g = porPessoa.get(p.user_id) ?? { enviados: 0, chegada: p.pedido_em, esperando: [] }
    if (p.pedido_em < g.chegada) g.chegada = p.pedido_em
    if (p.status === 'enviado' || p.status === 'tocou') g.enviados++
    if (p.status === 'esperando') g.esperando.push(p)
    porPessoa.set(p.user_id, g)
  }

  const comRodada: Array<{ pedido: T; rodada: number; chegada: string }> = []
  for (const g of porPessoa.values()) {
    const meus = [...g.esperando].sort(
      (a, b) => a.pedido_em.localeCompare(b.pedido_em) || a.id.localeCompare(b.id),
    )
    meus.forEach((pedido, i) =>
      comRodada.push({ pedido, rodada: g.enviados + i + 1, chegada: g.chegada }),
    )
  }

  comRodada.sort(
    (a, b) =>
      a.rodada - b.rodada ||
      a.chegada.localeCompare(b.chegada) ||
      a.pedido.pedido_em.localeCompare(b.pedido.pedido_em) ||
      a.pedido.id.localeCompare(b.pedido.id),
  )
  return comRodada.map(({ pedido, rodada }, i) => ({ ...pedido, rodada, posicao: i + 1 }))
}
```

- [ ] **Step 5: Escrever `src/lib/dj.ts`**

```ts
import type { Papel } from './types'

/**
 * Peças do Modo DJ que o app usa fora da API: quem pode ser DJ e o
 * endereço de autorização do Spotify.
 *
 * O Client ID não é segredo (ele vai na URL que o navegador abre). O
 * Client Secret, sim, e por isso só existe nas Edge Functions.
 */
export const SPOTIFY_CLIENT_ID = 'b50dd222d8e9498faf4744ed49a799dd'

/** Os mesmos cargos de `pode_ser_dj` no banco (migração 029). */
export const CARGOS_DJ: readonly string[] = ['Professor(a)', 'Diretor(a) de Ensino']

export function podeSerDJ(cargos: readonly string[], papel: Papel): boolean {
  return papel === 'organizador' || cargos.some((c) => CARGOS_DJ.includes(c))
}

export const ESCOPOS_SPOTIFY = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  // Para saber se a conta é Premium e avisar antes da primeira noite
  'user-read-private',
].join(' ')

/** Onde o `state` espera a volta do Spotify (sessionStorage). */
export const CHAVE_STATE_SPOTIFY = 'fds-spotify-state'

/**
 * Endereço de volta. Precisa estar cadastrado no painel do Spotify, e
 * o Spotify não aceita `localhost`: em desenvolvimento, abrir o app em
 * http://127.0.0.1:5173 (npm run dev -- --host 127.0.0.1).
 */
export function redirectSpotify(origem: string): string {
  return `${origem}/spotify/conectado`
}

export function urlAutorizacaoSpotify(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ESCOPOS_SPOTIFY,
    state,
  })
  return `https://accounts.spotify.com/authorize?${p}`
}

/** `state` contra CSRF: a volta do Spotify só vale se trouxer este valor. */
export function novoStateSpotify(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run tests/lib/filaMusica.test.ts tests/lib/dj.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS e `tsc` sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/filaMusica.ts src/lib/dj.ts tests/lib/filaMusica.test.ts tests/lib/dj.test.ts
git commit -m "Modo DJ no app: tipos, ordem do rodizio em TS e quem pode ser DJ

ordenarFila repete a regra de fila_da_noite para o modo demonstracao,
testada com os mesmos exemplos do banco para os dois nao divergirem.
dj.ts concentra quem pode ser DJ (mesmos cargos do banco) e a URL de
autorizacao do Spotify com state contra CSRF."
```

---

### Task 7: Métodos novos do `ForroApi` e a versão Supabase

**Files:**
- Modify: `src/lib/api.ts` (interface `ForroApi`, antes do bloco `// ---- Push (Fase 4) ----`)
- Modify: `src/lib/supabaseApi.ts` (classe `SupabaseApi`, antes do bloco de push)

**Interfaces:**
- Consumes: tipos da Task 6; funções SQL das Tasks 1–2; Edge Functions das Tasks 4–5.
- Produces (em `ForroApi`, usados pelas Tasks 8, 10, 11 e 12):

```ts
minhaConexaoDJ(): Promise<ConexaoDJ>
conectarSpotify(code: string, redirectUri: string): Promise<ResultadoConexao>
desconectarSpotify(): Promise<void>
sessaoDJAberta(): Promise<SessaoDJ | null>
ligarModoDJ(assumir: boolean): Promise<ResultadoLigarDJ>
desligarModoDJ(): Promise<void>
cutucarLoopDJ(): Promise<void>
buscarMusicas(q: string): Promise<FaixaSpotify[]>
pedirMusica(f: FaixaSpotify): Promise<void>
cancelarPedido(id: string): Promise<void>
filaDaNoite(): Promise<PedidoNaFila[]>
pedidosDaNoite(): Promise<PedidoMusica[]>
musicasTocadasDe(userId: string): Promise<number>
```

Nota sobre a spec (§12): ela lista também `meusPedidosDaNoite`. Ele **não** vira método: "Meus pedidos" é `filaDaNoite()` filtrado pelo usuário, que já traz a posição de cada um. Um método a mais só repetiria a consulta.

- [ ] **Step 1: Declarar os métodos na interface**

Em `src/lib/api.ts`:

1. Acrescentar ao import de tipos do topo: `ConexaoDJ`, `FaixaSpotify`, `PedidoMusica`, `PedidoNaFila`, `ResultadoConexao`, `ResultadoLigarDJ` e `SessaoDJ`.
2. Logo antes da linha `  // ---- Push (Fase 4) ----`, inserir:

```ts
  // ---- Modo DJ e pedidos de música (migração 029) ----
  /** Situação da conexão Spotify de quem está logado — sem as chaves. */
  minhaConexaoDJ(): Promise<ConexaoDJ>
  /**
   * Termina a conexão OAuth: troca o `code` que o Spotify devolveu em
   * /spotify/conectado. A troca usa o Client Secret e por isso acontece
   * numa Edge Function.
   */
  conectarSpotify(code: string, redirectUri: string): Promise<ResultadoConexao>
  /** Apaga a conexão (e fecha a sessão de DJ aberta dessa pessoa). */
  desconectarSpotify(): Promise<void>
  /** A sessão de DJ aberta, ou null. No máximo uma no projeto. */
  sessaoDJAberta(): Promise<SessaoDJ | null>
  /** `assumir` = fechar a sessão de outro professor e abrir a minha. */
  ligarModoDJ(assumir: boolean): Promise<ResultadoLigarDJ>
  desligarModoDJ(): Promise<void>
  /** Roda uma passada do loop agora (ao ligar), sem esperar o cron. */
  cutucarLoopDJ(): Promise<void>
  /** Busca no Spotify. Só ao enviar o formulário — nunca a cada tecla. */
  buscarMusicas(q: string): Promise<FaixaSpotify[]>
  pedirMusica(f: FaixaSpotify): Promise<void>
  cancelarPedido(id: string): Promise<void>
  /** Pedidos esperando da noite da sessão aberta, na ordem do rodízio. */
  filaDaNoite(): Promise<PedidoNaFila[]>
  /** Todos os pedidos não cancelados da noite (para o "já pedida hoje"). */
  pedidosDaNoite(): Promise<PedidoMusica[]>
  /** Quantos pedidos dessa pessoa de fato tocaram — o distintivo de DJ. */
  musicasTocadasDe(userId: string): Promise<number>

```

- [ ] **Step 2: Rodar o tsc e confirmar que falha**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: FAIL. `SupabaseApi` e `DemoApi` "incorrectly implements interface 'ForroApi'" (faltam os métodos).

- [ ] **Step 3: Implementar em `SupabaseApi`**

Em `src/lib/supabaseApi.ts`, acrescentar os mesmos 7 tipos ao import de tipos e inserir antes do método de push (`async savePushSubscription`):

```ts
  // ---- Modo DJ e pedidos de música ----

  /**
   * Chama uma Edge Function e traz para a tela a mensagem `{ erro }` que
   * ela devolveu — sem isso o aluno veria "Edge Function returned a
   * non-2xx status code".
   */
  private async invocar<T>(nome: string, corpo: unknown): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(nome, { body: corpo })
    if (error) {
      let mensagem = error.message
      const contexto = (error as { context?: Response }).context
      if (contexto && typeof contexto.json === 'function') {
        const j = (await contexto.json().catch(() => null)) as { erro?: string } | null
        if (j?.erro) mensagem = j.erro
      }
      throw new Error(mensagem)
    }
    return data as T
  }

  /** RPC sem retorno útil, com a mensagem do banco traduzida. */
  private async rpcSimples(nome: string, args?: Record<string, unknown>) {
    const { error } = await this.sb.rpc(nome, args)
    if (error) throw new Error(traduz(error.message))
  }

  async minhaConexaoDJ(): Promise<ConexaoDJ> {
    const { data, error } = await this.sb.rpc('minha_conexao_dj')
    if (error) throw new Error(traduz(error.message))
    return data as ConexaoDJ
  }

  async conectarSpotify(code: string, redirectUri: string) {
    const r = await this.invocar<{ resultado: ResultadoConexao }>('spotify-conectar', {
      code,
      redirect_uri: redirectUri,
    })
    return r.resultado
  }

  async desconectarSpotify() {
    await this.rpcSimples('desconectar_spotify')
  }

  async sessaoDJAberta(): Promise<SessaoDJ | null> {
    const data = ok(
      await this.sb
        .from('dj_sessoes')
        .select(
          'id, dj_user_id, noite, aberta_em, aviso, tocando_titulo, tocando_artista, tocando_capa, tocando_pedido_id, atualizado_em, dj:profiles!dj_user_id(nome), pedido:pedidos_musica!tocando_pedido_id(perfil:profiles!user_id(nome))',
        )
        .is('fechada_em', null)
        .maybeSingle(),
    ) as unknown as {
      id: string
      dj_user_id: string
      noite: string
      aberta_em: string
      aviso: SessaoDJ['aviso']
      tocando_titulo: string | null
      tocando_artista: string | null
      tocando_capa: string | null
      tocando_pedido_id: string | null
      atualizado_em: string | null
      dj: { nome: string } | null
      pedido: { perfil: { nome: string } | null } | null
    } | null
    if (!data) return null
    return {
      id: data.id,
      dj_user_id: data.dj_user_id,
      dj_nome: data.dj?.nome ?? 'Alguém',
      noite: data.noite,
      aberta_em: data.aberta_em,
      aviso: data.aviso,
      tocando: data.tocando_titulo
        ? {
            titulo: data.tocando_titulo,
            artista: data.tocando_artista ?? '',
            capa_url: data.tocando_capa,
            pedido_id: data.tocando_pedido_id,
            pedido_por: data.pedido?.perfil?.nome ?? null,
          }
        : null,
      atualizado_em: data.atualizado_em,
    }
  }

  async ligarModoDJ(assumir: boolean): Promise<ResultadoLigarDJ> {
    const { data, error } = await this.sb.rpc('ligar_modo_dj', { p_assumir: assumir })
    if (error) throw new Error(traduz(error.message))
    return data as ResultadoLigarDJ
  }

  async desligarModoDJ() {
    await this.rpcSimples('desligar_modo_dj')
  }

  async cutucarLoopDJ() {
    // Não é crítico: se falhar, o cron passa no próximo minuto
    try {
      await this.invocar('dj-loop', {})
    } catch (e) {
      console.warn('[dj] o loop não respondeu agora', e)
    }
  }

  async buscarMusicas(q: string) {
    const r = await this.invocar<{ faixas: FaixaSpotify[] }>('spotify-buscar', { q })
    return r.faixas
  }

  async pedirMusica(f: FaixaSpotify) {
    await this.rpcSimples('pedir_musica', {
      p_uri: f.uri,
      p_titulo: f.titulo,
      p_artista: f.artista,
      p_capa: f.capa_url,
      p_duracao: f.duracao_ms,
    })
  }

  async cancelarPedido(id: string) {
    await this.rpcSimples('cancelar_pedido', { p_id: id })
  }

  /** A noite da sessão aberta — é dela que a fila é. */
  private async noiteDaSessao(): Promise<string | null> {
    const d = ok(
      await this.sb.from('dj_sessoes').select('noite').is('fechada_em', null).maybeSingle(),
    ) as { noite: string } | null
    return d?.noite ?? null
  }

  async filaDaNoite(): Promise<PedidoNaFila[]> {
    const noite = await this.noiteDaSessao()
    if (!noite) return []
    const rows = ok(await this.sb.rpc('fila_da_noite', { p_noite: noite })) as Array<
      Omit<PedidoNaFila, 'uri' | 'status'> & { track_uri: string; status: string }
    >
    return rows.map(({ track_uri, ...r }) => ({
      ...r,
      uri: track_uri,
      status: r.status as PedidoNaFila['status'],
    }))
  }

  async pedidosDaNoite(): Promise<PedidoMusica[]> {
    const noite = await this.noiteDaSessao()
    if (!noite) return []
    // Uma noite tem dezenas de pedidos, longe do teto de 1000 linhas
    const rows = ok(
      await this.sb
        .from('pedidos_musica')
        .select(
          'id, noite, user_id, track_uri, titulo, artista, capa_url, duracao_ms, pedido_em, status, perfil:profiles!user_id(nome, avatar_url)',
        )
        .eq('noite', noite)
        .neq('status', 'cancelado')
        .order('pedido_em'),
    ) as unknown as Array<{
      id: string
      noite: string
      user_id: string
      track_uri: string
      titulo: string
      artista: string
      capa_url: string | null
      duracao_ms: number
      pedido_em: string
      status: PedidoMusica['status']
      perfil: { nome: string; avatar_url: string | null } | null
    }>
    return rows.map((r) => ({
      id: r.id,
      noite: r.noite,
      user_id: r.user_id,
      nome: r.perfil?.nome ?? 'Alguém',
      avatar_url: r.perfil?.avatar_url ?? null,
      uri: r.track_uri,
      titulo: r.titulo,
      artista: r.artista,
      capa_url: r.capa_url,
      duracao_ms: r.duracao_ms,
      pedido_em: r.pedido_em,
      status: r.status,
    }))
  }

  async musicasTocadasDe(userId: string) {
    const { count, error } = await this.sb
      .from('pedidos_musica')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'tocou')
    if (error) throw new Error(traduz(error.message))
    return count ?? 0
  }
```

- [ ] **Step 4: Conferir**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: só falta o `DemoApi` ("Class 'DemoApi' incorrectly implements…"). O `SupabaseApi` não aparece mais no erro. A Task 8 fecha isso. Não commitar ainda: o build está quebrado até a Task 8.

---

### Task 8: Modo demonstração — catálogo e Spotify de mentira

**Files:**
- Create: `src/lib/catalogoDemo.ts`
- Modify: `src/lib/demoApi.ts` (interface `DB`, imports e métodos novos antes do bloco de push)
- Create: `tests/lib/demoDj.test.ts`

**Interfaces:**
- Consumes: `ordenarFila` e `podeSerDJ` (Task 6); `decidirPassada` (Task 3); `diaDaNoite` (de `src/lib/dates.ts`); os 13 métodos da Task 7.
- Produces: `CATALOGO_DEMO: FaixaSpotify[]`, `PLAYLIST_DEMO: FaixaSpotify[]`, `DURACAO_DEMO_MS = 20_000`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `tests/lib/demoDj.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O DemoApi grava tudo no localStorage, que não existe no Node
function instalarLocalStorage() {
  const dados = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, String(v)),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size
    },
  } as Storage
}

describe('DemoApi — pedidos de música', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    // Segunda, 12/10/2026, 22h em São Paulo
    vi.setSystemTime(new Date('2026-10-13T01:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('toca na ordem do rodízio e conta para o distintivo', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const { DURACAO_DEMO_MS, CATALOGO_DEMO } = await import('../../src/lib/catalogoDemo')
    const api = new DemoApi()
    const banco = api as unknown as {
      db: { checkins: Array<Record<string, unknown>> }
    }
    // O seed do demo cria check-ins "de hoje"; zera para o teste
    // controlar exatamente quem tem check-in na noite
    banco.db.checkins.length = 0
    const checkinAgora = (user_id: string) =>
      banco.db.checkins.push({
        id: `ck-${user_id}`,
        user_id,
        foto_url: '',
        legenda: null,
        criado_em: new Date().toISOString(),
        presenca_anulada: false,
      })

    // Ana é organizadora: conecta e liga o Modo DJ
    await api.signInTelefone('11 98888-0003', 'forro123')
    await api.conectarSpotify('demo', '')
    expect(await api.ligarModoDJ(false)).toEqual({ tipo: 'ligado' })

    // Maria pede 3, João pede 1 depois
    await api.signInTelefone('11 98888-0001', 'forro123')
    const maria = (await api.getSessionUserId())!
    checkinAgora(maria)
    const [m1, m2, m3, j1] = CATALOGO_DEMO.slice(10, 14)
    await api.pedirMusica(m1)
    await api.pedirMusica(m2)
    await api.pedirMusica(m3)
    await expect(api.pedirMusica(m1)).rejects.toThrow('Essa música já foi pedida hoje')

    await api.signInTelefone('11 98888-0002', 'forro123')
    const joao = (await api.getSessionUserId())!
    await expect(api.pedirMusica(j1)).rejects.toThrow('Faça seu check-in para pedir música')
    checkinAgora(joao)
    await api.pedirMusica(j1)

    expect((await api.filaDaNoite()).map((p) => p.titulo)).toEqual([
      m1.titulo,
      j1.titulo,
      m2.titulo,
      m3.titulo,
    ])

    // O "Spotify de mentira" avança uma música a cada DURACAO_DEMO_MS
    await api.cutucarLoopDJ()
    const tocadas: string[] = []
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(new Date(Date.now() + DURACAO_DEMO_MS))
      await api.cutucarLoopDJ()
      tocadas.push((await api.sessaoDJAberta())!.tocando!.titulo)
    }
    expect(tocadas).toEqual([m1.titulo, j1.titulo, m2.titulo, m3.titulo])
    expect(await api.musicasTocadasDe(maria)).toBe(3)
    expect(await api.musicasTocadasDe(joao)).toBe(1)
    expect((await api.sessaoDJAberta())!.tocando!.pedido_por).toBe(
      (await api.getProfile(maria))!.nome,
    )
  })

  it('aluno não liga o Modo DJ', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0001', 'forro123')
    await expect(api.conectarSpotify('demo', '')).rejects.toThrow('Só professores podem ser DJ')
    await expect(api.ligarModoDJ(false)).rejects.toThrow('Só professores podem ligar o Modo DJ')
  })

  it('sem Modo DJ ligado não há fila, e pedir é recusado', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const { CATALOGO_DEMO } = await import('../../src/lib/catalogoDemo')
    const api = new DemoApi()
    await api.signInTelefone('11 98888-0001', 'forro123')
    expect(await api.sessaoDJAberta()).toBeNull()
    expect(await api.filaDaNoite()).toEqual([])
    await expect(api.pedirMusica(CATALOGO_DEMO[0])).rejects.toThrow('O Modo DJ não está ligado agora')
  })

  it('busca no catálogo ignora acento e maiúscula', async () => {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    expect((await api.buscarMusicas('xodo')).map((f) => f.titulo)).toContain('Eu Só Quero um Xodó')
    expect(await api.buscarMusicas('x')).toEqual([])
  })
})
```

Contas do seed do demo (senha `forro123` para todas), conferidas em `src/lib/demoApi.ts`:

| Telefone | Pessoa | Papel no teste |
|---|---|---|
| `11 98888-0001` | Maria Bonita | aluna, cargo Monitor(a), **não** pode ser DJ |
| `11 98888-0002` | João do Acordeon | aluno |
| `11 98888-0003` | Ana Xote | organizadora + Professor(a): a DJ |

`signInTelefone`, `getSessionUserId` e `getProfile` já existem no `DemoApi`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/lib/demoDj.test.ts`
Expected: FAIL. "Failed to resolve import ../../src/lib/catalogoDemo" ou "api.conectarSpotify is not a function".

- [ ] **Step 3: Escrever `src/lib/catalogoDemo.ts`**

```ts
import type { FaixaSpotify } from './types'

/**
 * Músicas do modo demonstração: a busca do demo procura aqui, e o
 * "Spotify de mentira" toca a playlist abaixo quando não há pedido.
 * As URIs seguem o formato real (`spotify:track:…`), mas não existem.
 */
const m = (n: number, titulo: string, artista: string): FaixaSpotify => ({
  uri: `spotify:track:demo${String(n).padStart(2, '0')}`,
  titulo,
  artista,
  capa_url: null,
  duracao_ms: 180_000,
})

export const CATALOGO_DEMO: FaixaSpotify[] = [
  m(1, 'Asa Branca', 'Luiz Gonzaga'),
  m(2, 'Xote das Meninas', 'Luiz Gonzaga'),
  m(3, 'Riacho do Navio', 'Luiz Gonzaga'),
  m(4, 'Qui Nem Jiló', 'Luiz Gonzaga'),
  m(5, 'Feira de Mangaio', 'Sivuca'),
  m(6, 'Esperando na Janela', 'Gilberto Gil'),
  m(7, 'Anunciação', 'Alceu Valença'),
  m(8, 'Morena Tropicana', 'Alceu Valença'),
  m(9, 'Último Pau de Arara', 'Fagner'),
  m(10, 'Tareco e Mariola', 'Petrúcio Amorim'),
  m(11, 'Eu Só Quero um Xodó', 'Dominguinhos'),
  m(12, 'De Volta pro Aconchego', 'Dominguinhos'),
  m(13, 'Lembrei de Nós', 'João Gomes, Mestrinho, Jota.pê'),
  m(14, 'Amor de Que', 'Marcelo Jeneci, João Gomes'),
  m(15, 'Sabiá', 'Luiz Gonzaga'),
  m(16, 'Forró no Escuro', 'Luiz Gonzaga'),
  m(17, 'Pagode Russo', 'Luiz Gonzaga'),
  m(18, 'Vem Morena', 'Luiz Gonzaga'),
  m(19, 'A Vida do Viajante', 'Luiz Gonzaga'),
  m(20, 'Xodó', 'Mestrinho'),
]

/** A "playlist padrão" do professor no demo. */
export const PLAYLIST_DEMO: FaixaSpotify[] = CATALOGO_DEMO.slice(0, 8)

/** Cada música do demo dura 20 s, para dar para ver a fila andar. */
export const DURACAO_DEMO_MS = 20_000
```

Os pedidos do teste usam `CATALOGO_DEMO.slice(10, 14)` (faixas 11–14), fora da playlist, para não confundir pedido com música da playlist.

- [ ] **Step 4: Estender o banco do demo**

Em `src/lib/demoApi.ts`, acrescentar na `interface DB` (linha ~94), depois do último campo opcional existente:

```ts
  // ---- Modo DJ (migração 029) — opcionais: bancos demo antigos não têm ----
  djConexoes?: Record<string, { spotify_nome: string; plano: string }>
  djSessoes?: Array<{
    id: string
    dj_user_id: string
    noite: string
    aberta_em: string
    fechada_em: string | null
    motivo_fechamento: string | null
    tocando_pedido_id: string | null
  }>
  pedidosMusica?: Array<{
    id: string
    noite: string
    user_id: string
    uri: string
    titulo: string
    artista: string
    capa_url: string | null
    duracao_ms: number
    pedido_em: string
    status: StatusPedido
    enviado_em: string | null
    tocou_em: string | null
  }>
  /** O "Spotify de mentira": o que toca, desde quando, e a fila dele. */
  djSim?: {
    tocandoUri: string
    desde: number
    filaSpotify: string[]
    playlistIdx: number
  } | null
```

Acrescentar aos imports do arquivo:

```ts
import { decidirPassada } from '../../supabase/functions/_shared/djPuro'
import { CATALOGO_DEMO, DURACAO_DEMO_MS, PLAYLIST_DEMO } from './catalogoDemo'
import { podeSerDJ } from './dj'
import { ordenarFila } from './filaMusica'
```

Acrescentar `diaDaNoite` ao import já existente de `./dates`. Acrescentar ao import de tipos: `ConexaoDJ`, `FaixaSpotify`, `PedidoMusica`, `PedidoNaFila`, `ResultadoConexao`, `ResultadoLigarDJ`, `SessaoDJ` e `StatusPedido`.

- [ ] **Step 5: Implementar os métodos no `DemoApi`**

Inserir antes do método `savePushSubscription` do `DemoApi`:

```ts
  // ---- Modo DJ e pedidos de música (espelha a migração 029) ----

  private sessaoAberta() {
    return (this.db.djSessoes ?? []).find((s) => s.fechada_em === null) ?? null
  }

  private pedidosDe(noite: string) {
    return (this.db.pedidosMusica ?? []).filter((p) => p.noite === noite)
  }

  private comPerfil<T extends { user_id: string }>(p: T) {
    const perfil = this.db.profiles.find((x) => x.id === p.user_id)
    return { ...p, nome: perfil?.nome ?? 'Alguém', avatar_url: perfil?.avatar_url ?? null }
  }

  /**
   * O "Spotify de mentira" anda até agora: uma música a cada
   * DURACAO_DEMO_MS. A cada música que acaba, roda a MESMA decisão do
   * loop de produção (decidirPassada), como se o cron passasse ali.
   */
  private avancarDJ() {
    const s = this.sessaoAberta()
    if (!s) return
    if (!this.db.djSim) {
      this.db.djSim = {
        tocandoUri: PLAYLIST_DEMO[0].uri,
        desde: Date.now(),
        filaSpotify: [],
        playlistIdx: 0,
      }
    }
    const sim = this.db.djSim
    while (Date.now() - sim.desde >= DURACAO_DEMO_MS) {
      sim.desde += DURACAO_DEMO_MS
      const proxima = sim.filaSpotify.shift()
      if (proxima) {
        sim.tocandoUri = proxima
      } else {
        sim.playlistIdx = (sim.playlistIdx + 1) % PLAYLIST_DEMO.length
        sim.tocandoUri = PLAYLIST_DEMO[sim.playlistIdx].uri
      }
      this.passadaDJ(new Date(sim.desde))
      if (!this.sessaoAberta()) break
    }
    if (this.sessaoAberta()) this.passadaDJ(new Date())
    this.persist()
  }

  private passadaDJ(agora: Date) {
    const s = this.sessaoAberta()
    const sim = this.db.djSim
    if (!s || !sim) return
    const pedidos = this.pedidosDe(s.noite)
    const pendente =
      pedidos
        .filter((p) => p.status === 'enviado')
        .sort((a, b) => (b.enviado_em ?? '').localeCompare(a.enviado_em ?? ''))[0] ?? null
    const fila = ordenarFila(pedidos)
    const tocando = CATALOGO_DEMO.find((f) => f.uri === sim.tocandoUri) ?? PLAYLIST_DEMO[0]

    const acao = decidirPassada({
      agora,
      noite: s.noite,
      temConexao: Boolean(this.db.djConexoes?.[s.dj_user_id]),
      player: { tocando, filaUris: sim.filaSpotify },
      enviadoPendente: pendente ? { id: pendente.id, trackUri: pendente.uri } : null,
      temProximo: fila.length > 0,
    })
    if (acao.tipo === 'fechar') {
      s.fechada_em = agora.toISOString()
      s.motivo_fechamento = acao.motivo
      return
    }
    if (acao.tipo !== 'passada') return
    if (acao.marcarTocou && pendente) {
      pendente.status = 'tocou'
      pendente.tocou_em = agora.toISOString()
    }
    s.tocando_pedido_id =
      pedidos.find(
        (p) => p.uri === sim.tocandoUri && (p.status === 'enviado' || p.status === 'tocou'),
      )?.id ?? null
    if (acao.enviar && fila[0]) {
      const proximo = pedidos.find((p) => p.id === fila[0].id)!
      proximo.status = 'enviado'
      proximo.enviado_em = agora.toISOString()
      sim.filaSpotify.push(proximo.uri)
    }
  }

  async minhaConexaoDJ(): Promise<ConexaoDJ> {
    const c = this.db.djConexoes?.[this.uid()]
    return c
      ? { conectado: true, spotify_nome: c.spotify_nome, plano: c.plano }
      : { conectado: false, spotify_nome: null, plano: null }
  }

  async conectarSpotify(_code: string, _redirectUri: string): Promise<ResultadoConexao> {
    const uid = this.uid()
    const perfil = this.db.profiles.find((p) => p.id === uid)
    if (!perfil || !podeSerDJ(perfil.cargos, this.db.roles[uid] ?? 'aluno')) {
      throw new Error('Só professores podem ser DJ')
    }
    // No demo não há Spotify: a conexão só fica marcada como feita
    this.db.djConexoes = {
      ...(this.db.djConexoes ?? {}),
      [uid]: { spotify_nome: perfil.nome, plano: 'premium' },
    }
    this.persist()
    return 'ok'
  }

  async desconectarSpotify() {
    const uid = this.uid()
    const s = this.sessaoAberta()
    if (s?.dj_user_id === uid) {
      s.fechada_em = new Date().toISOString()
      s.motivo_fechamento = 'desligou'
    }
    if (this.db.djConexoes) delete this.db.djConexoes[uid]
    this.persist()
  }

  async sessaoDJAberta(): Promise<SessaoDJ | null> {
    this.avancarDJ()
    const s = this.sessaoAberta()
    if (!s) return null
    const sim = this.db.djSim
    const tocando = sim ? CATALOGO_DEMO.find((f) => f.uri === sim.tocandoUri) : undefined
    const pedido = s.tocando_pedido_id
      ? (this.db.pedidosMusica ?? []).find((p) => p.id === s.tocando_pedido_id)
      : undefined
    return {
      id: s.id,
      dj_user_id: s.dj_user_id,
      dj_nome: this.db.profiles.find((p) => p.id === s.dj_user_id)?.nome ?? 'Alguém',
      noite: s.noite,
      aberta_em: s.aberta_em,
      aviso: null,
      tocando: tocando
        ? {
            titulo: tocando.titulo,
            artista: tocando.artista,
            capa_url: tocando.capa_url,
            pedido_id: pedido?.id ?? null,
            pedido_por: pedido ? this.comPerfil(pedido).nome : null,
          }
        : null,
      atualizado_em: new Date().toISOString(),
    }
  }

  async ligarModoDJ(assumir: boolean): Promise<ResultadoLigarDJ> {
    const uid = this.uid()
    const perfil = this.db.profiles.find((p) => p.id === uid)
    if (!perfil || !podeSerDJ(perfil.cargos, this.db.roles[uid] ?? 'aluno')) {
      throw new Error('Só professores podem ligar o Modo DJ')
    }
    if (!this.db.djConexoes?.[uid]) {
      throw new Error('Conecte seu Spotify antes de ligar o Modo DJ')
    }
    const aberta = this.sessaoAberta()
    if (aberta) {
      if (aberta.dj_user_id === uid) return { tipo: 'ligado' }
      if (!assumir) {
        return {
          tipo: 'ocupado',
          dj_nome: this.db.profiles.find((p) => p.id === aberta.dj_user_id)?.nome ?? 'Alguém',
        }
      }
      aberta.fechada_em = new Date().toISOString()
      aberta.motivo_fechamento = 'assumida'
    }
    this.db.djSessoes = [
      ...(this.db.djSessoes ?? []),
      {
        id: uuid(),
        dj_user_id: uid,
        noite: diaDaNoite(new Date()),
        aberta_em: new Date().toISOString(),
        fechada_em: null,
        motivo_fechamento: null,
        tocando_pedido_id: null,
      },
    ]
    // Spotify de mentira recomeça com a playlist
    this.db.djSim = null
    this.persist()
    return { tipo: 'ligado' }
  }

  async desligarModoDJ() {
    const uid = this.uid()
    const s = this.sessaoAberta()
    if (s && (s.dj_user_id === uid || this.db.roles[uid] === 'organizador')) {
      s.fechada_em = new Date().toISOString()
      s.motivo_fechamento = 'desligou'
      this.persist()
    }
  }

  async cutucarLoopDJ() {
    this.avancarDJ()
  }

  async buscarMusicas(q: string) {
    const normal = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const termo = normal(q.trim())
    if (termo.length < 2) return []
    return CATALOGO_DEMO.filter((f) => normal(`${f.titulo} ${f.artista}`).includes(termo))
  }

  async pedirMusica(f: FaixaSpotify) {
    const uid = this.uid()
    const s = this.sessaoAberta()
    if (!s) throw new Error('O Modo DJ não está ligado agora')
    const temCheckin = this.db.checkins.some(
      (c) =>
        c.user_id === uid &&
        !c.presenca_anulada &&
        diaDaNoite(new Date(c.criado_em)) === s.noite,
    )
    if (!temCheckin) throw new Error('Faça seu check-in para pedir música')
    if (this.pedidosDe(s.noite).some((p) => p.uri === f.uri && p.status !== 'cancelado')) {
      throw new Error('Essa música já foi pedida hoje')
    }
    this.db.pedidosMusica = [
      ...(this.db.pedidosMusica ?? []),
      {
        id: uuid(),
        noite: s.noite,
        user_id: uid,
        uri: f.uri,
        titulo: f.titulo,
        artista: f.artista,
        capa_url: f.capa_url,
        duracao_ms: f.duracao_ms,
        pedido_em: new Date().toISOString(),
        status: 'esperando',
        enviado_em: null,
        tocou_em: null,
      },
    ]
    this.persist()
  }

  async cancelarPedido(id: string) {
    const uid = this.uid()
    const p = (this.db.pedidosMusica ?? []).find((x) => x.id === id)
    if (!p) throw new Error('Pedido não encontrado')
    if (p.status !== 'esperando') throw new Error('Esse pedido já foi para o Spotify')
    const dj = this.sessaoAberta()?.dj_user_id
    if (p.user_id !== uid && dj !== uid && this.db.roles[uid] !== 'organizador') {
      throw new Error('Você só pode cancelar os seus pedidos')
    }
    p.status = 'cancelado'
    this.persist()
  }

  async filaDaNoite(): Promise<PedidoNaFila[]> {
    this.avancarDJ()
    const s = this.sessaoAberta()
    if (!s) return []
    return ordenarFila(this.pedidosDe(s.noite)).map((p) => this.comPerfil(p))
  }

  async pedidosDaNoite(): Promise<PedidoMusica[]> {
    this.avancarDJ()
    const s = this.sessaoAberta()
    if (!s) return []
    return this.pedidosDe(s.noite)
      .filter((p) => p.status !== 'cancelado')
      .map((p) => this.comPerfil(p))
  }

  async musicasTocadasDe(userId: string) {
    return (this.db.pedidosMusica ?? []).filter(
      (p) => p.user_id === userId && p.status === 'tocou',
    ).length
  }
```

Os parâmetros `_code` e `_redirectUri` começam com `_` de propósito: o `noUnusedParameters` do `tsconfig` ignora parâmetros com esse prefixo.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run tests/lib/demoDj.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS nos 4 testes, e `tsc` sem erros.

- [ ] **Step 7: Rodar tudo e commitar as Tasks 7 e 8 juntas**

Run: `npm test && npm run build`
Expected: tudo passa; build gera `dist/`.

```bash
git add src/lib/api.ts src/lib/supabaseApi.ts src/lib/demoApi.ts src/lib/catalogoDemo.ts tests/lib/demoDj.test.ts
git commit -m "Modo DJ na API: Supabase e demonstracao

Treze metodos novos no ForroApi. Na versao Supabase, regras ficam no
banco (RPCs) e o que precisa do Client Secret passa pelas Edge
Functions, com a mensagem de erro delas levada ate a tela. No demo, um
Spotify de mentira avanca uma musica a cada 20 s e roda a MESMA decisao
do loop de producao (decidirPassada), entao as telas mostram a fila
andando de verdade. O teste toca quatro pedidos e confere a ordem do
rodizio e a contagem do distintivo."
```

---

### Task 9: Distintivo "DJ do Espaço Livre"

**Files:**
- Modify: `src/lib/badges.ts`
- Modify: `src/lib/perfilStats.ts`
- Create: `tests/lib/badges.test.ts`

**Interfaces:**
- Consumes: `api.musicasTocadasDe(userId)` (Task 7).
- Produces: `computeBadges({ …, musicasTocadas?: number })`. Gera no máximo um distintivo com `id` `dj-1`, `dj-10`, `dj-25` ou `dj-50`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `tests/lib/badges.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeBadges } from '../../src/lib/badges'

const dj = (musicasTocadas?: number) =>
  computeBadges({ userId: 'u', turmas: [], checkinDates: [], musicasTocadas }).filter((b) =>
    b.id.startsWith('dj-'),
  )

describe('distintivo DJ do Espaço Livre', () => {
  it('sem música tocada não aparece', () => {
    expect(dj(0)).toEqual([])
    expect(dj(undefined)).toEqual([])
  })

  it('evolui sem acumular: mostra só o maior nível', () => {
    expect(dj(1).map((b) => b.emoji)).toEqual(['🎵'])
    expect(dj(12).map((b) => b.emoji)).toEqual(['🎶'])
    expect(dj(25).map((b) => b.emoji)).toEqual(['🎧'])
    expect(dj(80).map((b) => b.emoji)).toEqual(['🔊'])
  })

  it('a descrição traz o número exato', () => {
    expect(dj(1)[0].descricao).toBe('1 música tocada no Espaço Livre')
    expect(dj(12)[0].descricao).toBe('12 músicas tocadas no Espaço Livre')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/lib/badges.test.ts`
Expected: FAIL. `dj(1)` devolve `[]`.

- [ ] **Step 3: Implementar**

Em `src/lib/badges.ts`, logo depois de `MARCOS_RODIZIO`:

```ts
/**
 * DJ do Espaço Livre: pedidos que DE FATO tocaram (o loop viu tocando),
 * não os que ficaram esperando quando a fila fechou. 🪩 já é do
 * rodízio, por isso o último nível é 🔊.
 */
const MARCOS_DJ: Marco[] = [
  [1, '🎵', 'Primeira música tocada'],
  [10, '🎶', '10 músicas tocadas'],
  [25, '🎧', '25 músicas tocadas'],
  [50, '🔊', '50 músicas tocadas'],
]
```

No tipo do parâmetro de `computeBadges`, depois de `parceiros?: number`:

```ts
  /** Pedidos de música que tocaram no Espaço Livre (migração 029). */
  musicasTocadas?: number
```

No corpo, logo antes de `  return badges`:

```ts
  // 2.6 DJ do Espaço Livre — músicas pedidas que tocaram
  const tocadas = input.musicasTocadas ?? 0
  const dj = marcoAlcancado(MARCOS_DJ, tocadas)
  if (dj) {
    const [minimo, emoji, titulo] = dj
    badges.push({
      id: `dj-${minimo}`,
      emoji,
      titulo,
      descricao: `${tocadas} ${
        tocadas === 1 ? 'música tocada' : 'músicas tocadas'
      } no Espaço Livre`,
    })
  }
```

Em `src/lib/perfilStats.ts`:

1. Na desestruturação do `Promise.all`, acrescentar `musicasTocadas` depois de `aberturas`.
2. No array do `Promise.all`, acrescentar como último item:

```ts
    // Sem a migração 029 a tabela não existe — o perfil vale sem isso
    api.musicasTocadasDe(userId).catch(() => 0),
```

3. Na chamada `computeBadges({ … })`, acrescentar `musicasTocadas,`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/lib/badges.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/badges.ts src/lib/perfilStats.ts tests/lib/badges.test.ts
git commit -m "Distintivo DJ do Espaco Livre

Conta os pedidos que de fato tocaram, em niveis que evoluem como os de
presenca e rodizio: 1, 10, 25 e 50 musicas. O perfil segue funcionando
sem a migracao 029 (contagem cai para zero)."
```

---

### Task 10: Conectar o Spotify (tela de volta, bloco na Conta, rotas)

**Files:**
- Create: `src/lib/useAtualizacaoPeriodica.ts`
- Create: `src/pages/SpotifyConectadoPage.tsx`
- Create: `src/components/ConexaoSpotify.tsx`
- Modify: `src/pages/ContaPage.tsx` (montar o bloco)
- Modify: `src/App.tsx` (rotas `/spotify/conectado`, `/dj`, `/musica`)
- Create: `src/pages/DJPage.tsx` e `src/pages/MusicaPage.tsx`, só como esqueleto para as rotas compilarem (as Tasks 11 e 12 preenchem)

**Interfaces:**
- Consumes: `podeSerDJ`, `urlAutorizacaoSpotify`, `redirectSpotify`, `novoStateSpotify`, `CHAVE_STATE_SPOTIFY` (Task 6); `minhaConexaoDJ`, `conectarSpotify`, `desconectarSpotify` (Task 7).
- Produces: `useAtualizacaoPeriodica(carregar: () => Promise<void>, intervaloMs: number): void`, usado pelas Tasks 11 e 12.

Telas não têm teste automatizado neste projeto. A verificação é no navegador, em modo demonstração (Step 6).

- [ ] **Step 1: Escrever o hook de recarga**

Criar `src/lib/useAtualizacaoPeriodica.ts`:

```ts
import { useEffect, useRef } from 'react'

/**
 * Roda `carregar` ao montar e a cada `intervaloMs`, mas SÓ com a aba
 * visível — e de novo na hora em que a pessoa volta para o app.
 *
 * É o freio que a cota de logs pede (migração 028): tela em segundo
 * plano não busca nada, e ninguém usa tempo real para isso.
 */
export function useAtualizacaoPeriodica(
  carregar: () => Promise<void>,
  intervaloMs: number,
) {
  const atual = useRef(carregar)
  useEffect(() => {
    atual.current = carregar
  }, [carregar])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const rodar = () => {
      void atual.current().catch((e) => console.error('[atualizacao]', e))
    }
    const ligar = () => {
      clearInterval(timer)
      timer = setInterval(rodar, intervaloMs)
    }
    const aoMudar = () => {
      if (document.hidden) {
        clearInterval(timer)
      } else {
        rodar()
        ligar()
      }
    }
    rodar()
    if (!document.hidden) ligar()
    document.addEventListener('visibilitychange', aoMudar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoMudar)
    }
  }, [intervaloMs])
}
```

- [ ] **Step 2: Escrever a tela de volta do Spotify**

Criar `src/pages/SpotifyConectadoPage.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { CHAVE_STATE_SPOTIFY, redirectSpotify } from '../lib/dj'
import type { ResultadoConexao } from '../lib/types'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; resultado: ResultadoConexao }
  | { tipo: 'erro'; mensagem: string }

const MENSAGENS: Record<ResultadoConexao, { titulo: string; texto: string }> = {
  ok: {
    titulo: 'Spotify conectado! 🎧',
    texto: 'Agora é só ligar o Modo DJ no Espaço Livre.',
  },
  sem_premium: {
    titulo: 'Conectado, mas falta o Premium',
    texto:
      'O Modo DJ precisa de Spotify Premium: sem ele, o Spotify não deixa o app colocar músicas na fila.',
  },
  nao_liberado: {
    titulo: 'Sua conta ainda não foi liberada',
    texto:
      'Sua conta Spotify ainda não foi liberada. Peça à organização para incluir você.',
  },
}

/**
 * Onde o Spotify devolve a pessoa depois do login. Confere o `state`
 * (que só este navegador conhece) e entrega o código ao servidor.
 */
export function SpotifyConectadoPage() {
  const { api } = useAuth()
  const [params] = useSearchParams()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  // O código do Spotify só vale uma vez; o StrictMode roda efeitos duas
  const jaFoi = useRef(false)

  useEffect(() => {
    if (jaFoi.current) return
    jaFoi.current = true
    const esperado = sessionStorage.getItem(CHAVE_STATE_SPOTIFY)
    sessionStorage.removeItem(CHAVE_STATE_SPOTIFY)
    if (params.get('error')) {
      setEstado({ tipo: 'erro', mensagem: 'A conexão foi cancelada no Spotify.' })
      return
    }
    const code = params.get('code')
    if (!code || !esperado || params.get('state') !== esperado) {
      setEstado({
        tipo: 'erro',
        mensagem: 'Esse retorno do Spotify não é válido. Tente conectar de novo.',
      })
      return
    }
    api
      .conectarSpotify(code, redirectSpotify(window.location.origin))
      .then((resultado) => setEstado({ tipo: 'pronto', resultado }))
      .catch((e) => setEstado({ tipo: 'erro', mensagem: (e as Error).message }))
  }, [api, params])

  if (estado.tipo === 'carregando') return <Spinner texto="Conectando ao Spotify…" />

  const titulo =
    estado.tipo === 'pronto' ? MENSAGENS[estado.resultado].titulo : 'Não deu certo'
  const texto =
    estado.tipo === 'pronto' ? MENSAGENS[estado.resultado].texto : estado.mensagem

  return (
    <div className="card space-y-3 p-5">
      <h1 className="text-lg font-extrabold">{titulo}</h1>
      <p className="text-sm text-tinta-700">{texto}</p>
      <div className="flex flex-wrap gap-2">
        {estado.tipo === 'pronto' && estado.resultado === 'ok' && (
          <Link to="/dj" className="btn-primary">
            Abrir Modo DJ
          </Link>
        )}
        <Link to="/perfil/conta" className="btn-ghost">
          Voltar para a conta
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Escrever o bloco da Conta**

Criar `src/components/ConexaoSpotify.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  CHAVE_STATE_SPOTIFY,
  novoStateSpotify,
  podeSerDJ,
  redirectSpotify,
  urlAutorizacaoSpotify,
} from '../lib/dj'
import type { ConexaoDJ } from '../lib/types'

/**
 * Conexão do Spotify de quem pode ser DJ. Para os outros, nada aparece:
 * a conta do aluno não ganha um botão que ele não pode usar.
 */
export function ConexaoSpotify() {
  const { api, profile, papel } = useAuth()
  const toast = useToast()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pode = profile ? podeSerDJ(profile.cargos, papel) : false

  useEffect(() => {
    if (!pode) return
    void api
      .minhaConexaoDJ()
      .then(setConexao)
      // Sem a migração 029: mostra como não conectado
      .catch(() => setConexao({ conectado: false, spotify_nome: null, plano: null }))
  }, [api, pode])

  if (!pode) return null

  const conectar = async () => {
    if (api.mode === 'demo') {
      // No demo não há Spotify de verdade para abrir
      setOcupado(true)
      try {
        await api.conectarSpotify('demo', '')
        setConexao(await api.minhaConexaoDJ())
        toast('Spotify conectado (demonstração) 🎧')
      } catch (e) {
        toast((e as Error).message, 'erro')
      } finally {
        setOcupado(false)
      }
      return
    }
    const state = novoStateSpotify()
    sessionStorage.setItem(CHAVE_STATE_SPOTIFY, state)
    window.location.href = urlAutorizacaoSpotify(
      redirectSpotify(window.location.origin),
      state,
    )
  }

  const desconectar = async () => {
    setOcupado(true)
    try {
      await api.desconectarSpotify()
      setConexao({ conectado: false, spotify_nome: null, plano: null })
      toast('Spotify desconectado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="text-sm font-bold">Spotify · Modo DJ 🎧</p>
        <p className="text-xs text-tinta-500">
          Para tocar os pedidos dos alunos no Espaço Livre, pelo seu Spotify
          Premium.
        </p>
      </div>
      {conexao === null ? (
        <p className="text-xs text-tinta-500">Carregando…</p>
      ) : conexao.conectado ? (
        <>
          <p className="text-sm">
            Conectado como <strong>{conexao.spotify_nome ?? 'sua conta'}</strong>
          </p>
          {conexao.plano !== null && conexao.plano !== 'premium' && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              O Modo DJ precisa de Spotify Premium.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link to="/dj" className="btn-primary">
              Abrir Modo DJ
            </Link>
            <button
              className="btn-ghost"
              disabled={ocupado}
              onClick={() => void desconectar()}
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-tinta-600">
            Sua conta Spotify precisa estar liberada pela organização no painel
            do Spotify (até 5 professores).
          </p>
          <button
            className="btn-primary w-full"
            disabled={ocupado}
            onClick={() => void conectar()}
          >
            Conectar meu Spotify
          </button>
        </>
      )}
    </div>
  )
}
```

Em `src/pages/ContaPage.tsx`:
1. Importar `import { ConexaoSpotify } from '../components/ConexaoSpotify'`.
2. Montar `<ConexaoSpotify />` logo **depois** do `</div>` que fecha o `card divide-y` (o cartão Nome/E-mail/Senha) e **antes** de `{pushSupported() && (`.

- [ ] **Step 4: Criar as rotas e os esqueletos de DJ e Música**

Criar `src/pages/DJPage.tsx` (substituído na Task 11):

```tsx
export function DJPage() {
  return <p className="p-4 text-sm">Modo DJ — em construção.</p>
}
```

Criar `src/pages/MusicaPage.tsx` (substituído na Task 12):

```tsx
export function MusicaPage() {
  return <p className="p-4 text-sm">Pedir música — em construção.</p>
}
```

Em `src/App.tsx`:
1. Importar as três páginas, no mesmo estilo dos imports existentes (`import { DJPage } from './pages/DJPage'` etc.).
2. Depois da linha `<Route path="/organizador" element={<AdminPage />} />`, acrescentar:

```tsx
              <Route path="/dj" element={<DJPage />} />
              <Route path="/musica" element={<MusicaPage />} />
              <Route path="/spotify/conectado" element={<SpotifyConectadoPage />} />
```

As três ficam dentro do grupo de rotas que exige login, junto das outras telas do app: conectar exige sessão.

- [ ] **Step 5: Conferir build e testes**

Run: `npx tsc -p tsconfig.json --noEmit && npm test`
Expected: sem erros.

- [ ] **Step 6: Verificar no navegador (modo demonstração)**

1. `preview_start` com `name: "dev"`.
2. Entrar como Ana (`11 98888-0003` / `forro123`, organizadora) e abrir `/perfil/conta`. Confirmar o cartão "Spotify · Modo DJ 🎧" com "Conectar meu Spotify".
3. Tocar em "Conectar meu Spotify". Confirmar o toast "Spotify conectado (demonstração) 🎧" e "Conectado como Ana Xote", com "Abrir Modo DJ" e "Desconectar".
4. Tocar em "Desconectar" e confirmar que volta ao estado inicial. Conectar de novo.
5. Sair e entrar como Maria (`11 98888-0001`), que é aluna. Confirmar que o cartão **não** aparece em `/perfil/conta`.
6. Abrir `/spotify/conectado?code=x&state=y` direto. Confirmar "Não deu certo" com "Esse retorno do Spotify não é válido…".
7. `read_console_messages` com `onlyErrors`: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useAtualizacaoPeriodica.ts src/pages/SpotifyConectadoPage.tsx src/components/ConexaoSpotify.tsx src/pages/ContaPage.tsx src/App.tsx src/pages/DJPage.tsx src/pages/MusicaPage.tsx
git commit -m "Conectar o Spotify do professor

Bloco na Conta so para quem pode ser DJ, com conectar, desconectar e
aviso de Premium. A volta do Spotify (/spotify/conectado) confere o
state antes de entregar o codigo ao servidor, e trata conta nao
liberada, sem Premium e retorno invalido. useAtualizacaoPeriodica
concentra o freio de recarga: so com a aba visivel."
```

---

### Task 11: Tela Modo DJ

**Files:**
- Modify (substituir inteiro): `src/pages/DJPage.tsx`

**Interfaces:**
- Consumes:
  - `useAtualizacaoPeriodica` (Task 10); `podeSerDJ` (Task 6);
  - `minhaConexaoDJ`, `sessaoDJAberta`, `filaDaNoite`, `ligarModoDJ`, `desligarModoDJ`, `cutucarLoopDJ`, `cancelarPedido` (Task 7);
  - componente `Avatar({ nome, url, tamanho })` e `Spinner({ texto })` existentes.

- [ ] **Step 1: Escrever a tela**

Substituir `src/pages/DJPage.tsx` por:

```tsx
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { podeSerDJ } from '../lib/dj'
import type { ConexaoDJ, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'

const AVISOS: Record<NonNullable<SessaoDJ['aviso']>, string> = {
  sem_aparelho:
    'O Spotify não está tocando em nenhum aparelho. Dê play na playlist no Spotify.',
  sem_premium:
    'O Spotify recusou o controle do player. A conta precisa ser Premium e estar liberada no painel do Spotify.',
}

/**
 * Modo DJ: ligar, ver a fila e cuidar dela. O professor NÃO precisa
 * deixar esta tela aberta — quem manda as músicas é o servidor, a cada
 * minuto. Ela serve para ver e cancelar.
 */
export function DJPage() {
  const { api, userId, profile, papel } = useAuth()
  const toast = useToast()
  const [conexao, setConexao] = useState<ConexaoDJ | null>(null)
  const [sessao, setSessao] = useState<SessaoDJ | null>(null)
  const [fila, setFila] = useState<PedidoNaFila[]>([])
  const [ocupado, setOcupado] = useState(false)
  const pode = profile ? podeSerDJ(profile.cargos, papel) : false

  const carregar = useCallback(async () => {
    if (!pode) return
    const [c, s, f] = await Promise.all([
      api.minhaConexaoDJ(),
      api.sessaoDJAberta(),
      api.filaDaNoite(),
    ])
    setConexao(c)
    setSessao(s)
    setFila(f)
  }, [api, pode])
  useAtualizacaoPeriodica(carregar, 30_000)

  const ligar = async (assumir: boolean) => {
    setOcupado(true)
    try {
      let r = await api.ligarModoDJ(assumir)
      if (r.tipo === 'ocupado') {
        if (!window.confirm(`${r.dj_nome} está de DJ agora. Assumir?`)) return
        r = await api.ligarModoDJ(true)
      }
      // Primeira passada já, sem esperar o minuto do agendamento
      await api.cutucarLoopDJ()
      await carregar()
      toast('Modo DJ ligado 🎧')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const desligar = async () => {
    if (!window.confirm('Desligar o Modo DJ? Os pedidos que ainda estão esperando não vão tocar.')) {
      return
    }
    setOcupado(true)
    try {
      await api.desligarModoDJ()
      await carregar()
      toast('Modo DJ desligado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const cancelar = async (p: PedidoNaFila) => {
    try {
      await api.cancelarPedido(p.id)
      await carregar()
      toast(`Pedido de ${p.nome} cancelado`)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  if (!pode) {
    return (
      <div className="card p-5 text-sm text-tinta-700">
        O Modo DJ é para professores. Para pedir uma música, use{' '}
        <Link to="/musica" className="font-bold underline">
          Pedir música
        </Link>
        .
      </div>
    )
  }
  if (conexao === null) return <Spinner texto="Carregando o Modo DJ…" />
  if (!conexao.conectado) {
    return (
      <div className="card space-y-3 p-5">
        <h1 className="text-lg font-extrabold">Modo DJ 🎧</h1>
        <p className="text-sm text-tinta-700">
          Primeiro conecte seu Spotify em Meus dados e acesso.
        </p>
        <Link to="/perfil/conta" className="btn-primary">
          Conectar meu Spotify
        </Link>
      </div>
    )
  }

  const souEu = sessao?.dj_user_id === userId

  if (!souEu) {
    return (
      <div className="card space-y-3 p-5">
        <h1 className="text-lg font-extrabold">Modo DJ 🎧</h1>
        <p className="text-sm text-tinta-700">
          Dê play na sua playlist no Spotify e ligue o Modo DJ. Os pedidos dos
          alunos entram no meio dela, um de cada pessoa por vez.
        </p>
        {sessao && (
          <p className="rounded-xl bg-preto/5 px-3 py-2 text-sm">
            <strong>{sessao.dj_nome}</strong> está de DJ agora.
          </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={ocupado}
          onClick={() => void ligar(Boolean(sessao))}
        >
          {sessao ? 'Assumir o Modo DJ' : 'Ligar Modo DJ'}
        </button>
      </div>
    )
  }

  const proxima = fila[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Modo DJ 🎧</h1>
        <button className="btn-ghost" disabled={ocupado} onClick={() => void desligar()}>
          Desligar
        </button>
      </div>

      {sessao?.aviso && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          {AVISOS[sessao.aviso]}
        </p>
      )}

      <div className="card space-y-1 p-4">
        <p className="text-xs font-bold uppercase text-tinta-500">Tocando agora</p>
        {sessao?.tocando ? (
          <>
            <p className="font-bold">{sessao.tocando.titulo}</p>
            <p className="text-sm text-tinta-600">{sessao.tocando.artista}</p>
            {sessao.tocando.pedido_por && (
              <p className="text-xs text-brasa-700">pedida por {sessao.tocando.pedido_por}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-tinta-600">Esperando a primeira leitura do Spotify…</p>
        )}
      </div>

      <div className="card space-y-1 p-4">
        <p className="text-xs font-bold uppercase text-tinta-500">Próxima do rodízio</p>
        {proxima ? (
          <p className="text-sm">
            <strong>{proxima.titulo}</strong> — {proxima.artista}
            <span className="text-tinta-500"> · pedida por {proxima.nome}</span>
          </p>
        ) : (
          <p className="text-sm text-tinta-600">Nenhum pedido esperando: a playlist segue.</p>
        )}
      </div>

      <div className="card divide-y divide-preto/10">
        <p className="p-4 text-xs font-bold uppercase text-tinta-500">
          Fila ({fila.length})
        </p>
        {fila.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <span className="w-6 text-center text-sm font-bold text-tinta-500">{p.posicao}</span>
            <Avatar nome={p.nome} url={p.avatar_url} tamanho={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.titulo}</p>
              <p className="truncate text-xs text-tinta-500">
                {p.artista} · {p.nome}
              </p>
            </div>
            <button
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-tinta-600 hover:bg-preto/5"
              onClick={() => void cancelar(p)}
            >
              Cancelar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Conferir**

Run: `npx tsc -p tsconfig.json --noEmit && npm test`
Expected: sem erros.

- [ ] **Step 3: Verificar no navegador (modo demonstração)**

1. Como Ana (organizadora), conectar o Spotify em `/perfil/conta` (se ainda não estiver) e abrir `/dj`. Confirmar "Ligar Modo DJ".
2. Ligar. Confirmar o toast "Modo DJ ligado 🎧", "Tocando agora" com uma música da playlist do demo, e "Nenhum pedido esperando: a playlist segue".
3. Pedidos de alunos chegam na Task 12. Por ora, conferir que "Desligar" pede confirmação e que, ao confirmar, a tela volta para "Ligar Modo DJ".
4. Ligar de novo. Em outra aba, entrar como outro organizador ou professor do seed, se houver, e abrir `/dj`. Confirmar "{Ana Xote} está de DJ agora" e "Assumir o Modo DJ". Se o seed não tiver um segundo professor, conferir o caminho "ocupado" pelos testes do banco (Task 2) e do demo (Task 8), e registrar isso no relatório da task.
5. `read_console_messages` com `onlyErrors`: nenhum erro.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DJPage.tsx
git commit -m "Tela do Modo DJ

Ligar (ou assumir de outro professor, com confirmacao), ver o que esta
tocando e de quem e o pedido, a proxima do rodizio e a fila inteira com
cancelar. Avisos de Spotify parado ou sem Premium vem da sessao. Recarga
a cada 30 s so com a aba visivel; a tela nao precisa ficar aberta para
as musicas irem."
```

---

### Task 12: Tela "Pedir música" e cartão no feed

**Files:**
- Modify (substituir inteiro): `src/pages/MusicaPage.tsx`
- Create: `src/components/PedidosAbertos.tsx`
- Modify: `src/pages/FeedPage.tsx` (montar o cartão)

**Interfaces:**
- Consumes:
  - `useAtualizacaoPeriodica` (Task 10); `diaDaNoite` (`src/lib/dates.ts`);
  - `sessaoDJAberta`, `filaDaNoite`, `pedidosDaNoite`, `buscarMusicas`, `pedirMusica`, `cancelarPedido` (Task 7);
  - `checkinsDe(userId)`, que já existe e devolve `{ criado_em, locais, presencaAnulada }[]`.

- [ ] **Step 1: Escrever a tela**

Substituir `src/pages/MusicaPage.tsx` por:

```tsx
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { diaDaNoite } from '../lib/dates'
import type { FaixaSpotify, PedidoMusica, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'

function Capa({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-preto/5">
      🎵
    </span>
  )
}

/** "toca daqui a ~N músicas" a partir da posição no rodízio. */
function quando(posicao: number): string {
  if (posicao === 1) return 'é a próxima!'
  const antes = posicao - 1
  return `toca daqui a ~${antes} ${antes === 1 ? 'pedido' : 'pedidos'}`
}

export function MusicaPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const [sessao, setSessao] = useState<SessaoDJ | null | undefined>(undefined)
  const [fila, setFila] = useState<PedidoNaFila[]>([])
  const [pedidos, setPedidos] = useState<PedidoMusica[]>([])
  const [temCheckin, setTemCheckin] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<FaixaSpotify[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [pedindo, setPedindo] = useState<string | null>(null)
  // Check-in não "desaparece": confirmado uma vez na noite, não consulta mais
  const checkinConfirmadoNa = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    const s = await api.sessaoDJAberta()
    setSessao(s)
    if (!s || !userId) {
      setFila([])
      setPedidos([])
      return
    }
    const [f, p] = await Promise.all([api.filaDaNoite(), api.pedidosDaNoite()])
    setFila(f)
    setPedidos(p)
    if (checkinConfirmadoNa.current !== s.noite) {
      const cs = await api.checkinsDe(userId)
      const tem = cs.some(
        (c) => !c.presencaAnulada && diaDaNoite(new Date(c.criado_em)) === s.noite,
      )
      setTemCheckin(tem)
      if (tem) checkinConfirmadoNa.current = s.noite
    }
  }, [api, userId])
  useAtualizacaoPeriodica(carregar, 30_000)

  // Só ao enviar o formulário: buscar a cada tecla multiplicaria as
  // chamadas (e os logs) por dez
  const buscar = async (e: FormEvent) => {
    e.preventDefault()
    if (termo.trim().length < 2) return
    setBuscando(true)
    try {
      setResultados(await api.buscarMusicas(termo))
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setBuscando(false)
    }
  }

  const pedir = async (f: FaixaSpotify) => {
    setPedindo(f.uri)
    try {
      await api.pedirMusica(f)
      toast('Pedido feito! 🎶')
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setPedindo(null)
    }
  }

  const cancelar = async (p: PedidoNaFila) => {
    try {
      await api.cancelarPedido(p.id)
      await carregar()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  if (sessao === undefined) return <Spinner texto="Carregando os pedidos…" />
  if (sessao === null) {
    return (
      <div className="card space-y-2 p-5">
        <h1 className="text-lg font-extrabold">Pedir música 🎶</h1>
        <p className="text-sm text-tinta-700">
          Os pedidos abrem quando um professor liga o Modo DJ no Espaço Livre.
        </p>
      </div>
    )
  }

  const jaPedidas = new Set(pedidos.map((p) => p.uri))
  const meus = fila.filter((p) => p.user_id === userId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Pedir música 🎶</h1>
        <p className="text-sm text-tinta-600">DJ: {sessao.dj_nome}</p>
      </div>

      {sessao.tocando && (
        <div className="card flex items-center gap-3 p-4">
          <Capa url={sessao.tocando.capa_url} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-tinta-500">Tocando agora</p>
            <p className="truncate font-bold">{sessao.tocando.titulo}</p>
            <p className="truncate text-xs text-tinta-600">
              {sessao.tocando.artista}
              {sessao.tocando.pedido_por && ` · pedida por ${sessao.tocando.pedido_por}`}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={(e) => void buscar(e)} className="flex gap-2">
        <input
          className="input flex-1"
          aria-label="Buscar música"
          placeholder="Música ou artista"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={buscando || termo.trim().length < 2}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {resultados !== null && (
        <div className="card divide-y divide-preto/10">
          {resultados.length === 0 && (
            <p className="p-4 text-sm text-tinta-600">Nada encontrado. Tente outro nome.</p>
          )}
          {resultados.map((f) => (
            <div key={f.uri} className="flex items-center gap-3 p-3">
              <Capa url={f.capa_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{f.titulo}</p>
                <p className="truncate text-xs text-tinta-500">{f.artista}</p>
              </div>
              {jaPedidas.has(f.uri) ? (
                <span className="shrink-0 text-xs text-tinta-500">Já pedida hoje</span>
              ) : !temCheckin ? (
                <Link to="/checkin" className="shrink-0 text-xs font-bold text-brasa-700 underline">
                  Faça seu check-in para pedir
                </Link>
              ) : (
                <button
                  className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                  disabled={pedindo !== null}
                  onClick={() => void pedir(f)}
                >
                  {pedindo === f.uri ? 'Pedindo…' : 'Pedir'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {meus.length > 0 && (
        <div className="card divide-y divide-preto/10">
          <p className="p-4 text-xs font-bold uppercase text-tinta-500">Meus pedidos</p>
          {meus.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.titulo}</p>
                <p className="text-xs text-tinta-500">{quando(p.posicao)}</p>
              </div>
              <button
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-tinta-600 hover:bg-preto/5"
                onClick={() => void cancelar(p)}
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card divide-y divide-preto/10">
        <p className="p-4 text-xs font-bold uppercase text-tinta-500">Próximas</p>
        {fila.length === 0 && (
          <p className="p-4 text-sm text-tinta-600">Nenhum pedido esperando — peça o seu!</p>
        )}
        {fila.slice(0, 5).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <span className="w-6 text-center text-sm font-bold text-tinta-500">{p.posicao}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.titulo}</p>
              <p className="truncate text-xs text-tinta-500">pedida por {p.nome}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escrever o cartão do feed**

Criar `src/components/PedidosAbertos.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { SessaoDJ } from '../lib/types'

/**
 * "Pedidos de música abertos" no topo do feed, enquanto há DJ ligado.
 *
 * Uma consulta ao abrir o feed e outra quando a pessoa volta ao app
 * depois de mais de 2 minutos — o mesmo gatilho que o feed já usa. Sem
 * tempo real: foi o tempo real que estourou a cota de logs (migração 028).
 */
export function PedidosAbertos() {
  const { api } = useAuth()
  const [sessao, setSessao] = useState<SessaoDJ | null>(null)
  const ultima = useRef(0)

  useEffect(() => {
    let cancelado = false
    const carregar = () => {
      ultima.current = Date.now()
      void api
        .sessaoDJAberta()
        .then((s) => {
          if (!cancelado) setSessao(s)
        })
        // Sem a migração 029, simplesmente não aparece
        .catch(() => {})
    }
    carregar()
    const aoVoltar = () => {
      if (!document.hidden && Date.now() - ultima.current > 2 * 60 * 1000) carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [api])

  if (!sessao) return null

  return (
    <Link to="/musica" className="card flex items-center gap-3 border-brasa-500/40 p-4">
      <span className="text-2xl">🎶</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">Pedidos de música abertos</p>
        <p className="truncate text-xs text-tinta-600">
          DJ: {sessao.dj_nome}
          {sessao.tocando ? ` · tocando ${sessao.tocando.titulo}` : ''}
        </p>
      </div>
      <span className="btn-primary shrink-0 px-3 py-1.5 text-xs">Pedir música</span>
    </Link>
  )
}
```

Em `src/pages/FeedPage.tsx`:
1. Importar `import { PedidosAbertos } from '../components/PedidosAbertos'`.
2. Montar `<PedidosAbertos />` logo depois de `<PedirNome />`, antes de `<InstallPrompt />`.

- [ ] **Step 3: Conferir**

Run: `npx tsc -p tsconfig.json --noEmit && npm test`
Expected: sem erros.

- [ ] **Step 4: Verificar no navegador (modo demonstração), o fluxo inteiro**

1. Como Ana: conectar o Spotify (se preciso) e ligar o Modo DJ em `/dj`.
2. Sair e entrar como Maria (`11 98888-0001`). No feed, confirmar o cartão "Pedidos de música abertos — DJ: Ana Xote".
3. Abrir o cartão (`/musica`). Buscar `xodo` e confirmar "Eu Só Quero um Xodó" e "Xodó" na lista.
4. Sem check-in na noite: o botão aparece como "Faça seu check-in para pedir". Se a Maria do seed já tiver check-in hoje, o botão é "Pedir" e este passo vale para outra aluna.
5. Fazer um check-in pela tela de check-in, ou acrescentar um check-in de agora pelo `localStorage` (`fds-demo-db-v10` → `checkins`) e recarregar. Pedir 2 músicas e confirmar o toast "Pedido feito! 🎶". Elas aparecem em "Meus pedidos" com "é a próxima!" e "toca daqui a ~1 pedido".
6. Buscar uma das músicas pedidas e confirmar "Já pedida hoje".
7. Esperar ~25 s com a aba visível. A tela recarrega sozinha, e "Tocando agora" mostra o pedido da Maria com "pedida por Maria Bonita".
8. Voltar como Ana em `/dj`. Confirmar a fila andando e o "pedida por" no "Tocando agora".
9. Em `/perfil` da Maria, depois de uma música tocada, confirmar o distintivo 🎵 "Primeira música tocada".
10. Desligar o Modo DJ como Ana. Como Maria, confirmar que o cartão some do feed depois de recarregar.
11. `read_console_messages` com `onlyErrors`: nenhum erro.
12. Tirar screenshot de `/musica` com fila e de `/dj` como prova.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MusicaPage.tsx src/components/PedidosAbertos.tsx src/pages/FeedPage.tsx
git commit -m "Tela de pedir musica e cartao no feed

Busca so ao enviar, com 'ja pedida hoje' e o atalho para o check-in
quando falta. Meus pedidos mostram quando tocam e podem ser cancelados;
Proximas deixa o rodizio visivel com quem pediu. O cartao do feed
aparece so com DJ ligado e consulta ao abrir e ao voltar depois de 2
minutos, sem tempo real."
```

---

### Task 13: Implantação, documentação e teste de ponta a ponta

**Files:**
- Modify: `supabase/migracoes/029-pedidos-de-musica.sql` (bloco de implantação no topo)
- Modify: `supabase/conferir-migracoes.sql` (linha da 029)
- Modify: `DESIGN.md` (conceitos novos)

**Interfaces:**
- Consumes: tudo das Tasks 1–12.

- [ ] **Step 1: Bloco de implantação no topo da migração**

Em `supabase/migracoes/029-pedidos-de-musica.sql`, trocar a linha `-- Rode no SQL Editor. Pode rodar mais de uma vez.` do cabeçalho por:

```sql
-- IMPLANTAÇÃO (nesta ordem)
--
-- 1. Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--    Confira com supabase/conferir-migracoes.sql (linha 029).
--
-- 2. Segredos das Edge Functions (Dashboard → Edge Functions → Secrets,
--    ou no terminal). O Client Secret vai SÓ para lá — nunca para o
--    repositório, nem para o chat:
--      npx supabase secrets set SPOTIFY_CLIENT_ID=b50dd222d8e9498faf4744ed49a799dd
--      npx supabase secrets set SPOTIFY_CLIENT_SECRET=<cole aqui o Client Secret>
--
-- 3. Publique as três funções:
--      npx supabase functions deploy spotify-buscar
--      npx supabase functions deploy spotify-conectar
--      npx supabase functions deploy dj-loop
--
-- 4. Agende o loop (troque SEU-PROJETO e SUA_SERVICE_ROLE_KEY, como na
--    limpeza de fotos da migração 006). Sem sessão de DJ aberta o banco
--    só avalia o `where exists` — nenhuma chamada, nenhum log de API:
--
--      create extension if not exists pg_cron;
--      create extension if not exists pg_net;
--      select cron.unschedule('dj-loop')
--      where exists (select 1 from cron.job where jobname = 'dj-loop');
--      select cron.schedule('dj-loop', '* * * * *', $cron$
--        select net.http_post(
--          url := 'https://SEU-PROJETO.supabase.co/functions/v1/dj-loop',
--          headers := '{"Authorization": "Bearer SUA_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
--        )
--        where exists (select 1 from public.dj_sessoes where fechada_em is null);
--      $cron$);
--
-- 5. No painel do Spotify (developer.spotify.com → app → User
--    Management), cadastre o e-mail Spotify de cada professor que vai
--    ser DJ. Máximo de 5 no modo de desenvolvimento.
```

- [ ] **Step 2: Linha de conferência**

Em `supabase/conferir-migracoes.sql`, acrescentar uma linha depois da última (`'028 — …'`), no mesmo formato (não esquecer a vírgula depois do parêntese da 028):

```sql
  (
    '029 — pedidos de musica no Espaco Livre (Modo DJ)',
    to_regclass('public.pedidos_musica') is not null
      and exists (select 1 from pg_proc where proname = 'reservar_proximo_pedido')
  )
```

- [ ] **Step 3: Conceitos no DESIGN.md**

Em `DESIGN.md`, na tabela de "Conceitos próprios do domínio", logo depois da linha **Revisão de presença**, acrescentar:

```markdown
| **Modo DJ** | O professor conecta o próprio Spotify Premium (até 5 contas, limite do modo de desenvolvimento do Spotify) e liga o Modo DJ no Espaço Livre. Um loop no servidor (pg_cron a cada minuto, só com DJ ligado) põe um pedido por vez na fila do Spotify dele; a playlist padrão segue entre os pedidos. Uma sessão por vez; outro professor pode assumir (migração 029) |
| **Pedido de música** | Só quem fez check-in na noite (não anulado) pede, pela busca do app. A mesma música não entra duas vezes na noite. Conta para o distintivo "DJ do Espaço Livre" só o pedido que o loop viu tocando |
| **Rodízio da fila** | Uma música de cada pessoa por rodada: vence a menor rodada (enviados da pessoa na noite + posição entre os que ela tem esperando); empate, quem fez o primeiro pedido da noite antes. Quem pede 20 não toca duas antes de quem pediu uma. Definida em `fila_da_noite` (banco) e repetida em `lib/filaMusica.ts` (demo) |
```

- [ ] **Step 4: Verificação final local**

Run: `npm test && npm run build`
Expected: todos os testes passam; build sem erros.

Rodar também `git status` e conferir que nenhum `.env`, segredo ou arquivo do teste descartável entrou.

- [ ] **Step 5: Commit**

```bash
git add supabase/migracoes/029-pedidos-de-musica.sql supabase/conferir-migracoes.sql DESIGN.md
git commit -m "Pedidos de musica: passos de implantacao e documentacao

Topo da migracao 029 com a ordem de implantacao: rodar o SQL, segredos
(Client Secret so no Supabase), publicar as tres funcoes, agendar o loop
e liberar os professores no painel do Spotify. Linha de conferencia da
029 e os conceitos novos no DESIGN.md."
```

- [ ] **Step 6: Entregar ao Felipe os passos de implantação e PARAR**

Mostrar ao Felipe os 5 passos do topo da migração e esperar ele confirmar que fez. **Não** fazer merge na `main`.

- [ ] **Step 7: Teste de ponta a ponta com o Spotify real (com o Felipe)**

Depois da implantação, com o app em `https://forro-de-segunda.vercel.app` (ou local em `http://127.0.0.1:5173`, com `npm run dev -- --host 127.0.0.1` e o `.env` apontando para o Supabase):

1. **Conectar:** o Felipe, logado com cargo de professor ou como organizador, conecta o Spotify em Conta. Esperado: "Spotify conectado! 🎧".
2. **Ligar:** ele dá play numa playlist no celular e liga o Modo DJ. Esperado: em até 1 minuto, "Tocando agora" mostra a música da playlist.
3. **Pedir de duas contas:** com duas contas de aluno com check-in na noite, a conta A pede 3 músicas e, depois, a conta B pede 1.
4. **Conferir a ordem no Spotify:** A1, B1, A2, A3, com a playlist voltando depois.
5. **Conferir o aluno:** em `/musica`, "Tocando agora" mostra "pedida por …".
6. **Conferir o distintivo:** em até 1 minuto depois de começar a tocar, a conta A ganha 🎵.
7. **Conferir o banco:** no SQL Editor, `select status, count(*) from pedidos_musica group by 1` mostra os pedidos como `tocou`. E `select * from cron.job_run_details order by start_time desc limit 5` não tem erro.
8. **Desligar:** desligar o Modo DJ. Confirmar que o cartão do feed some e que o cron para de chamar a função (`net._http_response` sem chamadas novas).

Se algum passo falhar, investigar com o `superpowers:systematic-debugging` antes de mexer no código. Só depois de tudo passar, perguntar ao Felipe se pode subir para a `main`.
