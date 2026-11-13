import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRACOES = [
  '029-pedidos-de-musica.sql',
  '030-dj-loop-autorizado.sql',
  '033-cargo-dj.sql',
  '036-trilha-de-videos.sql',
  '038-videos-do-drive.sql',
  '039-aulas-sem-video.sql',
  '041-caca-aos-professores.sql',
  '043-desafio-de-ingresso.sql',
  '044-convites-com-ddd.sql',
  '045-resumo-com-repetidos.sql',
].map((m) => fileURLToPath(new URL(`../../supabase/migracoes/${m}`, import.meta.url)))

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
  id uuid primary key, nome text not null, avatar_url text, telefone text
);
create table public.roles (
  user_id uuid primary key references public.profiles(id), papel text not null
);
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique, ordem int not null default 99
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
-- Como no Supabase: funções novas já nascem executáveis por anon/authenticated
alter default privileges in schema public grant execute on functions to anon, authenticated;
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
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Desafio',
  data_inicio date not null, data_fim date not null,
  forrodex boolean not null default false,
  entrada_restrita boolean not null default false
);
create table public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create table public.challenge_convidados (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  telefone text not null,
  telefone_exibicao text,
  nome text,
  criado_em timestamptz not null default now(),
  primary key (challenge_id, telefone)
);
create table public.alunos_cadastrados (
  telefone text, nome text, turma text, papel_danca text
);
-- Cópias de schema.sql (normalizar_telefone) e da migração 022
create function public.normalizar_telefone(t text) returns text
language sql immutable as $$
  select case
    when t is null then ''
    when length(regexp_replace(t, '\\D', '', 'g')) > 10
      then right(regexp_replace(t, '\\D', '', 'g'), 10)
    else regexp_replace(t, '\\D', '', 'g')
  end;
$$;
create function public.telefone_ddd(t text) returns text
language sql immutable as $$
  select case length(regexp_replace(coalesce(t, ''), '\\D', '', 'g'))
    when 11 then left(regexp_replace(coalesce(t, ''), '\\D', '', 'g'), 2)
    when 10 then left(regexp_replace(coalesce(t, ''), '\\D', '', 'g'), 2)
    else null
  end;
$$;
create function public.telefone_linha(t text) returns text
language sql immutable as $$
  select case length(regexp_replace(coalesce(t, ''), '\\D', '', 'g'))
    when 11 then substring(regexp_replace(coalesce(t, ''), '\\D', '', 'g') from 4 for 8)
    when 10 then right(regexp_replace(coalesce(t, ''), '\\D', '', 'g'), 8)
    when 9 then right(regexp_replace(coalesce(t, ''), '\\D', '', 'g'), 8)
    when 8 then regexp_replace(coalesce(t, ''), '\\D', '', 'g')
    else ''
  end;
$$;
create function public.telefones_batem(a text, b text) returns boolean
language sql immutable as $$
  select
    public.telefone_linha(a) <> ''
    and public.telefone_linha(a) = public.telefone_linha(b)
    and (
      public.telefone_ddd(a) is null
      or public.telefone_ddd(b) is null
      or public.telefone_ddd(a) = public.telefone_ddd(b)
    );
$$;
create table public.turma_professores (
  user_id uuid not null, turma text not null, primary key (user_id, turma)
);
create table public.profile_turmas (
  user_id uuid not null, turma text not null, papel_danca text,
  primary key (user_id, turma)
);
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
  for (const m of MIGRACOES) await db.exec(readFileSync(m, 'utf8'))
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
       values ($1::uuid, 'sp-' || $1::text, 'acesso', 'renovacao', now() + interval '1 hour')`,
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

/**
 * Insere um desafio de ingresso (festa 05/12/2026, 18:00 → 04:00 do dia
 * seguinte, entrada restrita) e devolve o id.
 */
export async function desafioIngresso(
  db: PGlite,
  opcoes: {
    titulo?: string
    data?: string
    inicio?: string
    fim?: string
    ingressoTitulo?: string | null
    presencaTitulo?: string | null
  } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into challenges (titulo, data_inicio, data_fim, entrada_restrita,
       evento_data, evento_inicio, evento_fim, ingresso_titulo, presenca_titulo)
     values ($1, '2026-11-01', '2026-12-05', true, $2, $3, $4, $5, $6) returning id`,
    [
      opcoes.titulo ?? 'Forró na Rep 2026.2',
      opcoes.data ?? '2026-12-05',
      opcoes.inicio ?? '18:00',
      opcoes.fim ?? '04:00',
      opcoes.ingressoTitulo ?? null,
      opcoes.presencaTitulo ?? null,
    ],
  )
  return r.rows[0].id
}
