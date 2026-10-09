import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRACOES = [
  '029-pedidos-de-musica.sql',
  '030-dj-loop-autorizado.sql',
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
