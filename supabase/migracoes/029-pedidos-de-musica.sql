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
