-- ============================================================
-- MIGRAÇÃO 002 — Feriados e cancelamentos de aula
--
-- Rode ESTE arquivo no SQL Editor do Supabase se o seu banco já
-- está no ar. NÃO rode o schema.sql inteiro de novo: ele tentaria
-- recriar políticas que já existem e daria erro.
--
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

-- Feriados/cancelamentos: suspendem a(s) aula(s) recorrente(s) numa
-- data específica (ex.: feriado nacional, professor ausente).
-- turma = null → cancela a aula de TODAS as turmas nesse dia;
-- com turma definida, cancela só a aula daquela turma.
create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  motivo text,
  turma text,
  criado_em timestamptz not null default now()
);

alter table public.feriados enable row level security;

drop policy if exists "feriados_select" on public.feriados;
drop policy if exists "feriados_write" on public.feriados;
create policy "feriados_select" on public.feriados
  for select to authenticated using (true);
create policy "feriados_write" on public.feriados
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache"
-- (para o PostgREST enxergar a tabela nova na hora).
--
-- Cadastrar um feriado: pelo app, em Painel > Agenda > Feriados e
-- cancelamentos. Ou direto no SQL:
--
--   insert into public.feriados (data, motivo, turma) values
--     ('2026-11-02', 'Finados', null); -- cancela TODAS as turmas
--
--   insert into public.feriados (data, motivo, turma) values
--     ('2026-09-10', 'Professor(a) viajando', 'Avançado'); -- só uma turma
-- ============================================================
