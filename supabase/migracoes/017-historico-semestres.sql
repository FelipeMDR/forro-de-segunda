-- ============================================================
-- MIGRAÇÃO 017 — Histórico de encerramentos de semestre
--
-- A retrospectiva contava desde 1º de janeiro ou 1º de julho — um
-- chute pelo calendário, sem relação com quando as turmas de vocês
-- realmente começam. Agora ela conta a partir do último "Encerrar
-- semestre" de verdade, que é o mesmo botão que já existia no painel.
--
-- Uma linha por encerramento (histórico, não só o último) — serve de
-- registro de quando cada semestre virou, o que pode ser útil depois
-- mesmo sem o app usar diretamente.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.semestres (
  id uuid primary key default gen_random_uuid(),
  encerrado_em timestamptz not null default now(),
  encerrado_por uuid references public.profiles(id) on delete set null
);

alter table public.semestres enable row level security;

drop policy if exists "semestres_select" on public.semestres;
drop policy if exists "semestres_insert" on public.semestres;

-- Todos leem (é o que a retrospectiva de qualquer aluno consulta);
-- só organizador registra um encerramento.
create policy "semestres_select" on public.semestres
  for select to authenticated using (true);
create policy "semestres_insert" on public.semestres
  for insert to authenticated with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Sem nenhuma linha aqui (banco que nunca encerrou um semestre pelo
-- app), a retrospectiva cai para a data de criação da conta de cada
-- aluno — ver src/lib/retrospectiva.ts.
-- ============================================================
