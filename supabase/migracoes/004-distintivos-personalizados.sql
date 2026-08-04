-- ============================================================
-- MIGRAÇÃO 004 — Distintivos personalizados
--
-- Antes, só existia um distintivo automático de "Campeão(ã)" pra quem
-- vencia um desafio. Agora a organização cria distintivos (emoji +
-- título + descrição) e entrega manualmente a quem quiser — inclusive
-- em lote pro top 1/3/5 do ranking de um desafio.
--
-- Rode ESTE arquivo no SQL Editor do Supabase se o seu banco já
-- está no ar. NÃO rode o schema.sql inteiro de novo: ele tentaria
-- recriar políticas que já existem e daria erro.
--
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

-- Catálogo de distintivos personalizados
create table if not exists public.distintivos (
  id uuid primary key default gen_random_uuid(),
  emoji text not null,
  titulo text not null,
  descricao text not null default '',
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Quem recebeu cada distintivo
create table if not exists public.distintivos_concedidos (
  distintivo_id uuid not null references public.distintivos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  concedido_em timestamptz not null default now(),
  primary key (distintivo_id, user_id)
);

alter table public.distintivos enable row level security;
alter table public.distintivos_concedidos enable row level security;

drop policy if exists "distintivos_select" on public.distintivos;
drop policy if exists "distintivos_write" on public.distintivos;
create policy "distintivos_select" on public.distintivos
  for select to authenticated using (true);
create policy "distintivos_write" on public.distintivos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

drop policy if exists "distintivos_concedidos_select" on public.distintivos_concedidos;
drop policy if exists "distintivos_concedidos_write" on public.distintivos_concedidos;
create policy "distintivos_concedidos_select" on public.distintivos_concedidos
  for select to authenticated using (true);
create policy "distintivos_concedidos_write" on public.distintivos_concedidos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache"
-- (para o PostgREST enxergar as tabelas novas na hora).
--
-- Criar um distintivo e entregar pra alguém, direto no SQL:
--
--   insert into public.distintivos (emoji, titulo, descricao)
--   values ('🌟', 'Alma do Forró', 'Contagia a turma com energia boa')
--   returning id; -- guarde o id retornado
--
--   insert into public.distintivos_concedidos (distintivo_id, user_id)
--   select '<id-do-distintivo>', id from public.profiles
--   where normalizar_telefone(telefone) = normalizar_telefone('35 99999-9999')
--   on conflict do nothing;
--
-- O jeito normal é pelo painel do app: Painel > Distintivos.
-- ============================================================
