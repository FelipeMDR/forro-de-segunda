-- ============================================================
-- MIGRAÇÃO 023 — Quem dá aula em qual turma
--
-- Até agora o app sabia em que turma alguém ESTUDA (`profile_turmas`),
-- mas não em que turma alguém ENSINA: "Professor(a)" e "Monitor(a)"
-- eram só cargos, sem turma nenhuma. O efeito prático era que a aba
-- "Minha turma" do feed não servia para professor — ela filtra pela
-- turma em que a pessoa está matriculada, e professor normalmente não
-- está matriculado em nada.
--
-- Tabela separada, e não uma coluna em `profile_turmas`, porque os dois
-- vínculos significam coisas diferentes e são lidos por gente
-- diferente: `profile_turmas` alimenta o rótulo do feed, o distintivo
-- de turma, o ranking e a lista de chamada. Um professor entrando lá
-- passaria a contar como aluno matriculado em todos esses lugares.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- Turmas em que a pessoa dá aula. Uma pessoa pode ensinar em várias, e
-- a mesma turma pode ter mais de um professor/monitor.
--
-- `turma` é texto solto, igual a `profile_turmas` e `alunos_cadastrados`:
-- a turma é identificada pelo nome em todo o resto do esquema, e uma FK
-- aqui só nesta tabela criaria uma regra que nenhuma outra segue.
create table if not exists public.turma_professores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turma text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, turma)
);

-- Buscar "quem dá aula na turma X" (o outro sentido já é coberto pela
-- chave primária).
create index if not exists turma_professores_turma_idx
  on public.turma_professores (turma);

comment on table public.turma_professores is
  'Turmas em que a pessoa DÁ AULA (não em que estuda — isso é '
  'profile_turmas). Só a organização escreve. Ver migração 023.';

alter table public.turma_professores enable row level security;

-- Mesma regra de profile_turmas e profile_cargos: todos leem, só
-- organizador escreve. Ler é liberado porque não há nada sensível aqui
-- (o feed já é visível para qualquer pessoa logada) e porque quem
-- escreve é que precisa ser controlado — é isso que impede um aluno de
-- se declarar professor do Avançado.
drop policy if exists "turma_professores_select" on public.turma_professores;
create policy "turma_professores_select" on public.turma_professores
  for select to authenticated using (true);

drop policy if exists "turma_professores_write" on public.turma_professores;
create policy "turma_professores_write" on public.turma_professores
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- "Encerrar semestre" limpa esta tabela junto com as matrículas: a
-- equipe do projeto tem rotatividade alta de um semestre para o outro, e
-- um vínculo de ensino que sobrevivesse sozinho deixaria ex-professor
-- vendo o feed da turma de quem assumiu. Quem continua dando aula é
-- remarcado no painel depois da matrícula nova — isso não vem em
-- planilha, é sempre na mão.
-- ============================================================
