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
