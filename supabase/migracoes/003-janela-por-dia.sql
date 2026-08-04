-- ============================================================
-- MIGRAÇÃO 003 — Janela de check-in por dia da semana
--
-- Antes, um desafio tinha UM horário aplicado a todos os dias
-- marcados. Agora cada dia da semana pode ter seu próprio horário
-- (ex.: segunda 18h–23h, quarta 20h–22h) — útil quando os espaços
-- livres têm horários de início diferentes em dias diferentes.
--
-- Rode ESTE arquivo no SQL Editor do Supabase se o seu banco já
-- está no ar. NÃO rode o schema.sql inteiro de novo: ele tentaria
-- recriar políticas que já existem e daria erro.
--
-- Pode rodar mais de uma vez sem problema — a migração dos dados
-- antigos só acontece se as colunas antigas ainda existirem.
-- ============================================================

-- Janela de check-in por dia da semana. No máximo uma por dia em
-- cada desafio.
create table if not exists public.challenge_janelas (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=domingo … 6=sábado
  hora_inicio time not null,
  hora_fim time not null,
  primary key (challenge_id, dia_semana)
);

-- Migra os desafios existentes: cada dia do array `dias_semana` vira
-- uma linha em challenge_janelas, com o mesmo horário de antes (só
-- depois disso é possível ter horários diferentes por dia). Só roda
-- se as colunas antigas ainda existirem — seguro rodar de novo.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenges'
      and column_name = 'dias_semana'
  ) then
    execute $mig$
      insert into public.challenge_janelas (challenge_id, dia_semana, hora_inicio, hora_fim)
      select c.id, dia, c.hora_inicio, c.hora_fim
      from public.challenges c, unnest(c.dias_semana) as dia
      on conflict (challenge_id, dia_semana) do nothing
    $mig$;

    execute 'alter table public.challenges drop column dias_semana';
    execute 'alter table public.challenges drop column hora_inicio';
    execute 'alter table public.challenges drop column hora_fim';
  end if;
end $$;

alter table public.challenge_janelas enable row level security;

drop policy if exists "challenge_janelas_select" on public.challenge_janelas;
drop policy if exists "challenge_janelas_write" on public.challenge_janelas;
create policy "challenge_janelas_select" on public.challenge_janelas
  for select to authenticated using (true);
create policy "challenge_janelas_write" on public.challenge_janelas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache"
-- (para o PostgREST enxergar a tabela nova na hora).
--
-- Conferir a migração dos desafios existentes:
--
--   select c.titulo, j.dia_semana, j.hora_inicio, j.hora_fim
--   from public.challenges c
--   join public.challenge_janelas j on j.challenge_id = c.id
--   order by c.titulo, j.dia_semana;
-- ============================================================
