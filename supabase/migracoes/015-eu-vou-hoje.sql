-- ============================================================
-- MIGRAÇÃO 015 — "Eu vou hoje" na agenda
--
-- Em dança social, saber que tem gente indo é o que faz alguém sair de
-- casa. A agenda já dizia quando tem forró; agora diz quem confirmou.
--
-- Uma linha por (pessoa, evento, data): a confirmação é da OCORRÊNCIA,
-- não do evento. A aula de segunda é um evento recorrente só — quem
-- confirma, confirma a segunda-feira que vem, e na semana seguinte
-- confirma de novo.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.confirmacoes_presenca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  evento_id uuid not null references public.events(id) on delete cascade,
  data date not null,
  criado_em timestamptz not null default now(),
  unique (user_id, evento_id, data)
);

create index if not exists confirmacoes_data_idx
  on public.confirmacoes_presenca (data);

alter table public.confirmacoes_presenca enable row level security;

-- Todos leem: a graça é justamente ver quem vai.
-- Cada um escreve só a própria confirmação — ninguém confirma por outro.
drop policy if exists "confirmacoes_select" on public.confirmacoes_presenca;
drop policy if exists "confirmacoes_insert" on public.confirmacoes_presenca;
drop policy if exists "confirmacoes_delete" on public.confirmacoes_presenca;

create policy "confirmacoes_select" on public.confirmacoes_presenca
  for select to authenticated using (true);
create policy "confirmacoes_insert" on public.confirmacoes_presenca
  for insert to authenticated with check (user_id = auth.uid());
create policy "confirmacoes_delete" on public.confirmacoes_presenca
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Não há limpeza automática: uma linha por pessoa por aula é pouca
-- coisa (300 alunos × 2 aulas/semana × 6 meses ≈ 15 mil linhas de
-- alguns bytes). Se um dia incomodar, dá para apagar o que é antigo:
--
--   delete from public.confirmacoes_presenca
--   where data < current_date - interval '3 months';
-- ============================================================
