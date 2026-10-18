-- ============================================================
-- MIGRAÇÃO 039 — Aulas sem vídeo no cronograma
--
-- Nem toda aula é um passo: às vezes a turma aprende um conceito
-- (musicalidade, postura) que não precisa ser gravado. A aula sem vídeo
-- ocupa uma semana na sequência do nível, igual a um passo, e por isso
-- empurra os passos seguintes em todas as turmas daquele nível.
--
-- Tabela à parte de trilha_passos: a trilha de vídeos, as chaves e o
-- destravar antecipado não enxergam essas aulas. Só o cronograma e a
-- Agenda (lib/trilha.ts) as encaixam entre os passos.
--
-- `ordem` é a posição na sequência do nível: a aula nº 4 é a 4ª aula da
-- turma, e o passo que seria o 4º passa a ser o 5º.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.trilha_aulas_sem_video (
  id uuid primary key default gen_random_uuid(),
  nivel text not null check (nivel in ('iniciante', 'intermediario', 'avancado')),
  ordem int not null check (ordem >= 1),
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  criado_em timestamptz not null default now()
);
create index if not exists trilha_aulas_sem_video_nivel_idx
  on public.trilha_aulas_sem_video (nivel, ordem);

alter table public.trilha_aulas_sem_video enable row level security;

drop policy if exists "trilha_aulas_sem_video_select" on public.trilha_aulas_sem_video;
drop policy if exists "trilha_aulas_sem_video_insert" on public.trilha_aulas_sem_video;
drop policy if exists "trilha_aulas_sem_video_update" on public.trilha_aulas_sem_video;
drop policy if exists "trilha_aulas_sem_video_delete" on public.trilha_aulas_sem_video;
create policy "trilha_aulas_sem_video_select" on public.trilha_aulas_sem_video
  for select to authenticated using (true);
create policy "trilha_aulas_sem_video_insert" on public.trilha_aulas_sem_video
  for insert to authenticated with check (pode_editar_trilha());
create policy "trilha_aulas_sem_video_update" on public.trilha_aulas_sem_video
  for update to authenticated using (pode_editar_trilha()) with check (pode_editar_trilha());
create policy "trilha_aulas_sem_video_delete" on public.trilha_aulas_sem_video
  for delete to authenticated using (pode_editar_trilha());
