-- ============================================================
-- MIGRAÇÃO 001 — Cargos do projeto
--
-- Rode ESTE arquivo no SQL Editor do Supabase se o seu banco já
-- está no ar. NÃO rode o schema.sql inteiro de novo: ele tentaria
-- recriar políticas que já existem e daria erro.
--
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

-- Lista de cargos disponíveis (editável depois pelo painel do app)
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null default 99,
  criado_em timestamptz not null default now()
);

insert into public.cargos (nome, ordem) values
  ('Presidência', 1),
  ('Vice-Presidência', 2),
  ('Diretor(a) de Ensino', 3),
  ('Diretor(a) de RH', 4),
  ('Diretor(a) de Comunicação', 5),
  ('Diretor(a) de Recursos', 6),
  ('Professor(a)', 7),
  ('Monitor(a)', 8),
  ('Membro de RH', 9),
  ('Membro de Comunicação', 10),
  ('Membro de Recursos', 11)
on conflict (nome) do nothing;

-- Cargos de cada pessoa (uma pessoa pode acumular mais de um)
create table if not exists public.profile_cargos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cargo text not null,
  primary key (user_id, cargo)
);

alter table public.cargos enable row level security;
alter table public.profile_cargos enable row level security;

-- Políticas (drop antes de criar para o script poder rodar de novo)
drop policy if exists "cargos_select" on public.cargos;
drop policy if exists "cargos_write" on public.cargos;
create policy "cargos_select" on public.cargos
  for select to authenticated using (true);
create policy "cargos_write" on public.cargos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

drop policy if exists "profile_cargos_select" on public.profile_cargos;
drop policy if exists "profile_cargos_write" on public.profile_cargos;
create policy "profile_cargos_select" on public.profile_cargos
  for select to authenticated using (true);
create policy "profile_cargos_write" on public.profile_cargos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache"
-- (para o PostgREST enxergar as tabelas novas na hora).
--
-- Atribuir cargos: pelo app, em Painel > Turmas > Alunos no app.
-- Ou direto no SQL, pelo telefone:
--
--   insert into public.profile_cargos (user_id, cargo)
--   select id, 'Presidência' from public.profiles
--   where normalizar_telefone(telefone) = normalizar_telefone('35 99999-9999')
--   on conflict do nothing;
-- ============================================================
