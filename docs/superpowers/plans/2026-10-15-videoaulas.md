# Vídeo-aulas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os alunos assistem aos vídeos dos passos ensinados na trilha do seu nível. Cada vídeo abre na data da aula da turma, os níveis anteriores ficam abertos para revisão e o próximo passo pode ser adiantado com chaves ganhas por presença e parceria. Professores mantêm tudo pelo celular.

**Architecture:**
- **Banco (migração 036):** guarda só metadados:
  - `trilha_passos`: nível, ordem, nome, IDs do YouTube e dica;
  - `trilha_liberacoes`: chaves gastas;
  - colunas novas em `turmas` (`nivel`, `trilha_inicio`) e em `events` (`reposicao_de`);
  - funções SQL para editar a turma e gastar chave, com teto de pontos.
- **Lógica pura (`src/lib/trilha.ts`):** calcula o calendário de cada turma a partir da Agenda (eventos semanais, cancelamentos e reposições), a situação de cada passo para o aluno e o saldo de chaves. A presença sai de `datasDePresenca`, a mesma do perfil.
- **App:** um hook (`useTrilha`), as telas do aluno (`/trilha`, `/trilha/:id`), um cartão na tela Hoje, as telas de gestão (`/trilha/gerenciar/...`) e a reposição no cancelamento da Agenda.

**Tech Stack:**
- React 18 + Vite 6 + TypeScript + Tailwind v4;
- Supabase (Postgres, RLS);
- YouTube (embed `youtube-nocookie.com`);
- Vitest 3 + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-15-videoaulas-design.md` (design visual: https://claude.ai/artifact/PEnPHf9Y9BpHKFqkMuYcUG)

## Global Constraints

- **Branch:** trabalhar em `Dev`. Nunca fazer merge/push para `main` sem o Felipe pedir.
- **Commits:**
  - mensagem em português, sem acentos, com o porquê;
  - **sem** trailer `Co-Authored-By` e sem menção ao Claude.
- **Textos de tela:** em português, com acentos, no tom do app.
- **Banco em produção:** nunca rodar `schema.sql`. A mudança vai em `supabase/migracoes/036-trilha-de-videos.sql`, que pode ser rodada mais de uma vez. Depois de rodar: "Reload schema cache".
- **App sem a migração:** precisa continuar funcionando. Toda leitura nova cai em lista vazia com `.catch(() => [])`, e a tela mostra "A trilha ainda não foi configurada".
- **API dupla:** todo método novo do `ForroApi` existe em `SupabaseApi` **e** em `DemoApi`.
- **Vídeos:** só o ID de 11 caracteres do YouTube (`^[A-Za-z0-9_-]{11}$`). Nenhum arquivo de vídeo no Supabase.
- **Níveis:** `'iniciante' | 'intermediario' | 'avancado'`, nessa ordem.
- **Chaves:** `PONTOS_POR_CHAVE = 3`, `ANTECEDENCIA_CHAVE_DIAS = 7`, contadas desde o último "Encerrar semestre".
- **Quem edita a trilha:** papel `organizador`, cargo `Professor(a)` ou `Diretor(a) de Ensino`, ou quem tem alguma `turma_professores`.
- **Fuso:** a "noite" vira às 5h (`diaDaNoite` no app, `noite_do_checkin` no banco). Datas de aula são strings `"YYYY-MM-DD"`, com contas sempre em UTC (`Date.UTC`) para o fuso do aparelho não mudar o dia.
- **Cota:** nenhuma assinatura de tempo real nova e nenhuma atualização periódica.

## Review Focus

1. **Gasto duplo de chave:** um aluno com 1 chave tenta liberar dois passos, por toques rápidos ou por duas abas. O segundo precisa ser recusado. Teste: duas liberações seguidas com saldo para uma, a segunda falha (Task 1). A função usa `pg_advisory_xact_lock` por usuário.
2. **Professor apaga um passo que alguém liberou com chave:** a chave volta para o aluno, porque a liberação apaga em cascata. Teste na Task 1.
3. **Link colado de jeitos diferentes:** `youtu.be/ID?si=…`, `m.youtube.com/watch?v=ID&t=30`, `/shorts/ID` ou só o ID. Todos precisam virar o mesmo ID, e um link de playlist ou de outro site precisa ser recusado com mensagem. Testes de `idDoYoutube` (Task 2).
4. **Turma sem nível ou sem data de início, aluno sem turma, nível sem passos:** a tela não pode quebrar e precisa dizer o que falta. Testes de `situacaoDoNivel`/`nivelDoAluno` (Task 2).
5. **Cancelamento de outra turma ou num dia sem aula da turma:** não pode empurrar a trilha. Evento de data única que não é reposição (ex.: Forró na Rep da turma) não pode contar como aula. Testes de `aulasDaTurma` (Task 2).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migracoes/036-trilha-de-videos.sql` | tabelas, colunas, RLS e funções |
| `tests/sql/banco.ts` | base mínima ganha `turmas`, `events`, `duplas`, `semestres`, `turma_professores` + migração 036 |
| `tests/sql/trilha.test.ts` | regras do banco |
| `src/lib/types.ts` | `NivelTrilha`, `PassoTrilha`, `LiberacaoTrilha`; campos novos em `Turma`, `AgendaEvent`, `FeriadoInput` |
| `src/lib/trilha.ts` | lógica pura (YouTube, calendário, situação, chaves, permissão) |
| `tests/lib/trilha.test.ts` | testes da lógica pura |
| `src/lib/api.ts`, `src/lib/supabaseApi.ts`, `src/lib/demoApi.ts` | métodos novos e ajustes em turmas, eventos e feriados |
| `tests/lib/demoTrilha.test.ts` | demo: chave e reposição |
| `src/lib/useTrilha.ts` | carrega e monta o contexto do aluno |
| `src/components/Icone.tsx` | ícones `play` e `chave` |
| `src/components/FolhaChave.tsx` | folha "Liberar com chave" |
| `src/components/CartaoTrilha.tsx` | cartão na tela Hoje |
| `src/pages/TrilhaPage.tsx`, `src/pages/PassoPage.tsx` | telas do aluno |
| `src/pages/trilha/GerenciarTrilhaPage.tsx`, `EditarPassoPage.tsx`, `CronogramaPage.tsx`, `SoEquipeTrilha.tsx` | gestão no celular |
| `src/pages/painel/AgendaPainelPage.tsx` | cancelar com reposição |
| `src/App.tsx`, `src/pages/HojePage.tsx`, `src/pages/ProfilePage.tsx`, `src/pages/painel/HubPage.tsx` | rotas e atalhos |

---

### Task 1: Migração 036 e regras do banco

**Files:**
- Create: `supabase/migracoes/036-trilha-de-videos.sql`
- Modify: `tests/sql/banco.ts` (constante `MIGRACOES` e `BASE`)
- Test: `tests/sql/trilha.test.ts`

**Interfaces:**
- Produces (SQL):
  - tabela `trilha_passos(id, nivel, ordem, nome, video_frente, video_condutor, video_conduzida, dica, pode_chave, criado_em)`;
  - tabela `trilha_liberacoes(user_id, passo_id, criado_em)`;
  - `turmas.nivel text`, `turmas.trilha_inicio date`, `events.reposicao_de date`;
  - `pode_editar_trilha() → boolean`, `definir_trilha_da_turma(p_turma text, p_nivel text, p_inicio date) → void`, `liberar_passo_com_chave(p_passo uuid) → void`.

- [ ] **Step 1: Ampliar a base de testes**

Em `tests/sql/banco.ts`, acrescentar `'036-trilha-de-videos.sql'` ao fim de `MIGRACOES` e, ao fim da string `BASE`, antes do fechamento da crase:

```sql
create table public.turmas (
  id uuid primary key default gen_random_uuid(), nome text not null unique
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, descricao text, turma text,
  dia_semana int, data date, hora time
);
create table public.duplas (
  id uuid primary key default gen_random_uuid(),
  data date not null, de_user uuid not null, para_user uuid not null,
  confirmada boolean not null default false
);
create table public.semestres (
  id uuid primary key default gen_random_uuid(),
  encerrado_em timestamptz not null default now()
);
create table public.turma_professores (
  user_id uuid not null, turma text not null, primary key (user_id, turma)
);
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/sql/trilha.test.ts`:

```ts
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
     values ('iniciante', $1, 'Passo ' || $1, $2, $3) returning id`,
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

async function liberar(db: PGlite, uid: string, passoId: string) {
  await comoUsuario(db, uid)
  await db.query(`select liberar_passo_com_chave($1)`, [passoId])
}

async function liberacoes(db: PGlite, uid: string) {
  return (await db.query(`select 1 from trilha_liberacoes where user_id = $1`, [uid])).rows.length
}

describe('trilha — gastar chave', () => {
  it('sem pontos, recusa', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    const p = await passo(db)
    await expect(liberar(db, IDS.a, p)).rejects.toThrow('Você ainda não tem chave')
  })

  it('3 noites de check-in valem 1 chave, e só 1', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-12', '2026-10-19'])
    const p1 = await passo(db, { ordem: 1 })
    const p2 = await passo(db, { ordem: 2 })
    await liberar(db, IDS.a, p1)
    await expect(liberar(db, IDS.a, p2)).rejects.toThrow('Você ainda não tem chave')
    expect(await liberacoes(db, IDS.a)).toBe(1)
  })

  it('duas fotos na mesma noite contam uma vez; foto anulada não conta', async () => {
    const db = await bancoComMigracao()
    await pessoa(db, IDS.a, 'Ana')
    await noites(db, IDS.a, ['2026-10-05', '2026-10-05', '2026-10-12'])
    await noites(db, IDS.a, ['2026-10-19'], true)
    await expect(liberar(db, IDS.a, await passo(db))).rejects.toThrow('Você ainda não tem chave')
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
    await expect(liberar(db, IDS.a, await passo(db))).rejects.toThrow('Você ainda não tem chave')
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/sql/trilha.test.ts`
Expected: FAIL. A migração 036 não existe (`ENOENT`).

- [ ] **Step 4: Escrever a migração**

`supabase/migracoes/036-trilha-de-videos.sql`:

```sql
-- ============================================================
-- MIGRAÇÃO 036 — Trilha de vídeo-aulas
--
-- Os vídeos ficam no YouTube (não listados); aqui só o ID, o nome do
-- passo e a ordem. Uma trilha inteira são poucas dezenas de linhas.
--
-- QUANDO UM PASSO ABRE é decidido no app (lib/trilha.ts), a partir da
-- Agenda: a trava é de tela, não de cofre — quem tem o link do YouTube
-- assiste de qualquer jeito. O banco só confere o que dá vantagem a
-- alguém: gastar chave.
--
-- Rode no SQL Editor e depois "Reload schema cache". Pode rodar mais
-- de uma vez.
-- ============================================================

alter table public.turmas
  add column if not exists nivel text
    check (nivel in ('iniciante', 'intermediario', 'avancado')),
  add column if not exists trilha_inicio date;

-- Evento de data única que repõe a aula cancelada nesta data (mesma
-- turma). Conta como aula da trilha no lugar da cancelada.
alter table public.events
  add column if not exists reposicao_de date;

create table if not exists public.trilha_passos (
  id uuid primary key default gen_random_uuid(),
  nivel text not null check (nivel in ('iniciante', 'intermediario', 'avancado')),
  -- Só ordena: a aula nº N é o N-ésimo passo do nível nessa ordem.
  ordem int not null,
  nome text not null check (length(trim(nome)) > 0),
  video_frente text check (video_frente ~ '^[A-Za-z0-9_-]{11}$'),
  video_condutor text check (video_condutor ~ '^[A-Za-z0-9_-]{11}$'),
  video_conduzida text check (video_conduzida ~ '^[A-Za-z0-9_-]{11}$'),
  dica text,
  pode_chave boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists trilha_passos_nivel_idx on public.trilha_passos (nivel, ordem);

-- Chaves gastas. Apagar o passo devolve a chave (cascade).
create table if not exists public.trilha_liberacoes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passo_id uuid not null references public.trilha_passos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, passo_id)
);

create or replace function public.pode_editar_trilha()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_organizador()
    or exists (
      select 1 from profile_cargos
      where user_id = auth.uid()
        and cargo in ('Professor(a)', 'Diretor(a) de Ensino')
    )
    or exists (select 1 from turma_professores where user_id = auth.uid())
  );
$$;

alter table public.trilha_passos enable row level security;
alter table public.trilha_liberacoes enable row level security;

drop policy if exists "trilha_passos_select" on public.trilha_passos;
drop policy if exists "trilha_passos_insert" on public.trilha_passos;
drop policy if exists "trilha_passos_update" on public.trilha_passos;
drop policy if exists "trilha_passos_delete" on public.trilha_passos;
create policy "trilha_passos_select" on public.trilha_passos
  for select to authenticated using (true);
create policy "trilha_passos_insert" on public.trilha_passos
  for insert to authenticated with check (pode_editar_trilha());
create policy "trilha_passos_update" on public.trilha_passos
  for update to authenticated using (pode_editar_trilha()) with check (pode_editar_trilha());
create policy "trilha_passos_delete" on public.trilha_passos
  for delete to authenticated using (pode_editar_trilha());

-- Sem policy de insert: só liberar_passo_com_chave escreve.
drop policy if exists "trilha_liberacoes_select" on public.trilha_liberacoes;
create policy "trilha_liberacoes_select" on public.trilha_liberacoes
  for select to authenticated using (user_id = auth.uid() or pode_editar_trilha());

/** Nível e primeira aula da trilha de uma turma (professores e organização). */
create or replace function public.definir_trilha_da_turma(
  p_turma text, p_nivel text, p_inicio date
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar_trilha() then
    raise exception 'Só professores e a organização editam a trilha';
  end if;
  update turmas set nivel = p_nivel, trilha_inicio = p_inicio where nome = p_turma;
  if not found then
    raise exception 'Turma não encontrada';
  end if;
end;
$$;

create or replace function public.inicio_semestre_trilha()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(max(encerrado_em), '-infinity'::timestamptz) from semestres;
$$;

/**
 * Teto dos pontos de chave no semestre. Conta POR CIMA do app: aqui
 * vale qualquer noite com check-in não anulado, lá só a presença na
 * janela de um desafio. Assim o banco nunca recusa uma chave que o app
 * mostrou, e ainda barra quem chamar a função sem ter ido ao forró.
 */
create or replace function public.teto_pontos_trilha(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  with corte as (
    select inicio_semestre_trilha() as t,
           (inicio_semestre_trilha() at time zone 'America/Sao_Paulo')::date as d
  ),
  presencas as (
    select count(distinct noite_do_checkin(c.criado_em)) as n
    from checkins c, corte
    where c.user_id = p_uid and not c.presenca_anulada and c.criado_em >= corte.t
  ),
  noites_dupla as (
    select count(distinct du.data) as n
    from duplas du, corte
    where du.de_user = p_uid and du.confirmada and du.data >= corte.d
  ),
  novas as (
    select count(*) as n
    from (
      select min(du.data) as primeira
      from duplas du
      where du.de_user = p_uid and du.confirmada
      group by du.para_user
    ) x, corte
    where x.primeira >= corte.d
  )
  select (presencas.n + noites_dupla.n + novas.n)::int
  from presencas, noites_dupla, novas;
$$;
revoke all on function public.teto_pontos_trilha(uuid) from public;

create or replace function public.liberar_passo_com_chave(p_passo uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_passo trilha_passos;
  v_usadas int;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  -- Dois toques seguidos não gastam a mesma chave duas vezes.
  perform pg_advisory_xact_lock(hashtext('trilha:' || v_uid::text));

  select * into v_passo from trilha_passos where id = p_passo;
  if not found then
    raise exception 'Esse passo não existe mais';
  end if;
  if not v_passo.pode_chave then
    raise exception 'Esse passo só abre depois da aula';
  end if;
  if v_passo.video_frente is null then
    raise exception 'Esse passo ainda não tem vídeo';
  end if;
  if exists (select 1 from trilha_liberacoes where user_id = v_uid and passo_id = p_passo) then
    return;
  end if;

  select count(*) into v_usadas
  from trilha_liberacoes
  where user_id = v_uid and criado_em >= inicio_semestre_trilha();

  if teto_pontos_trilha(v_uid) < 3 * (v_usadas + 1) then
    raise exception 'Você ainda não tem chave';
  end if;

  insert into trilha_liberacoes (user_id, passo_id) values (v_uid, p_passo);
end;
$$;
```

- [ ] **Step 5: Rodar e ver passar (e o resto dos testes de SQL)**

Run: `npx vitest run tests/sql`
Expected: PASS em `trilha.test.ts`, `cargoDJ.test.ts` e `pedidosMusica.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migracoes/036-trilha-de-videos.sql tests/sql/banco.ts tests/sql/trilha.test.ts
git commit -m "Trilha de videos: tabelas e chave conferida no banco (migracao 036)"
```

---

### Task 2: Lógica pura da trilha

**Files:**
- Modify: `src/lib/types.ts` (tipos novos e campos opcionais)
- Create: `src/lib/trilha.ts`
- Test: `tests/lib/trilha.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent`, `Feriado`, `Turma`, `ParceiroDanca`, `Papel` de `types.ts`.
- Produces (`src/lib/trilha.ts`):
  - `NIVEIS`, `NOME_NIVEL`, `PONTOS_POR_CHAVE`, `ANTECEDENCIA_CHAVE_DIAS`;
  - `podeEditarTrilha(p: { papel: Papel; cargos: string[]; turmas_ensino: string[] }): boolean`;
  - `idDoYoutube(link: string): string | null`, `urlDoEmbed(id: string): string`;
  - `somaDias(iso: string, n: number): string`;
  - `ordenarPassos(p: PassoTrilha[]): PassoTrilha[]`;
  - `aulasDaTurma(turma: string, inicio: string, eventos: AgendaEvent[], feriados: Feriado[], ate: string): AulaDaTurma[]`;
  - `cronogramaDaTurma(passosDoNivel: PassoTrilha[], aulas: AulaDaTurma[]): LinhaCronograma[]`;
  - `cronogramaDeTurma(turma: Turma, passos: PassoTrilha[], eventos: AgendaEvent[], feriados: Feriado[]): LinhaCronograma[]`;
  - `nivelDoAluno(ctx: ContextoTrilha): NivelTrilha | null`;
  - `niveisVisiveis(ctx: ContextoTrilha): NivelTrilha[]`;
  - `situacaoDoNivel(nivel: NivelTrilha, ctx: ContextoTrilha): PassoComSituacao[]`;
  - `saldoDeChaves(e: EntradaChaves): SaldoChaves`.

- [ ] **Step 1: Tipos**

Em `src/lib/types.ts`:
- trocar `export interface Turma { id: string; nome: string }` por:

```ts
export interface Turma {
  id: string
  nome: string
  /** Nível da trilha de vídeos (migração 036). null = turma fora da trilha. */
  nivel?: NivelTrilha | null
  /** Primeira aula da trilha ("YYYY-MM-DD"). */
  trilha_inicio?: string | null
}
```

- acrescentar ao fim de `AgendaEvent`:

```ts
  /**
   * Reposição: este evento (data única) repõe a aula cancelada nesta
   * data ("YYYY-MM-DD"). Conta como aula da trilha. Migração 036.
   */
  reposicao_de?: string | null
```

- acrescentar ao fim de `FeriadoInput`:

```ts
  /** Repor a aula em outro dia (só com `turma`): cria o evento de reposição. */
  reposicao?: { data: string; hora: string } | null
```

- e, ao fim do arquivo:

```ts
// ---- Trilha de vídeo-aulas (migração 036) ----
export type NivelTrilha = 'iniciante' | 'intermediario' | 'avancado'

export interface PassoTrilha {
  id: string
  nivel: NivelTrilha
  ordem: number
  nome: string
  /** IDs de 11 caracteres do YouTube. */
  video_frente: string | null
  video_condutor: string | null
  video_conduzida: string | null
  dica: string | null
  pode_chave: boolean
}

export type PassoTrilhaInput = Omit<PassoTrilha, 'id'> & { id?: string }

export interface LiberacaoTrilha {
  passo_id: string
  criado_em: string
}
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/lib/trilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  aulasDaTurma,
  cronogramaDaTurma,
  idDoYoutube,
  nivelDoAluno,
  niveisVisiveis,
  podeEditarTrilha,
  saldoDeChaves,
  situacaoDoNivel,
  type ContextoTrilha,
} from '../../src/lib/trilha'
import type { AgendaEvent, Feriado, PassoTrilha, Turma } from '../../src/lib/types'

const V = 'dQw4w9WgXcQ'

const aulaSeg: AgendaEvent = {
  id: 'e1', titulo: 'Aula', descricao: null, turma: 'Iniciante 01',
  dia_semana: 1, data: null, hora: '20:00',
}
const aulaQua: AgendaEvent = { ...aulaSeg, id: 'e2', turma: 'Iniciante 02', dia_semana: 3, hora: '19:00' }

const feriado = (data: string, turma: string | null): Feriado => ({
  id: `f-${data}`, data, motivo: 'Feriado', turma, suspende_desafios: false,
})

const reposicao = (data: string, de: string, turma = 'Iniciante 01'): AgendaEvent => ({
  id: `r-${data}`, titulo: 'Reposição', descricao: null, turma,
  dia_semana: null, data, hora: '15:00', reposicao_de: de,
})

const passo = (n: number, extra: Partial<PassoTrilha> = {}): PassoTrilha => ({
  id: `p${n}`, nivel: 'iniciante', ordem: n, nome: `Passo ${n}`,
  video_frente: V, video_condutor: null, video_conduzida: null, dica: null,
  pode_chave: true, ...extra,
})

const turmas: Turma[] = [
  { id: 't1', nome: 'Iniciante 01', nivel: 'iniciante', trilha_inicio: '2026-10-05' },
  { id: 't2', nome: 'Iniciante 02', nivel: 'iniciante', trilha_inicio: '2026-10-07' },
  { id: 't3', nome: 'Intermediário', nivel: 'intermediario', trilha_inicio: '2026-10-06' },
]

function ctx(extra: Partial<ContextoTrilha> = {}): ContextoTrilha {
  return {
    passos: [1, 2, 3, 4, 5, 6].map((n) => passo(n)),
    turmas,
    minhasTurmas: ['Iniciante 01'],
    eventos: [aulaSeg, aulaQua],
    feriados: [],
    liberadas: new Set(),
    hoje: '2026-10-20',
    equipe: false,
    ...extra,
  }
}

describe('idDoYoutube', () => {
  it.each([
    [V],
    [`https://youtu.be/${V}?si=abc`],
    [`https://www.youtube.com/watch?v=${V}&t=30`],
    [`https://m.youtube.com/watch?v=${V}`],
    [`youtube.com/shorts/${V}`],
    [`https://www.youtube.com/embed/${V}`],
    [`https://www.youtube.com/live/${V}`],
  ])('%s', (link) => expect(idDoYoutube(link)).toBe(V))

  it.each([
    ['https://www.youtube.com/playlist?list=PL123'],
    ['https://vimeo.com/123456'],
    [''],
    ['abc'],
  ])('recusa %s', (link) => expect(idDoYoutube(link)).toBeNull())
})

describe('aulasDaTurma', () => {
  it('aulas semanais a partir do início', () => {
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [], '2026-10-26')
    expect(r.map((a) => [a.data, a.tipo])).toEqual([
      ['2026-10-05', 'aula'], ['2026-10-12', 'aula'], ['2026-10-19', 'aula'], ['2026-10-26', 'aula'],
    ])
  })

  it('cancelamento da turma ou de todas vira "cancelada"; de outra turma não muda nada', () => {
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg],
      [feriado('2026-10-12', 'Iniciante 01'), feriado('2026-10-19', null), feriado('2026-10-26', 'Iniciante 02')],
      '2026-10-26',
    )
    expect(r.map((a) => a.tipo)).toEqual(['aula', 'cancelada', 'cancelada', 'aula'])
  })

  it('cancelamento num dia sem aula da turma não aparece', () => {
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [feriado('2026-10-07', null)], '2026-10-12')
    expect(r.map((a) => a.data)).toEqual(['2026-10-05', '2026-10-12'])
  })

  it('reposição entra na data dela e marca a cancelada', () => {
    const r = aulasDaTurma(
      'Iniciante 01', '2026-10-19', [aulaSeg, reposicao('2026-10-31', '2026-10-26')],
      [feriado('2026-10-26', 'Iniciante 01')], '2026-11-02',
    )
    expect(r).toEqual([
      { data: '2026-10-19', tipo: 'aula', motivo: null, reposicaoEm: null },
      { data: '2026-10-26', tipo: 'cancelada', motivo: 'Feriado', reposicaoEm: '2026-10-31' },
      { data: '2026-10-31', tipo: 'reposicao', motivo: null, reposicaoEm: null },
      { data: '2026-11-02', tipo: 'aula', motivo: null, reposicaoEm: null },
    ])
  })

  it('evento de data única que não é reposição não conta como aula', () => {
    const rep: AgendaEvent = { ...reposicao('2026-10-10', '2026-10-05'), reposicao_de: null }
    const r = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg, rep], [], '2026-10-12')
    expect(r.map((a) => a.data)).toEqual(['2026-10-05', '2026-10-12'])
  })
})

describe('cronogramaDaTurma', () => {
  const passos = [1, 2, 3, 4, 5].map((n) => passo(n))

  it('sem reposição, os passos seguintes andam uma semana', () => {
    const aulas = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [feriado('2026-10-26', null)], '2026-11-09')
    const c = cronogramaDaTurma(passos, aulas)
    expect(c.map((l) => [l.aula.data, l.passo?.id ?? null])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', 'p2'], ['2026-10-19', 'p3'],
      ['2026-10-26', null], ['2026-11-02', 'p4'], ['2026-11-09', 'p5'],
    ])
  })

  it('com reposição, o passo vai para a reposição e o resto não muda', () => {
    const aulas = aulasDaTurma(
      'Iniciante 01', '2026-10-05', [aulaSeg, reposicao('2026-10-31', '2026-10-26')],
      [feriado('2026-10-26', 'Iniciante 01')], '2026-11-02',
    )
    const c = cronogramaDaTurma(passos, aulas)
    expect(c.filter((l) => l.passo).map((l) => [l.aula.data, l.passo!.id])).toEqual([
      ['2026-10-05', 'p1'], ['2026-10-12', 'p2'], ['2026-10-19', 'p3'],
      ['2026-10-31', 'p4'], ['2026-11-02', 'p5'],
    ])
  })

  it('ordena pela ordem, não pela posição na lista', () => {
    const aulas = aulasDaTurma('Iniciante 01', '2026-10-05', [aulaSeg], [], '2026-10-12')
    const c = cronogramaDaTurma([passo(2), passo(1)], aulas)
    expect(c.map((l) => l.passo?.id)).toEqual(['p1', 'p2'])
  })
})

describe('situacaoDoNivel', () => {
  it('abre na data da aula; o primeiro fechado em até 7 dias vira "chave"', () => {
    const s = situacaoDoNivel('iniciante', ctx())
    expect(s.map((p) => p.estado)).toEqual(['aberto', 'aberto', 'aberto', 'chave', 'bloqueado', 'bloqueado'])
    expect(s[3].data).toBe('2026-10-26')
    expect(s[4].data).toBe('2026-11-02')
  })

  it('liberado com chave abre, e o seguinte longe demais não vira "chave"', () => {
    const s = situacaoDoNivel('iniciante', ctx({ liberadas: new Set(['p4']) }))
    expect(s[3]).toMatchObject({ estado: 'aberto', motivo: 'chave' })
    expect(s[4].estado).toBe('bloqueado')
  })

  it('aluno em duas turmas do nível: vale a data mais cedo', () => {
    // Iniciante 02 (quartas desde 07/10): p3 em 21/10. Iniciante 01: p3 em 19/10.
    const s = situacaoDoNivel('iniciante', ctx({ minhasTurmas: ['Iniciante 01', 'Iniciante 02'], hoje: '2026-10-19' }))
    expect(s[2]).toMatchObject({ estado: 'aberto', data: '2026-10-19' })
  })

  it('passo que só abre depois da aula não vira "chave" nem deixa o seguinte virar', () => {
    const passos = [1, 2, 3, 4, 5].map((n) => passo(n, n === 4 ? { pode_chave: false } : {}))
    const s = situacaoDoNivel('iniciante', ctx({ passos }))
    expect(s[3].estado).toBe('bloqueado')
    expect(s[4].estado).toBe('bloqueado')
  })

  it('passo sem vídeo não vira "chave"', () => {
    const passos = [1, 2, 3, 4].map((n) => passo(n, n === 4 ? { video_frente: null } : {}))
    expect(situacaoDoNivel('iniciante', ctx({ passos }))[3].estado).toBe('bloqueado')
  })

  it('nível abaixo do aluno fica todo aberto (revisão); acima, todo fechado', () => {
    const c = ctx({
      minhasTurmas: ['Intermediário'],
      passos: [passo(1), passo(2), passo(1, { id: 'a1', nivel: 'avancado' })],
    })
    expect(situacaoDoNivel('iniciante', c).map((p) => [p.estado, p.motivo])).toEqual([
      ['aberto', 'revisao'], ['aberto', 'revisao'],
    ])
    expect(situacaoDoNivel('avancado', c)[0]).toMatchObject({ estado: 'bloqueado', data: null })
  })

  it('equipe vê tudo aberto', () => {
    const s = situacaoDoNivel('iniciante', ctx({ minhasTurmas: [], equipe: true }))
    expect(s.every((p) => p.estado === 'aberto' && p.motivo === 'equipe')).toBe(true)
  })

  it('turma sem data de início: nada abre e nada quebra', () => {
    const c = ctx({ turmas: [{ id: 't1', nome: 'Iniciante 01', nivel: 'iniciante', trilha_inicio: null }] })
    const s = situacaoDoNivel('iniciante', c)
    expect(s.every((p) => p.estado === 'bloqueado' && p.data === null)).toBe(true)
  })
})

describe('nivelDoAluno / niveisVisiveis', () => {
  it('maior nível entre as turmas; null sem turma com nível', () => {
    expect(nivelDoAluno(ctx({ minhasTurmas: ['Iniciante 01', 'Intermediário'] }))).toBe('intermediario')
    expect(nivelDoAluno(ctx({ minhasTurmas: ['Turma sem nível'] }))).toBeNull()
  })

  it('aluno vê o próprio nível e os de baixo que têm passos; equipe vê todos que têm passos', () => {
    const passos = [passo(1), passo(1, { id: 'i1', nivel: 'intermediario' }), passo(1, { id: 'a1', nivel: 'avancado' })]
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: ['Intermediário'] }))).toEqual(['iniciante', 'intermediario'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [], equipe: true }))).toEqual(['iniciante', 'intermediario', 'avancado'])
    expect(niveisVisiveis(ctx({ passos, minhasTurmas: [] }))).toEqual([])
  })
})

describe('saldoDeChaves', () => {
  it('presença + noite com dupla + parceria nova, 3 pontos por chave', () => {
    const s = saldoDeChaves({
      presencas: ['2026-10-05', '2026-10-12', '2026-10-12'],
      noitesComDupla: ['2026-10-05', '2026-10-12'],
      parceiros: [
        { user_id: 'b', nome: 'Bia', avatar_url: null, noites: 2, primeira: '2026-10-05' },
        { user_id: 'c', nome: 'Caio', avatar_url: null, noites: 5, primeira: '2026-03-02' },
      ],
      desde: '2026-07-01T12:00:00Z',
      usadas: 1,
    })
    // 2 presenças + 2 noites com dupla + 1 parceria nova = 5
    expect(s).toEqual({ pontos: 5, ganhas: 1, usadas: 1, disponiveis: 0, faltam: 1 })
  })

  it('nunca fica negativo', () => {
    const s = saldoDeChaves({ presencas: [], noitesComDupla: [], parceiros: [], desde: null, usadas: 2 })
    expect(s.disponiveis).toBe(0)
    expect(s.faltam).toBe(3)
  })
})

describe('podeEditarTrilha', () => {
  it('organização, professor, diretor de ensino e quem dá aula', () => {
    expect(podeEditarTrilha({ papel: 'organizador', cargos: [], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Professor(a)'], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Diretor(a) de Ensino'], turmas_ensino: [] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: [], turmas_ensino: ['Iniciante 01'] })).toBe(true)
    expect(podeEditarTrilha({ papel: 'aluno', cargos: ['Membro de RH'], turmas_ensino: [] })).toBe(false)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/lib/trilha.test.ts`
Expected: FAIL com "Failed to resolve import ../../src/lib/trilha".

- [ ] **Step 4: Implementar**

`src/lib/trilha.ts`:

```ts
import type {
  AgendaEvent,
  Feriado,
  NivelTrilha,
  Papel,
  ParceiroDanca,
  PassoTrilha,
  Turma,
} from './types'

/**
 * Trilha de vídeo-aulas: QUANDO cada passo abre para cada aluno.
 *
 * Os vídeos ficam no YouTube (não listados) e a trava é de tela — o
 * banco só confere o gasto de chave (migração 036). Por isso toda a
 * regra de datas mora aqui, como a de presença mora em `presenca.ts`.
 *
 * As datas saem da Agenda: as aulas de uma turma são os eventos
 * semanais dela a partir de `trilha_inicio`, menos os cancelamentos,
 * mais as reposições (evento de data única com `reposicao_de`). A aula
 * nº N da turma é o N-ésimo passo do nível dela.
 */

export const NIVEIS: readonly NivelTrilha[] = ['iniciante', 'intermediario', 'avancado']

export const NOME_NIVEL: Record<NivelTrilha, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

export const PONTOS_POR_CHAVE = 3
export const ANTECEDENCIA_CHAVE_DIAS = 7

const CARGOS_TRILHA = ['Professor(a)', 'Diretor(a) de Ensino']

/** Mesma regra de `pode_editar_trilha()` no banco. */
export function podeEditarTrilha(p: {
  papel: Papel
  cargos: string[]
  turmas_ensino: string[]
}): boolean {
  return (
    p.papel === 'organizador' ||
    p.cargos.some((c) => CARGOS_TRILHA.includes(c)) ||
    p.turmas_ensino.length > 0
  )
}

// ---- YouTube ----

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/

/** ID do vídeo a partir de qualquer link comum do YouTube (ou do próprio ID). */
export function idDoYoutube(link: string): string | null {
  const limpo = link.trim()
  if (ID_YOUTUBE.test(limpo)) return limpo
  let url: URL
  try {
    url = new URL(/^https?:\/\//.test(limpo) ? limpo : `https://${limpo}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v')
    if (!id) {
      const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      id = m ? m[2] : null
    }
  }
  return id && ID_YOUTUBE.test(id) ? id : null
}

export function urlDoEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
}

// ---- Datas ("YYYY-MM-DD", sempre em UTC para o fuso não mudar o dia) ----

function paraUTC(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

export function somaDias(iso: string, n: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function diaDaSemana(iso: string): number {
  return paraUTC(iso).getUTCDay()
}

// ---- Calendário de uma turma ----

export interface AulaDaTurma {
  data: string
  tipo: 'aula' | 'reposicao' | 'cancelada'
  motivo: string | null
  /** Só em "cancelada": dia da reposição, se houve. */
  reposicaoEm: string | null
}

export function ordenarPassos(passos: PassoTrilha[]): PassoTrilha[] {
  return [...passos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
}

/**
 * Aulas da turma de `inicio` até `ate` (inclusive), na ordem.
 *
 * Só conta como aula o evento SEMANAL da turma e a reposição; um evento
 * de data única comum (Forró na Rep) não move a trilha. Cancelamento de
 * outra turma, ou num dia sem aula desta, não aparece.
 */
export function aulasDaTurma(
  turma: string,
  inicio: string,
  eventos: AgendaEvent[],
  feriados: Feriado[],
  ate: string,
): AulaDaTurma[] {
  const datas = new Set<string>()
  for (const e of eventos) {
    if (e.turma !== turma || e.dia_semana === null || e.data) continue
    let d = somaDias(inicio, (e.dia_semana - diaDaSemana(inicio) + 7) % 7)
    for (; d <= ate; d = somaDias(d, 7)) datas.add(d)
  }

  const reposicoes = eventos.filter(
    (e) => e.turma === turma && e.data && e.reposicao_de && e.data >= inicio && e.data <= ate,
  )
  const reposicaoDe = new Map(reposicoes.map((e) => [e.reposicao_de as string, e.data as string]))

  const aulas: AulaDaTurma[] = [...datas].map((data) => {
    const f = feriados.find((x) => x.data === data && (x.turma === null || x.turma === turma))
    return f
      ? { data, tipo: 'cancelada', motivo: f.motivo, reposicaoEm: reposicaoDe.get(data) ?? null }
      : { data, tipo: 'aula', motivo: null, reposicaoEm: null }
  })
  for (const e of reposicoes) {
    aulas.push({ data: e.data as string, tipo: 'reposicao', motivo: null, reposicaoEm: null })
  }
  return aulas.sort(
    (a, b) => a.data.localeCompare(b.data) || Number(b.tipo === 'cancelada') - Number(a.tipo === 'cancelada'),
  )
}

export interface LinhaCronograma {
  aula: AulaDaTurma
  /** null em aula cancelada, ou quando a trilha acabou. */
  passo: PassoTrilha | null
}

export function cronogramaDaTurma(
  passosDoNivel: PassoTrilha[],
  aulas: AulaDaTurma[],
): LinhaCronograma[] {
  const ordem = ordenarPassos(passosDoNivel)
  let i = 0
  return aulas.map((aula) =>
    aula.tipo === 'cancelada' ? { aula, passo: null } : { aula, passo: ordem[i++] ?? null },
  )
}

/** Cronograma completo de uma turma: vai até a última aula com passo. */
export function cronogramaDeTurma(
  turma: Turma,
  passos: PassoTrilha[],
  eventos: AgendaEvent[],
  feriados: Feriado[],
): LinhaCronograma[] {
  if (!turma.nivel || !turma.trilha_inicio) return []
  const doNivel = passos.filter((p) => p.nivel === turma.nivel)
  if (doNivel.length === 0) return []
  // Folga larga: cancelamentos empurram, reposições não encurtam.
  const ate = somaDias(turma.trilha_inicio, 7 * (doNivel.length + 26))
  const linhas = cronogramaDaTurma(
    doNivel,
    aulasDaTurma(turma.nome, turma.trilha_inicio, eventos, feriados, ate),
  )
  const ultima = linhas.map((l) => l.passo !== null).lastIndexOf(true)
  return linhas.slice(0, ultima + 1)
}

// ---- Situação para o aluno ----

export interface ContextoTrilha {
  passos: PassoTrilha[]
  turmas: Turma[]
  /** Nomes das turmas em que a pessoa estuda (`profile.turmas`). */
  minhasTurmas: string[]
  eventos: AgendaEvent[]
  feriados: Feriado[]
  /** Passos liberados com chave. */
  liberadas: ReadonlySet<string>
  /** Dia da noite de hoje ("YYYY-MM-DD"). */
  hoje: string
  /** Professores e organização: veem tudo. */
  equipe: boolean
}

export type EstadoPasso = 'aberto' | 'chave' | 'bloqueado'

export interface PassoComSituacao {
  passo: PassoTrilha
  /** Aula nº na trilha do nível (1, 2, 3…). */
  numero: number
  estado: EstadoPasso
  motivo: 'data' | 'chave' | 'revisao' | 'equipe' | null
  /** Quando abre (ou abriu) para o aluno; null se não há data. */
  data: string | null
}

export function nivelDoAluno(ctx: ContextoTrilha): NivelTrilha | null {
  let maior = -1
  for (const t of ctx.turmas) {
    if (t.nivel && ctx.minhasTurmas.includes(t.nome)) {
      maior = Math.max(maior, NIVEIS.indexOf(t.nivel))
    }
  }
  return maior >= 0 ? NIVEIS[maior] : null
}

/** Abas da trilha: o nível do aluno e os de baixo (revisão), só os que têm passos. */
export function niveisVisiveis(ctx: ContextoTrilha): NivelTrilha[] {
  const comPassos = NIVEIS.filter((n) => ctx.passos.some((p) => p.nivel === n))
  if (ctx.equipe) return comPassos
  const meu = nivelDoAluno(ctx)
  if (!meu) return []
  return comPassos.filter((n) => NIVEIS.indexOf(n) <= NIVEIS.indexOf(meu))
}

export function situacaoDoNivel(nivel: NivelTrilha, ctx: ContextoTrilha): PassoComSituacao[] {
  const passos = ordenarPassos(ctx.passos.filter((p) => p.nivel === nivel))

  // Data mais cedo entre as turmas do aluno neste nível
  const datas = new Map<string, string>()
  for (const t of ctx.turmas) {
    if (t.nivel !== nivel || !ctx.minhasTurmas.includes(t.nome)) continue
    for (const l of cronogramaDeTurma(t, ctx.passos, ctx.eventos, ctx.feriados)) {
      if (!l.passo) continue
      const atual = datas.get(l.passo.id)
      if (!atual || l.aula.data < atual) datas.set(l.passo.id, l.aula.data)
    }
  }

  const meu = nivelDoAluno(ctx)
  const abaixo = meu !== null && NIVEIS.indexOf(nivel) < NIVEIS.indexOf(meu)

  const lista = passos.map((passo, i): PassoComSituacao => {
    const data = datas.get(passo.id) ?? null
    const base = { passo, numero: i + 1, data }
    if (ctx.equipe) return { ...base, estado: 'aberto', motivo: 'equipe' }
    if (abaixo) return { ...base, estado: 'aberto', motivo: 'revisao' }
    if (nivel !== meu) return { ...base, estado: 'bloqueado', motivo: null, data: null }
    if (data && data <= ctx.hoje) return { ...base, estado: 'aberto', motivo: 'data' }
    if (ctx.liberadas.has(passo.id)) return { ...base, estado: 'aberto', motivo: 'chave' }
    return { ...base, estado: 'bloqueado', motivo: null }
  })

  // Só o PRIMEIRO fechado pode virar "chave": ninguém pula a fila.
  const primeiro = lista.find((s) => s.estado === 'bloqueado')
  if (
    primeiro &&
    nivel === meu &&
    primeiro.passo.pode_chave &&
    primeiro.passo.video_frente &&
    primeiro.data &&
    primeiro.data <= somaDias(ctx.hoje, ANTECEDENCIA_CHAVE_DIAS)
  ) {
    primeiro.estado = 'chave'
  }
  return lista
}

// ---- Chaves ----

export interface EntradaChaves {
  /** Dias da noite com presença válida (`datasDePresenca` + `diaDaNoite`). */
  presencas: string[]
  /** Noites ("YYYY-MM-DD") com dupla confirmada. */
  noitesComDupla: string[]
  parceiros: ParceiroDanca[]
  /** Início do semestre (ISO) ou null. */
  desde: string | null
  /** Chaves gastas no semestre. */
  usadas: number
}

export interface SaldoChaves {
  pontos: number
  ganhas: number
  usadas: number
  disponiveis: number
  /** Pontos até a próxima chave (1–3). */
  faltam: number
}

export function saldoDeChaves(e: EntradaChaves): SaldoChaves {
  const corte = e.desde ? e.desde.slice(0, 10) : ''
  const presencas = new Set(e.presencas.filter((d) => d >= corte)).size
  const noites = new Set(e.noitesComDupla.filter((d) => d >= corte)).size
  const novas = e.parceiros.filter((p) => p.primeira && p.primeira >= corte).length
  const pontos = presencas + noites + novas
  const ganhas = Math.floor(pontos / PONTOS_POR_CHAVE)
  return {
    pontos,
    ganhas,
    usadas: e.usadas,
    disponiveis: Math.max(0, ganhas - e.usadas),
    faltam: PONTOS_POR_CHAVE - (pontos % PONTOS_POR_CHAVE),
  }
}
```

- [ ] **Step 5: Rodar e ver passar; checar tipos**

Run: `npx vitest run tests/lib/trilha.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS, sem erros de tipo. Os campos novos de `Turma`/`AgendaEvent`/`FeriadoInput` são opcionais, então nada quebra.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/trilha.ts tests/lib/trilha.test.ts
git commit -m "Trilha de videos: calendario pela agenda, situacao dos passos e saldo de chaves"
```

---

### Task 3: API (Supabase e Demo)

**Files:**
- Modify: `src/lib/api.ts` (interface `ForroApi`)
- Modify: `src/lib/supabaseApi.ts` (`listTurmas` ~2561, `listEvents` ~1716, `saveFeriado` ~1763, `deleteFeriado` ~1774, métodos novos)
- Modify: `src/lib/demoApi.ts` (interface `Db` ~150, `listTurmas` ~2015, `saveFeriado` ~1488, `deleteFeriado` ~1499, métodos novos)
- Test: `tests/lib/demoTrilha.test.ts`

**Interfaces:**
- Consumes: tipos da Task 2. No banco: `trilha_passos`, `trilha_liberacoes`, `definir_trilha_da_turma`, `liberar_passo_com_chave` (Task 1).
- Produces (`ForroApi`):
  - `listPassosTrilha(): Promise<PassoTrilha[]>`
  - `salvarPassoTrilha(p: PassoTrilhaInput): Promise<void>`
  - `removerPassoTrilha(id: string): Promise<void>`
  - `definirTrilhaDaTurma(turma: string, nivel: NivelTrilha | null, inicio: string | null): Promise<void>`
  - `minhasLiberacoes(): Promise<LiberacaoTrilha[]>`
  - `liberarPassoComChave(passoId: string): Promise<void>`
  - `noitesComDupla(userId: string): Promise<string[]>`
  - `listTurmas` passa a trazer `nivel` e `trilha_inicio`; `listEvents` traz `reposicao_de`.
  - `saveFeriado` com `reposicao` cria o evento de reposição; `deleteFeriado` apaga a reposição junto.

- [ ] **Step 1: Escrever o teste do demo que falha**

`tests/lib/demoTrilha.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('DemoApi — trilha de vídeos', () => {
  beforeEach(() => {
    instalarLocalStorage()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T01:00:00.000Z')) // terça 20/10, 22h SP
  })
  afterEach(() => vi.useRealTimers())

  async function novaApi() {
    const { DemoApi } = await import('../../src/lib/demoApi')
    const api = new DemoApi()
    const banco = api as unknown as {
      db: { checkins: Array<Record<string, unknown>> }
      uid(): string
    }
    banco.db.checkins.length = 0
    return { api, banco, uid: banco.uid() }
  }

  it('salva, lista em ordem e remove passos', async () => {
    const { api } = await novaApi()
    const antes = (await api.listPassosTrilha()).length
    await api.salvarPassoTrilha({
      nivel: 'avancado', ordem: 2, nome: 'Sacada', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
    })
    const lista = await api.listPassosTrilha()
    expect(lista).toHaveLength(antes + 1)
    const novo = lista.find((p) => p.nome === 'Sacada')!
    await api.removerPassoTrilha(novo.id)
    expect(await api.listPassosTrilha()).toHaveLength(antes)
  })

  it('chave: recusa sem pontos, libera com 3 noites', async () => {
    const { api, banco, uid } = await novaApi()
    await api.salvarPassoTrilha({
      nivel: 'iniciante', ordem: 99, nome: 'Teste', video_frente: 'dQw4w9WgXcQ',
      video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
    })
    const p = (await api.listPassosTrilha()).find((x) => x.nome === 'Teste')!
    await expect(api.liberarPassoComChave(p.id)).rejects.toThrow('Você ainda não tem chave')
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      banco.db.checkins.push({ id: d, user_id: uid, criado_em: `${d}T23:00:00.000Z`, foto_url: '', legenda: null })
    }
    await api.liberarPassoComChave(p.id)
    expect((await api.minhasLiberacoes()).map((l) => l.passo_id)).toContain(p.id)
  })

  it('cancelar com reposição cria o evento; desfazer apaga os dois', async () => {
    const { api } = await novaApi()
    await api.saveFeriado({
      data: '2026-10-26', motivo: 'Salão ocupado', turma: 'Iniciante 01',
      suspende_desafios: false, reposicao: { data: '2026-10-31', hora: '15:00' },
    })
    const rep = (await api.listEvents()).find((e) => e.reposicao_de === '2026-10-26')
    expect(rep).toMatchObject({ turma: 'Iniciante 01', data: '2026-10-31', hora: '15:00' })
    const f = (await api.listFeriados()).find((x) => x.data === '2026-10-26')!
    await api.deleteFeriado(f.id)
    expect((await api.listEvents()).some((e) => e.reposicao_de === '2026-10-26')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/lib/demoTrilha.test.ts`
Expected: FAIL com "api.listPassosTrilha is not a function".

- [ ] **Step 3: Interface**

Em `src/lib/api.ts`:
- importar `LiberacaoTrilha`, `NivelTrilha`, `PassoTrilha` e `PassoTrilhaInput` de `./types`;
- acrescentar antes de `// ---- Notificações ----`:

```ts
  // ---- Trilha de vídeo-aulas (migração 036) ----
  /** Todos os passos de todos os níveis (poucas dezenas de linhas). */
  listPassosTrilha(): Promise<PassoTrilha[]>
  /** Cria (sem `id`) ou atualiza um passo. Professores e organização. */
  salvarPassoTrilha(p: PassoTrilhaInput): Promise<void>
  removerPassoTrilha(id: string): Promise<void>
  /** Nível e primeira aula da trilha de uma turma. */
  definirTrilhaDaTurma(turma: string, nivel: NivelTrilha | null, inicio: string | null): Promise<void>
  /** Passos que EU liberei com chave. */
  minhasLiberacoes(): Promise<LiberacaoTrilha[]>
  /** Gasta uma chave. O banco recusa sem saldo ("Você ainda não tem chave"). */
  liberarPassoComChave(passoId: string): Promise<void>
  /** Noites ("YYYY-MM-DD") com dupla confirmada de alguém, sem repetir. */
  noitesComDupla(userId: string): Promise<string[]>
```

- [ ] **Step 4: SupabaseApi**

Em `src/lib/supabaseApi.ts`:

`listTurmas`. `select('*')` tolera a falta da migração (as colunas só não vêm):

```ts
  async listTurmas(): Promise<Turma[]> {
    const data = ok(await this.sb.from('turmas').select('*').order('nome')) as Array<Record<string, unknown>>
    return data.map((t) => ({
      id: t.id as string,
      nome: t.nome as string,
      nivel: (t.nivel as NivelTrilha | null | undefined) ?? null,
      trilha_inicio: (t.trilha_inicio as string | null | undefined) ?? null,
    }))
  }
```

`listEvents`: acrescentar ao objeto montado no `map`:

```ts
      reposicao_de: (e.reposicao_de as string | null | undefined) ?? null,
```

`saveFeriado` e `deleteFeriado`:

```ts
  async saveFeriado(f: FeriadoInput) {
    ok(
      await this.sb.from('feriados').insert({
        data: f.data,
        motivo: f.motivo.trim() || null,
        turma: f.turma,
        suspende_desafios: f.suspende_desafios,
      }),
    )
    if (f.reposicao && f.turma) {
      // Sem a migração 036 a coluna não existe: o cancelamento já valeu,
      // e a mensagem diz o que faltou.
      const { error } = await this.sb.from('events').insert({
        titulo: `Reposição · ${f.turma}`,
        descricao: f.motivo.trim() || null,
        turma: f.turma,
        data: f.reposicao.data,
        hora: f.reposicao.hora || null,
        reposicao_de: f.data,
      })
      if (error) throw new Error('Aula cancelada, mas a reposição não foi salva: falta rodar a migração 036')
    }
  }

  async deleteFeriado(id: string) {
    const { data: f } = await this.sb.from('feriados').select('data, turma').eq('id', id).maybeSingle()
    ok(await this.sb.from('feriados').delete().eq('id', id))
    if (f?.turma) {
      // A reposição só existia por causa do cancelamento. Sem a coluna
      // (migração 036 não rodada) não há o que apagar: ignora o erro.
      await this.sb.from('events').delete().eq('turma', f.turma).eq('reposicao_de', f.data)
    }
  }
```

Métodos novos (junto dos de duplas):

```ts
  async listPassosTrilha(): Promise<PassoTrilha[]> {
    const { data, error } = await this.sb
      .from('trilha_passos')
      .select('id, nivel, ordem, nome, video_frente, video_condutor, video_conduzida, dica, pode_chave')
      .order('nivel')
      .order('ordem')
    if (error) return [] // sem a migração 036
    return data as PassoTrilha[]
  }

  async salvarPassoTrilha(p: PassoTrilhaInput) {
    const { id, ...campos } = p
    const linha = { ...campos, nome: campos.nome.trim(), dica: campos.dica?.trim() || null }
    ok(
      id
        ? await this.sb.from('trilha_passos').update(linha).eq('id', id)
        : await this.sb.from('trilha_passos').insert(linha),
    )
  }

  async removerPassoTrilha(id: string) {
    ok(await this.sb.from('trilha_passos').delete().eq('id', id))
  }

  async definirTrilhaDaTurma(turma: string, nivel: NivelTrilha | null, inicio: string | null) {
    const { error } = await this.sb.rpc('definir_trilha_da_turma', {
      p_turma: turma,
      p_nivel: nivel,
      p_inicio: inicio,
    })
    if (error) throw new Error(traduz(error.message))
  }

  async minhasLiberacoes(): Promise<LiberacaoTrilha[]> {
    const uid = await this.requireUid()
    const { data, error } = await this.sb
      .from('trilha_liberacoes')
      .select('passo_id, criado_em')
      .eq('user_id', uid)
    if (error) return []
    return data as LiberacaoTrilha[]
  }

  async liberarPassoComChave(passoId: string) {
    const { error } = await this.sb.rpc('liberar_passo_com_chave', { p_passo: passoId })
    if (error) throw new Error(traduz(error.message))
  }

  async noitesComDupla(userId: string): Promise<string[]> {
    const linhas = await this.duplasConfirmadasDe(userId)
    return [...new Set(linhas.map((l) => l.data))]
  }
```

- [ ] **Step 5: DemoApi**

Em `src/lib/demoApi.ts`:

Na interface `Db`:

```ts
  /** Trilha de vídeos (migração 036) — ausente em bancos demo antigos. */
  trilhaPassos?: PassoTrilha[]
  trilhaLiberacoes?: Array<{ user_id: string; passo_id: string; criado_em: string }>
```

`listTurmas` não muda: os objetos `Turma` do demo passam a poder ter `nivel`/`trilha_inicio`.

`saveFeriado` e `deleteFeriado`:

```ts
  async saveFeriado(f: FeriadoInput) {
    this.db.feriados.push({
      id: uuid(),
      data: f.data,
      motivo: f.motivo.trim() || null,
      turma: f.turma,
      suspende_desafios: f.suspende_desafios,
    })
    if (f.reposicao && f.turma) {
      this.db.events.push({
        id: uuid(),
        titulo: `Reposição · ${f.turma}`,
        descricao: f.motivo.trim() || null,
        turma: f.turma,
        dia_semana: null,
        data: f.reposicao.data,
        hora: f.reposicao.hora || null,
        reposicao_de: f.data,
      })
    }
    this.persist()
  }

  async deleteFeriado(id: string) {
    const f = this.db.feriados.find((x) => x.id === id)
    this.db.feriados = this.db.feriados.filter((x) => x.id !== id)
    if (f?.turma) {
      this.db.events = this.db.events.filter(
        (e) => !(e.turma === f.turma && e.reposicao_de === f.data),
      )
    }
    this.persist()
  }
```

Métodos novos. A semente usa só nomes, sem vídeo, porque o demo não tem IDs reais. A tela mostra "Vídeo em breve".

```ts
  private passosTrilha(): PassoTrilha[] {
    if (!this.db.trilhaPassos) {
      this.db.trilhaPassos = ['Base parada e marcação', 'Dois pra lá, dois pra cá', 'Caminhada', 'Giro simples da dama'].map(
        (nome, i) => ({
          id: uuid(), nivel: 'iniciante' as const, ordem: i + 1, nome,
          video_frente: null, video_condutor: null, video_conduzida: null, dica: null, pode_chave: true,
        }),
      )
    }
    return this.db.trilhaPassos
  }

  async listPassosTrilha(): Promise<PassoTrilha[]> {
    return ordenarPassos(this.passosTrilha())
  }

  async salvarPassoTrilha(p: PassoTrilhaInput) {
    const lista = this.passosTrilha()
    const linha = { ...p, nome: p.nome.trim(), dica: p.dica?.trim() || null }
    if (p.id) {
      const i = lista.findIndex((x) => x.id === p.id)
      if (i < 0) throw new Error('Esse passo não existe mais')
      lista[i] = { ...linha, id: p.id }
    } else {
      lista.push({ ...linha, id: uuid() })
    }
    this.persist()
  }

  async removerPassoTrilha(id: string) {
    this.db.trilhaPassos = this.passosTrilha().filter((p) => p.id !== id)
    this.db.trilhaLiberacoes = (this.db.trilhaLiberacoes ?? []).filter((l) => l.passo_id !== id)
    this.persist()
  }

  async definirTrilhaDaTurma(turma: string, nivel: NivelTrilha | null, inicio: string | null) {
    const t = this.db.turmas.find((x) => x.nome === turma)
    if (!t) throw new Error('Turma não encontrada')
    t.nivel = nivel
    t.trilha_inicio = inicio
    this.persist()
  }

  async minhasLiberacoes(): Promise<LiberacaoTrilha[]> {
    const uid = this.uid()
    return (this.db.trilhaLiberacoes ?? [])
      .filter((l) => l.user_id === uid)
      .map(({ passo_id, criado_em }) => ({ passo_id, criado_em }))
  }

  async liberarPassoComChave(passoId: string) {
    // Espelha liberar_passo_com_chave (migração 036), com o mesmo teto.
    const uid = this.uid()
    const passo = this.passosTrilha().find((p) => p.id === passoId)
    if (!passo) throw new Error('Esse passo não existe mais')
    if (!passo.pode_chave) throw new Error('Esse passo só abre depois da aula')
    if (!passo.video_frente) throw new Error('Esse passo ainda não tem vídeo')
    const libs = (this.db.trilhaLiberacoes = this.db.trilhaLiberacoes ?? [])
    if (libs.some((l) => l.user_id === uid && l.passo_id === passoId)) return
    const desde = (await this.inicioSemestreAtual()) ?? ''
    const corte = desde.slice(0, 10)
    const presencas = new Set(
      this.db.checkins
        .filter((c) => c.user_id === uid && c.presenca_anulada !== true && c.criado_em >= desde)
        .map((c) => diaDaNoite(new Date(c.criado_em))),
    ).size
    const noites = (await this.noitesComDupla(uid)).filter((d) => d >= corte).length
    const novas = (await this.parceirosDe(uid)).filter((p) => p.primeira && p.primeira >= corte).length
    const usadas = libs.filter((l) => l.user_id === uid && l.criado_em >= desde).length
    if (presencas + noites + novas < PONTOS_POR_CHAVE * (usadas + 1)) {
      throw new Error('Você ainda não tem chave')
    }
    libs.push({ user_id: uid, passo_id: passoId, criado_em: new Date().toISOString() })
    this.persist()
  }

  async noitesComDupla(userId: string): Promise<string[]> {
    return [
      ...new Set(
        (this.db.duplas ?? [])
          .filter((d) => d.de_user === userId && d.confirmada)
          .map((d) => d.data),
      ),
    ]
  }
```

Imports novos no demo: `ordenarPassos` e `PONTOS_POR_CHAVE` de `./trilha`, `diaDaNoite` de `./dates` (se ainda não estiver importado) e os tipos `LiberacaoTrilha`, `NivelTrilha`, `PassoTrilha` e `PassoTrilhaInput`.

- [ ] **Step 6: Rodar e ver passar; tudo junto**

Run: `npx vitest run && npx tsc -p tsconfig.json --noEmit`
Expected: todos os testes passam e não há erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/lib/supabaseApi.ts src/lib/demoApi.ts tests/lib/demoTrilha.test.ts
git commit -m "Trilha de videos: API (passos, chaves, turma) e reposicao no cancelamento"
```

---

### Task 4: Reposição no cancelamento da Agenda

**Files:**
- Modify: `src/pages/painel/AgendaPainelPage.tsx` (`FolhaCancelar`, ~365–460)

**Interfaces:**
- Consumes: `FeriadoInput.reposicao` e o `saveFeriado` da Task 3; `Segmentado` de `components/ui`.

- [ ] **Step 1: Estado e campos**

Em `FolhaCancelar`:
- importar `Segmentado` de `../../components/ui`, se ainda não estiver importado;
- depois de `const [salvando, setSalvando] = useState(false)`:

```tsx
  const [repor, setRepor] = useState<'nao' | 'sim'>('nao')
  const [reposicao, setReposicao] = useState({ data: '', hora: '' })
```

- no `useEffect` que reage a `alvo`, logo depois do `setForm(...)`:

```tsx
    setRepor('nao')
    setReposicao({ data: '', hora: '' })
```

- [ ] **Step 2: Salvar com reposição**

Trocar o começo de `salvar`:

```tsx
  const salvar = async () => {
    if (!form.data) {
      toast('Escolha a data', 'erro')
      return
    }
    const comReposicao = repor === 'sim' && form.turma !== null
    if (comReposicao && !reposicao.data) {
      toast('Escolha o dia da reposição', 'erro')
      return
    }
    if (comReposicao && reposicao.data <= form.data) {
      toast('A reposição precisa ser depois da aula cancelada', 'erro')
      return
    }
    setSalvando(true)
    try {
      await api.saveFeriado({ ...form, reposicao: comReposicao ? reposicao : null })
      await Promise.all([recarregar.feriados(), recarregar.eventos?.()])
```

> Se o contexto do painel não tiver `recarregar.eventos`, procurar como `AgendaPainelPage` recarrega a lista de eventos depois de `saveEvent` e chamar a mesma coisa.

- [ ] **Step 3: Escolha e aviso na folha**

Depois do `<Campo rotulo="Motivo" …>…</Campo>` e antes do `<LinhaInterruptor …>`:

```tsx
        {form.turma !== null && (
          <Campo rotulo="A aula vai ser reposta?">
            <Segmentado
              opcoes={[
                { valor: 'nao', rotulo: 'Sem reposição' },
                { valor: 'sim', rotulo: 'Repor em outro dia' },
              ]}
              valor={repor}
              onChange={setRepor}
            />
          </Campo>
        )}
        {form.turma !== null && repor === 'sim' && (
          <div className="grid grid-cols-2 gap-2.5">
            <Campo rotulo="Dia da reposição">
              <input
                type="date"
                className="input"
                value={reposicao.data}
                onChange={(e) => setReposicao({ ...reposicao, data: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Horário">
              <input
                type="time"
                className="input"
                value={reposicao.hora}
                onChange={(e) => setReposicao({ ...reposicao, hora: e.target.value })}
              />
            </Campo>
          </div>
        )}
        <div className="rounded-2xl bg-sf2 px-4 py-3 text-sm leading-snug text-ink2">
          <b className="text-ink">Trilha de vídeos: </b>
          {form.turma === null
            ? 'todas as turmas com aula nesse dia andam uma semana.'
            : repor === 'sim'
              ? 'o passo desta aula vai para o dia da reposição, e nada mais muda. A reposição aparece na agenda da turma.'
              : 'os passos seguintes desta turma andam uma semana.'}
        </div>
```

E trocar o texto do botão:

```tsx
            {salvando ? 'Salvando…' : repor === 'sim' && form.turma !== null ? 'Cancelar e marcar reposição' : 'Cancelar e avisar'}
```

> As classes `bg-sf2`, `text-ink` e `text-ink2` já são tokens do tema (`src/index.css`). Se o nome do utilitário for outro, usar o que `BotaoSuave` usa.

- [ ] **Step 4: Conferir no app (modo demo)**

Run: `npm run dev` pelo `preview_start`. Entrar como organizador no demo e ir em Painel › Agenda › Cancelar a aula de uma turma:
- a escolha de reposição aparece;
- com "Repor em outro dia", a reposição aparece na lista da agenda;
- "Desfazer" o cancelamento apaga a reposição junto.

- [ ] **Step 5: Commit**

```bash
git add src/pages/painel/AgendaPainelPage.tsx
git commit -m "Agenda: cancelar aula com reposicao em outro dia, avisando o efeito na trilha"
```

---

### Task 5: Telas do aluno

**Files:**
- Modify: `src/components/Icone.tsx` (ícones `play`, `chave`)
- Create: `src/lib/useTrilha.ts`
- Create: `src/components/FolhaChave.tsx`
- Create: `src/components/CartaoTrilha.tsx`
- Create: `src/pages/TrilhaPage.tsx`, `src/pages/PassoPage.tsx`
- Modify: `src/App.tsx` (rotas), `src/pages/HojePage.tsx` (cartão), `src/pages/ProfilePage.tsx` (atalho)

**Interfaces:**
- Consumes: Tasks 2 e 3.
- Produces:
  - `useTrilha(): { dados: DadosTrilha | null; erro: string | null; recarregar(): Promise<void>; liberar(passoId: string): Promise<void> }`;
  - `DadosTrilha = { ctx: ContextoTrilha; saldo: SaldoChaves }`.

- [ ] **Step 1: Ícones**

Em `TRACOS` (`src/components/Icone.tsx`), depois de `cadeado`:

```tsx
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  chave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
    </>
  ),
```

- [ ] **Step 2: Hook**

`src/lib/useTrilha.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { diaDaNoite, diasSuspensos, mapaAberturas } from './dates'
import { datasDePresenca } from './presenca'
import { podeEditarTrilha, saldoDeChaves, type ContextoTrilha, type SaldoChaves } from './trilha'
import type { AberturaAntecipada, Challenge, ParceiroDanca } from './types'

export interface DadosTrilha {
  ctx: ContextoTrilha
  saldo: SaldoChaves
}

/**
 * Tudo o que a trilha precisa, numa carga só. Presença pela MESMA regra
 * do perfil (`datasDePresenca`) — se a trilha contasse diferente, o
 * aluno veria um número no perfil e outro aqui.
 */
export function useTrilha() {
  const { api, userId, profile, papel } = useAuth()
  const [dados, setDados] = useState<DadosTrilha | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!userId || !profile) return
    try {
      const [passos, turmas, eventos, feriados, liberacoes, checkins, desafios, aberturas, parceiros, noitesDupla, desde] =
        await Promise.all([
          api.listPassosTrilha(),
          api.listTurmas(),
          api.listEvents(),
          api.listFeriados(),
          api.minhasLiberacoes(),
          api.checkinsDe(userId),
          api.listChallenges().catch(() => [] as Challenge[]),
          api.listAberturas().catch(() => [] as AberturaAntecipada[]),
          api.parceirosDe(userId).catch(() => [] as ParceiroDanca[]),
          api.noitesComDupla(userId).catch(() => [] as string[]),
          api.inicioSemestreAtual().catch(() => null),
        ])
      const presencas = datasDePresenca(checkins, {
        desafios,
        suspensos: diasSuspensos(feriados),
        aberturas: mapaAberturas(aberturas),
      }).map((d) => diaDaNoite(d))
      setDados({
        ctx: {
          passos,
          turmas,
          minhasTurmas: profile.turmas.map((t) => t.turma),
          eventos,
          feriados,
          liberadas: new Set(liberacoes.map((l) => l.passo_id)),
          hoje: diaDaNoite(new Date()),
          equipe: podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino }),
        },
        saldo: saldoDeChaves({
          presencas,
          noitesComDupla: noitesDupla,
          parceiros,
          desde,
          usadas: liberacoes.filter((l) => !desde || l.criado_em >= desde).length,
        }),
      })
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [api, userId, profile, papel])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const liberar = useCallback(
    async (passoId: string) => {
      await api.liberarPassoComChave(passoId)
      await carregar()
    },
    [api, carregar],
  )

  return { dados, erro, recarregar: carregar, liberar }
}
```

> `datasDePresenca` devolve `Date` ao meio-dia local do dia da noite, então `diaDaNoite(d)` devolve exatamente esse dia.

- [ ] **Step 3: Folha "Liberar com chave"**

`src/components/FolhaChave.tsx`:

```tsx
import { useState } from 'react'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/dates'
import { PONTOS_POR_CHAVE, type PassoComSituacao, type SaldoChaves } from '../lib/trilha'
import { BotaoAcao, BotaoSuave, Folha } from './ui'

const GANHOS = [
  ['Presença', 'Cada noite com check-in válido'],
  ['Parceria', 'Noite com dupla confirmada (1 por noite)'],
  ['Nova parceria', 'Primeira dança com alguém no Forródex'],
] as const

export function FolhaChave({
  alvo,
  saldo,
  onFechar,
  onLiberar,
}: {
  alvo: PassoComSituacao | null
  saldo: SaldoChaves
  onFechar: () => void
  onLiberar: (passoId: string) => Promise<void>
}) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const temChave = saldo.disponiveis > 0
  const pontosNaVez = PONTOS_POR_CHAVE - saldo.faltam

  const liberar = async () => {
    if (!alvo) return
    setSalvando(true)
    try {
      await onLiberar(alvo.passo.id)
      toast(`“${alvo.passo.nome}” liberado!`)
      onFechar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={alvo !== null} onFechar={onFechar} titulo={alvo ? `Liberar “${alvo.passo.nome}”?` : undefined}>
      <div className="flex flex-col gap-4 px-5 pb-8">
        {alvo?.data && (
          <p className="text-[15px] leading-snug text-ink2">
            A turma vê esse passo em {formatDate(alvo.data)}.{' '}
            {temChave
              ? `Você usa 1 das suas ${saldo.disponiveis} ${saldo.disponiveis === 1 ? 'chave' : 'chaves'} e assiste antes.`
              : 'Você ainda não tem chave.'}
          </p>
        )}
        <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Como ganhar chaves</span>
          {GANHOS.map(([titulo, desc]) => (
            <div key={titulo} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brasa-300 font-extrabold text-preto">
                +1
              </span>
              <span className="flex flex-col text-sm">
                <b>{titulo}</b>
                <span className="text-xs text-ink2">{desc}</span>
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1.5 border-t border-linha pt-2.5">
            <div className="flex justify-between text-[13px] font-bold text-ink2">
              <span>{PONTOS_POR_CHAVE} pontos = 1 chave</span>
              <span>
                {pontosNaVez} de {PONTOS_POR_CHAVE}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-chip">
              <div
                className="h-full rounded-full bg-brasa-500"
                style={{ width: `${(pontosNaVez / PONTOS_POR_CHAVE) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <BotaoAcao cor="preto" bloco disabled={!temChave || salvando} onClick={() => void liberar()}>
          {salvando ? 'Liberando…' : temChave ? 'Usar 1 chave' : `Faltam ${saldo.faltam} pontos`}
        </BotaoAcao>
        <BotaoSuave tamanho="g" onClick={onFechar}>
          Esperar a turma
        </BotaoSuave>
      </div>
    </Folha>
  )
}
```

> `border-linha`, `bg-sf`, `bg-chip`, `bg-brasa-300` e `bg-brasa-500` são tokens do tema. Conferir em `src/index.css` e trocar por nomes vizinhos se algum não existir.

- [ ] **Step 4: Tela da trilha**

`src/pages/TrilhaPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolhaChave } from '../components/FolhaChave'
import { Icone } from '../components/Icone'
import { Cabecalho, Segmentado, Tela } from '../components/ui'
import { formatDate } from '../lib/dates'
import {
  NOME_NIVEL,
  nivelDoAluno,
  niveisVisiveis,
  situacaoDoNivel,
  type PassoComSituacao,
} from '../lib/trilha'
import type { NivelTrilha } from '../lib/types'
import { useTrilha } from '../lib/useTrilha'

function detalhe(s: PassoComSituacao): string {
  if (s.estado === 'aberto') {
    if (!s.passo.video_frente) return 'Vídeo em breve'
    if (s.motivo === 'revisao') return 'Revisão'
    if (s.motivo === 'chave') return 'Liberado com chave'
    return s.data ? `Aula de ${formatDate(s.data)}` : 'Aberto'
  }
  if (s.estado === 'chave') return `Libera ${formatDate(s.data!)} · ou 1 chave`
  return s.data ? `Libera ${formatDate(s.data)}` : 'Abre com a turma'
}

export function TrilhaPage() {
  const { dados, erro, liberar } = useTrilha()
  const [nivel, setNivel] = useState<NivelTrilha | null>(null)
  const [alvo, setAlvo] = useState<PassoComSituacao | null>(null)

  const niveis = dados ? niveisVisiveis(dados.ctx) : []
  useEffect(() => {
    if (dados && nivel === null) setNivel(nivelDoAluno(dados.ctx) ?? niveis[0] ?? null)
  }, [dados, nivel, niveis])

  const lista = dados && nivel ? situacaoDoNivel(nivel, dados.ctx) : []
  const meu = dados ? nivelDoAluno(dados.ctx) : null

  return (
    <Tela>
      <Cabecalho
        titulo="Trilha de passos"
        fallback="/"
        acao={
          dados && (
            <span className="flex h-11 items-center gap-2 rounded-full bg-preto px-3.5 text-sm font-extrabold text-branco">
              <Icone nome="chave" className="h-[18px] w-[18px] text-brasa-400" />
              {dados.saldo.disponiveis} {dados.saldo.disponiveis === 1 ? 'chave' : 'chaves'}
            </span>
          )
        }
      />
      <div className="flex flex-col gap-3 px-4 pt-2">
        {erro && <p className="text-sm text-or-t">{erro}</p>}
        {dados && niveis.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            A trilha da sua turma ainda não foi configurada. Assim que os professores subirem os vídeos, eles aparecem aqui.
          </p>
        )}
        {niveis.length > 1 && nivel && (
          <Segmentado
            opcoes={niveis.map((n) => ({
              valor: n,
              rotulo: n !== meu && !dados?.ctx.equipe ? `${NOME_NIVEL[n]} · revisão` : NOME_NIVEL[n],
            }))}
            valor={nivel}
            onChange={setNivel}
          />
        )}
        {lista[0]?.motivo === 'revisao' && (
          <p className="rounded-2xl bg-verde-300 px-4 py-3 text-sm text-preto">
            <b>Modo revisão:</b> você já passou por esse nível, então todos os vídeos estão abertos.
          </p>
        )}
        <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
          {lista.map((s, i) => {
            const conteudo = (
              <>
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    s.estado === 'aberto' ? 'bg-marinho-500 text-branco' : s.estado === 'chave' ? 'bg-brasa-300 text-or-t' : 'bg-chip text-ink3'
                  }`}
                >
                  <Icone nome={s.estado === 'aberto' ? 'play' : s.estado === 'chave' ? 'chave' : 'cadeado'} className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-[15px] font-extrabold ${s.estado === 'bloqueado' ? 'text-ink3' : ''}`}>
                    {s.numero}. {s.passo.nome}
                  </span>
                  <span className="text-xs text-ink2">{detalhe(s)}</span>
                </span>
                {s.estado === 'chave' && (
                  <span className="rounded-full border-[1.5px] border-brasa-500 px-3 py-1.5 text-[13px] font-extrabold text-or-t">
                    Liberar
                  </span>
                )}
              </>
            )
            const classe = `flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left ${i > 0 ? 'border-t border-linha' : ''}`
            if (s.estado === 'aberto' && s.passo.video_frente) {
              return (
                <Link key={s.passo.id} to={`/trilha/${s.passo.id}`} className={classe}>
                  {conteudo}
                </Link>
              )
            }
            if (s.estado === 'chave') {
              return (
                <button key={s.passo.id} type="button" className={classe} onClick={() => setAlvo(s)}>
                  {conteudo}
                </button>
              )
            }
            return (
              <div key={s.passo.id} className={classe}>
                {conteudo}
              </div>
            )
          })}
        </div>
        {lista.length > 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-[13px] leading-snug text-ink2">
            Chaves só abrem o <b className="text-ink">próximo passo</b> da trilha, até 7 dias antes da turma. Assim ninguém queima a largada.
          </p>
        )}
      </div>
      {dados && <FolhaChave alvo={alvo} saldo={dados.saldo} onFechar={() => setAlvo(null)} onLiberar={liberar} />}
    </Tela>
  )
}
```

> `Icone` aceita `nome`, `tamanho`, `className` e `preenchido`. Para o `play` sair cheio, usar `preenchido`.

- [ ] **Step 5: Tela do passo (vídeo)**

`src/pages/PassoPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BotaoAcao, Cabecalho, Segmentado, Tela } from '../components/ui'
import { NIVEIS, situacaoDoNivel, urlDoEmbed } from '../lib/trilha'
import { useTrilha } from '../lib/useTrilha'

type Angulo = 'frente' | 'condutor' | 'conduzida'

const CHAVE_PRATICADOS = 'fds-trilha-praticados'

function lerPraticados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PRATICADOS) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function PassoPage() {
  const { id } = useParams()
  const { dados } = useTrilha()
  const [angulo, setAngulo] = useState<Angulo>('frente')
  const [praticados, setPraticados] = useState(lerPraticados)

  const todos = dados ? NIVEIS.flatMap((n) => situacaoDoNivel(n, dados.ctx)) : []
  const i = todos.findIndex((s) => s.passo.id === id)
  const s = i >= 0 ? todos[i] : null
  const proximo = i >= 0 ? todos[i + 1] : undefined

  if (dados && (!s || s.estado !== 'aberto' || !s.passo.video_frente)) {
    return (
      <Tela>
        <Cabecalho titulo="Passo" fallback="/trilha" />
        <p className="px-5 pt-4 text-[15px] text-ink2">Esse passo ainda não abriu para você.</p>
      </Tela>
    )
  }
  if (!s) return null

  const videos: Record<Angulo, string | null> = {
    frente: s.passo.video_frente,
    condutor: s.passo.video_condutor,
    conduzida: s.passo.video_conduzida,
  }
  const angulos = (['frente', 'condutor', 'conduzida'] as const).filter((a) => videos[a])
  const video = videos[angulo] ?? s.passo.video_frente!
  const praticado = praticados.includes(s.passo.id)

  const alternarPraticado = () => {
    const novo = praticado ? praticados.filter((x) => x !== s.passo.id) : [...praticados, s.passo.id]
    setPraticados(novo)
    try {
      localStorage.setItem(CHAVE_PRATICADOS, JSON.stringify(novo))
    } catch {
      // Sem armazenamento (aba anônima): vale só nesta visita
    }
  }

  return (
    <Tela>
      <Cabecalho titulo={s.passo.nome} sobretitulo={`Aula ${s.numero}`} fallback="/trilha" />
      <div className="aspect-video w-full bg-preto">
        <iframe
          key={video}
          src={urlDoEmbed(video)}
          title={`Vídeo: ${s.passo.nome}`}
          className="h-full w-full"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4">
        {angulos.length > 1 && (
          <Segmentado
            opcoes={angulos.map((a) => ({
              valor: a,
              rotulo: a === 'frente' ? 'De frente' : a === 'condutor' ? 'Condutor' : 'Conduzida',
            }))}
            valor={angulo}
            onChange={setAngulo}
          />
        )}
        {s.passo.dica && (
          <div className="rounded-2xl border border-linha bg-sf p-4">
            <div className="text-sm font-extrabold">Dica do professor</div>
            <p className="mt-1 text-sm leading-snug text-ink2">{s.passo.dica}</p>
          </div>
        )}
        <div className="flex gap-2.5">
          <BotaoAcao cor={praticado ? 'verde' : 'claro'} sombra={false} className="flex-1" onClick={alternarPraticado}>
            {praticado ? 'Praticado' : 'Marcar como praticado'}
          </BotaoAcao>
          {proximo && proximo.estado === 'aberto' && proximo.passo.video_frente && (
            <Link to={`/trilha/${proximo.passo.id}`} className="flex items-center rounded-2xl bg-preto px-4 font-extrabold text-branco">
              Próximo
            </Link>
          )}
        </div>
      </div>
    </Tela>
  )
}
```

- [ ] **Step 6: Cartão na tela Hoje**

`src/components/CartaoTrilha.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { formatDate } from '../lib/dates'
import { nivelDoAluno, PONTOS_POR_CHAVE, situacaoDoNivel } from '../lib/trilha'
import { useTrilha } from '../lib/useTrilha'
import { Icone } from './Icone'

/** Passo mais recente aberto e o próximo fechado do nível do aluno. */
export function CartaoTrilha() {
  const navigate = useNavigate()
  const { dados } = useTrilha()
  if (!dados) return null
  const nivel = nivelDoAluno(dados.ctx)
  if (!nivel) return null
  const lista = situacaoDoNivel(nivel, dados.ctx)
  const atual = [...lista].reverse().find((s) => s.estado === 'aberto')
  const proximo = lista.find((s) => s.estado !== 'aberto')
  if (!atual && !proximo) return null
  const pontosNaVez = PONTOS_POR_CHAVE - dados.saldo.faltam

  return (
    <button
      type="button"
      onClick={() => navigate('/trilha')}
      className="flex w-full flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4 text-left"
    >
      <span className="text-[13px] font-extrabold uppercase tracking-[.06em] text-or-t">Sua trilha</span>
      {atual && (
        <span className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marinho-500 text-branco">
            <Icone nome="play" className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <b className="text-base">{atual.passo.nome}</b>
            <span className="text-xs text-ink2">{atual.data ? `Aula de ${formatDate(atual.data)}` : 'Aberto'}</span>
          </span>
        </span>
      )}
      {proximo && (
        <span className="flex items-center gap-3 rounded-2xl bg-fundo px-3.5 py-3">
          <Icone nome={proximo.estado === 'chave' ? 'chave' : 'cadeado'} className="h-5 w-5 text-ink2" />
          <span className="flex flex-1 flex-col">
            <b className="text-sm">Próximo: {proximo.passo.nome}</b>
            <span className="text-xs text-ink2">
              {proximo.data ? `Libera ${formatDate(proximo.data)}` : 'Abre com a turma'}
              {proximo.estado === 'chave' ? ' · ou agora com 1 chave' : ''}
            </span>
          </span>
        </span>
      )}
      <span className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs font-bold text-ink2">
          <span>Presença e parceria até a próxima chave</span>
          <span>
            {pontosNaVez} de {PONTOS_POR_CHAVE}
          </span>
        </span>
        <span className="h-2 overflow-hidden rounded-full bg-chip">
          <span className="block h-full rounded-full bg-brasa-500" style={{ width: `${(pontosNaVez / PONTOS_POR_CHAVE) * 100}%` }} />
        </span>
      </span>
    </button>
  )
}
```

Em `src/pages/HojePage.tsx`: importar `CartaoTrilha` e renderizar `<CartaoTrilha />` logo depois do cartão de check-in da noite. Procurar o primeiro bloco depois do componente do check-in e manter o mesmo espaçamento (`gap`) do contêiner.

- [ ] **Step 7: Rotas e atalho no perfil**

Em `src/App.tsx`, importar `TrilhaPage` e `PassoPage` e acrescentar depois de `<Route path="/salao" …/>`:

```tsx
              <Route path="/trilha" element={<TrilhaPage />} />
              <Route path="/trilha/:id" element={<PassoPage />} />
```

Em `src/pages/ProfilePage.tsx`, junto dos outros atalhos (procurar o `CartaoAtalho` ou o link para `/perfil/duplas`):

```tsx
        <CartaoAtalho
          icone="play"
          cor="#0391D5"
          titulo="Trilha de passos"
          descricao="Vídeos das aulas, revisão e chaves"
          onClick={() => navigate('/trilha')}
        />
```

- [ ] **Step 8: Conferir no app (demo)**

Run: `npm run build` (precisa compilar sem erro) e abrir o demo pelo `preview_start`. Antes, como organizador, definir a turma do aluno demo como "Iniciante" com início numa segunda já passada. Conferir:
- o cartão "Sua trilha" na tela Hoje;
- a trilha com passos abertos e fechados;
- a folha de chave abrindo no passo "chave".

A parte de definir a turma depende da Task 6. Se ela ainda não existir, chamar `definirTrilhaDaTurma` pelo console do navegador.

- [ ] **Step 9: Commit**

```bash
git add src/components/Icone.tsx src/lib/useTrilha.ts src/components/FolhaChave.tsx src/components/CartaoTrilha.tsx src/pages/TrilhaPage.tsx src/pages/PassoPage.tsx src/App.tsx src/pages/HojePage.tsx src/pages/ProfilePage.tsx
git commit -m "Trilha de videos: telas do aluno, cartao na Hoje e folha de chave"
```

---

### Task 6: Gestão da trilha pelo celular

**Files:**
- Create: `src/pages/trilha/SoEquipeTrilha.tsx`, `src/pages/trilha/GerenciarTrilhaPage.tsx`, `src/pages/trilha/EditarPassoPage.tsx`, `src/pages/trilha/CronogramaPage.tsx`
- Modify: `src/App.tsx` (rotas), `src/pages/painel/HubPage.tsx` e `src/pages/ProfilePage.tsx` (atalhos)

**Interfaces:**
- Consumes: `podeEditarTrilha`, `idDoYoutube`, `cronogramaDeTurma`, `ordenarPassos`, `NIVEIS` e `NOME_NIVEL` (Task 2); API da Task 3; `Campo` e `Dica` de `src/pages/painel/contexto.tsx`.

- [ ] **Step 1: Guarda de acesso**

`src/pages/trilha/SoEquipeTrilha.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { podeEditarTrilha } from '../../lib/trilha'

/** Professores, monitores e organização. Aluno volta para a trilha. */
export function SoEquipeTrilha() {
  const { profile, papel } = useAuth()
  if (!profile) return null
  if (!podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino })) {
    return <Navigate to="/trilha" replace />
  }
  return <Outlet />
}
```

- [ ] **Step 2: Lista por nível**

`src/pages/trilha/GerenciarTrilhaPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BotaoAcao, Cabecalho, CartaoAtalho, Etiqueta, Segmentado, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { NIVEIS, NOME_NIVEL, ordenarPassos } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilha } from '../../lib/types'

export function GerenciarTrilhaPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [passos, setPassos] = useState<PassoTrilha[] | null>(null)
  const [nivel, setNivel] = useState<NivelTrilha>('iniciante')

  useEffect(() => {
    void api.listPassosTrilha().then(setPassos)
  }, [api])

  const lista = ordenarPassos((passos ?? []).filter((p) => p.nivel === nivel))

  return (
    <Tela>
      <Cabecalho titulo="Vídeo-aulas" sobretitulo="Trilha" fallback="/perfil" />
      <div className="flex flex-col gap-3 px-4 pt-2">
        <p className="px-1 text-sm text-ink2">Uma trilha por nível. As datas ficam no cronograma de cada turma.</p>
        <CartaoAtalho
          icone="agenda"
          cor="#DE5300"
          titulo="Cronogramas das turmas"
          descricao="Nível, primeira aula e datas de cada passo"
          onClick={() => navigate('/trilha/gerenciar/cronograma')}
        />
        <Segmentado
          opcoes={NIVEIS.map((n) => ({ valor: n, rotulo: NOME_NIVEL[n] }))}
          valor={nivel}
          onChange={setNivel}
        />
        {passos && lista.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">Nenhum passo neste nível ainda.</p>
        )}
        <div className="overflow-hidden rounded-[18px] border border-linha bg-sf">
          {lista.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/trilha/gerenciar/passo/${p.id}`)}
              className={`flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left ${i > 0 ? 'border-t border-linha' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip font-extrabold">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <b className="text-[15px]">{p.nome}</b>
                <Etiqueta cor={p.video_frente ? 'verde' : 'pessego'} className="self-start">
                  {p.video_frente ? 'Vídeo ok' : 'Falta o link'}
                </Etiqueta>
              </span>
            </button>
          ))}
        </div>
        <BotaoAcao bloco onClick={() => navigate(`/trilha/gerenciar/passo/novo?nivel=${nivel}`)}>
          Novo passo
        </BotaoAcao>
      </div>
    </Tela>
  )
}
```

- [ ] **Step 3: Editar passo**

`src/pages/trilha/EditarPassoPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BotaoAcao, BotaoSuave, Cabecalho, Confirmar, LinhaInterruptor, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { idDoYoutube, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilhaInput } from '../../lib/types'
import { Campo, Dica } from '../painel/contexto'

const VAZIO: PassoTrilhaInput = {
  nivel: 'iniciante', ordem: 1, nome: '', video_frente: null, video_condutor: null,
  video_conduzida: null, dica: null, pode_chave: true,
}

type CampoVideo = 'video_frente' | 'video_condutor' | 'video_conduzida'

export function EditarPassoPage() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const { id } = useParams()
  const [busca] = useSearchParams()
  const novo = id === 'novo'
  const [form, setForm] = useState<PassoTrilhaInput | null>(null)
  const [links, setLinks] = useState<Record<CampoVideo, string>>({ video_frente: '', video_condutor: '', video_conduzida: '' })
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  useEffect(() => {
    void api.listPassosTrilha().then((todos) => {
      if (novo) {
        const nivel = (busca.get('nivel') as NivelTrilha | null) ?? 'iniciante'
        const ultima = Math.max(0, ...todos.filter((p) => p.nivel === nivel).map((p) => p.ordem))
        setForm({ ...VAZIO, nivel, ordem: ultima + 1 })
        return
      }
      const p = todos.find((x) => x.id === id)
      if (!p) {
        toast('Esse passo não existe mais', 'erro')
        navigate('/trilha/gerenciar', { replace: true })
        return
      }
      setForm(p)
      setLinks({
        video_frente: p.video_frente ? `https://youtu.be/${p.video_frente}` : '',
        video_condutor: p.video_condutor ? `https://youtu.be/${p.video_condutor}` : '',
        video_conduzida: p.video_conduzida ? `https://youtu.be/${p.video_conduzida}` : '',
      })
    })
  }, [api, id, novo, busca, navigate, toast])

  if (!form) return null

  const ids = {
    video_frente: links.video_frente.trim() ? idDoYoutube(links.video_frente) : null,
    video_condutor: links.video_condutor.trim() ? idDoYoutube(links.video_condutor) : null,
    video_conduzida: links.video_conduzida.trim() ? idDoYoutube(links.video_conduzida) : null,
  }
  const linkRuim = (c: CampoVideo) => links[c].trim() !== '' && ids[c] === null

  const salvar = async () => {
    if (!form.nome.trim()) return toast('Dê um nome ao passo', 'erro')
    if ((['video_frente', 'video_condutor', 'video_conduzida'] as const).some(linkRuim)) {
      return toast('Algum link não é de um vídeo do YouTube', 'erro')
    }
    setSalvando(true)
    try {
      await api.salvarPassoTrilha({ ...form, ...ids })
      toast('Passo salvo')
      navigate('/trilha/gerenciar')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const campoVideo = (c: CampoVideo, rotulo: string) => (
    <Campo rotulo={rotulo}>
      <input
        type="url"
        inputMode="url"
        className="input"
        placeholder="Colar link do YouTube"
        value={links[c]}
        onChange={(e) => setLinks({ ...links, [c]: e.target.value })}
        aria-invalid={linkRuim(c)}
      />
      {linkRuim(c) && <span className="text-xs font-bold text-or-t">Esse link não é de um vídeo do YouTube.</span>}
      {ids[c] && (
        <img
          src={`https://i.ytimg.com/vi/${ids[c]}/mqdefault.jpg`}
          alt=""
          className="mt-1 h-[50px] w-[88px] rounded-lg object-cover"
        />
      )}
    </Campo>
  )

  return (
    <Tela>
      <Cabecalho titulo={novo ? 'Novo passo' : 'Editar passo'} fallback="/trilha/gerenciar" />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        <Campo rotulo="Nome do passo">
          <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo rotulo="Nível">
            <select
              className="input"
              value={form.nivel}
              onChange={(e) => setForm({ ...form, nivel: e.target.value as NivelTrilha })}
            >
              {NIVEIS.map((n) => (
                <option key={n} value={n}>
                  {NOME_NIVEL[n]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Aula nº na trilha">
            <input
              type="number"
              min={1}
              className="input"
              value={form.ordem}
              onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 1 })}
            />
          </Campo>
        </div>
        <Dica>A data de cada turma vem do cronograma dela (Agenda). Níveis acima veem este passo como revisão.</Dica>
        <Dica>
          Suba o vídeo no canal do projeto como <b>não listado</b> e cole o link. O app guarda só o link.
        </Dica>
        {campoVideo('video_frente', 'Vídeo de frente')}
        {campoVideo('video_condutor', 'Visão do condutor (opcional)')}
        {campoVideo('video_conduzida', 'Visão da conduzida (opcional)')}
        <Campo rotulo="Dica do professor">
          <textarea
            rows={3}
            className="input"
            value={form.dica ?? ''}
            onChange={(e) => setForm({ ...form, dica: e.target.value })}
          />
        </Campo>
        <LinhaInterruptor
          titulo="Pode liberar com chave"
          descricao="Desligue para passos que só fazem sentido depois da aula"
          ligado={form.pode_chave}
          onChange={(v) => setForm({ ...form, pode_chave: v })}
        />
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar passo'}
        </BotaoAcao>
        {!novo && (
          <BotaoSuave tamanho="g" onClick={() => setRemovendo(true)}>
            Remover da trilha
          </BotaoSuave>
        )}
      </div>
      <Confirmar
        aberto={removendo}
        titulo="Remover este passo?"
        texto="Quem gastou chave nele recebe a chave de volta."
        ok="Remover"
        onVoltar={() => setRemovendo(false)}
        onOk={() => {
          void api.removerPassoTrilha(form.id!).then(() => navigate('/trilha/gerenciar'))
        }}
      />
    </Tela>
  )
}
```

> `Campo` (`src/pages/painel/contexto.tsx:194`) recebe `children: ReactNode`. Se o layout dele não empilhar os filhos, envolver o conteúdo de `campoVideo` em `<div className="flex flex-col gap-1">`.

- [ ] **Step 4: Cronograma por turma**

`src/pages/trilha/CronogramaPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotaoAcao, Cabecalho, ChipEscolha, Tela } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatDate } from '../../lib/dates'
import { cronogramaDeTurma, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { AgendaEvent, Feriado, NivelTrilha, PassoTrilha, Turma } from '../../lib/types'
import { Campo } from '../painel/contexto'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function CronogramaPage() {
  const { api, papel } = useAuth()
  const toast = useToast()
  const [base, setBase] = useState<{ turmas: Turma[]; passos: PassoTrilha[]; eventos: AgendaEvent[]; feriados: Feriado[] } | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ nivel: NivelTrilha | ''; inicio: string }>({ nivel: '', inicio: '' })

  const carregar = useCallback(async () => {
    const [turmas, passos, eventos, feriados] = await Promise.all([
      api.listTurmas(), api.listPassosTrilha(), api.listEvents(), api.listFeriados(),
    ])
    setBase({ turmas, passos, eventos, feriados })
    setEscolhida((atual) => atual ?? turmas[0]?.nome ?? null)
  }, [api])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const turma = base?.turmas.find((t) => t.nome === escolhida) ?? null
  useEffect(() => {
    if (turma) setEdicao({ nivel: turma.nivel ?? '', inicio: turma.trilha_inicio ?? '' })
  }, [turma])

  if (!base) return null
  const linhas = turma ? cronogramaDeTurma(turma, base.passos, base.eventos, base.feriados) : []
  const aulasNaAgenda = base.eventos.filter((e) => e.turma === escolhida && e.dia_semana !== null && !e.data)

  const salvar = async () => {
    if (!turma) return
    try {
      await api.definirTrilhaDaTurma(turma.nome, edicao.nivel || null, edicao.inicio || null)
      await carregar()
      toast('Turma salva')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <Tela>
      <Cabecalho titulo="Cronograma" sobretitulo="Vídeo-aulas" fallback="/trilha/gerenciar" />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
        <p className="px-1 text-sm text-ink2">Cada turma anda no seu ritmo. A trilha do nível é a mesma, só as datas mudam.</p>
        <div className="flex flex-wrap gap-2">
          {base.turmas.map((t) => (
            <ChipEscolha key={t.id} ativo={t.nome === escolhida} onClick={() => setEscolhida(t.nome)}>
              {t.nome}
            </ChipEscolha>
          ))}
        </div>
        {turma && (
          <div className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <Campo rotulo="Nível da trilha">
                <select
                  className="input"
                  value={edicao.nivel}
                  onChange={(e) => setEdicao({ ...edicao, nivel: e.target.value as NivelTrilha | '' })}
                >
                  <option value="">Fora da trilha</option>
                  {NIVEIS.map((n) => (
                    <option key={n} value={n}>
                      {NOME_NIVEL[n]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Primeira aula">
                <input
                  type="date"
                  className="input"
                  value={edicao.inicio}
                  onChange={(e) => setEdicao({ ...edicao, inicio: e.target.value })}
                />
              </Campo>
            </div>
            <BotaoAcao cor="preto" tamanho="m" sombra={false} onClick={() => void salvar()}>
              Salvar turma
            </BotaoAcao>
            <div className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2.5 text-sm">
              <span>
                <b>Aula na agenda: </b>
                {aulasNaAgenda.length
                  ? aulasNaAgenda.map((e) => `${DIAS[e.dia_semana!]} ${e.hora ?? ''}`.trim()).join(' · ')
                  : 'nenhuma aula semanal'}
              </span>
              <Link to={papel === 'organizador' ? '/organizador/agenda' : '/agenda'} className="font-extrabold text-or-t">
                Abrir agenda
              </Link>
            </div>
          </div>
        )}
        {turma && linhas.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            Defina o nível e a primeira aula, e confira se a turma tem a aula semanal na Agenda.
          </p>
        )}
        <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
          {linhas.map((l, i) => (
            <div
              key={`${l.aula.data}-${l.aula.tipo}`}
              className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-t border-linha' : ''} ${
                l.aula.tipo === 'cancelada' ? 'bg-brasa-300/20' : l.aula.tipo === 'reposicao' ? 'bg-azul-300/20' : ''
              }`}
            >
              <span className="w-[72px] shrink-0 text-sm font-extrabold">{formatDate(l.aula.data)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className={`text-[15px] ${l.passo ? '' : 'text-ink3'}`}>
                  {l.passo?.nome ?? (l.aula.tipo === 'cancelada' ? 'Aula cancelada na agenda' : 'Sem passo')}
                </b>
                <span className="text-xs text-ink2">
                  {l.aula.tipo === 'cancelada'
                    ? l.aula.reposicaoEm
                      ? `Reposta em ${formatDate(l.aula.reposicaoEm)} · trilha não atrasa`
                      : `${l.aula.motivo ?? 'Cancelada'} · trilha andou uma semana`
                    : l.aula.tipo === 'reposicao'
                      ? 'Reposição'
                      : 'Aula'}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="px-1 text-[13px] leading-snug text-ink2">
          Para mudar uma data, cancele a aula na <b className="text-ink">Agenda</b>. Sem reposição, os passos seguintes andam uma semana. Com reposição, o passo vai para o dia marcado e nada mais muda.
        </p>
      </div>
    </Tela>
  )
}
```

- [ ] **Step 5: Rotas e atalhos**

Em `src/App.tsx`, importar as quatro telas e acrescentar, **antes** de `<Route path="/trilha/:id" …/>`, para `gerenciar` não ser lido como `:id`:

```tsx
              <Route path="/trilha/gerenciar" element={<SoEquipeTrilha />}>
                <Route index element={<GerenciarTrilhaPage />} />
                <Route path="passo/:id" element={<EditarPassoPage />} />
                <Route path="cronograma" element={<CronogramaPage />} />
              </Route>
```

Em `src/pages/painel/HubPage.tsx` (`PainelHome`), depois do cartão "Agenda":

```tsx
        <CartaoAtalho
          icone="play"
          cor="#0391D5"
          titulo="Vídeo-aulas"
          descricao="Trilhas por nível · cronograma das turmas"
          onClick={() => navigate('/trilha/gerenciar')}
        />
```

Em `src/pages/ProfilePage.tsx`, logo depois do atalho "Trilha de passos" da Task 5 e só para a equipe:

```tsx
        {profile && podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino }) && (
          <CartaoAtalho
            icone="editar"
            cor="#FFB98C"
            titulo="Gerenciar vídeo-aulas"
            descricao="Passos, links do YouTube e cronogramas"
            onClick={() => navigate('/trilha/gerenciar')}
          />
        )}
```

- [ ] **Step 6: Conferir no app (demo, celular)**

Rodar `npm run build`. Depois, pelo `preview_start` em largura de celular (`resize_window` preset `mobile`), como organizador do demo:
1. Cronograma: pôr "Iniciante 01" como Iniciante, início numa segunda passada, e salvar.
2. Criar um passo com link `https://youtu.be/<ID>?si=x` e ver a miniatura.
3. Colar `https://vimeo.com/1` e ver a mensagem de erro.
4. Na Agenda, cancelar uma aula da turma com reposição e conferir no cronograma a linha "Reposta em …" e a reposição.

Voltar o `resize_window` para `desktop` no fim.

- [ ] **Step 7: Commit**

```bash
git add src/pages/trilha src/App.tsx src/pages/painel/HubPage.tsx src/pages/ProfilePage.tsx
git commit -m "Trilha de videos: gestao pelo celular (passos, links e cronograma por turma)"
```

---

### Task 7: Fechamento

**Files:**
- Modify: `DEPLOY.md` (seção de migrações pendentes, se existir)

- [ ] **Step 1: Tudo verde**

Run: `npx vitest run && npm run build`
Expected: todos os testes passam e o build sai sem erro.

- [ ] **Step 2: Registrar a migração pendente**

Em `DEPLOY.md`, na lista de migrações a rodar, acrescentar:

```md
- `036-trilha-de-videos.sql` — trilha de vídeo-aulas (passos, chaves, nível da turma, reposição). Sem ela o app mostra "A trilha ainda não foi configurada" e a reposição no cancelamento avisa que falta a migração.
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md
git commit -m "Deploy: registra a migracao 036 da trilha de videos"
```
