-- ============================================================
-- MIGRAÇÃO 041 — Caça aos professores
--
-- Emblema por dançar com a equipe de professores no semestre. O app
-- calcula o progresso (quem é caçado, a meta, o nível) a partir das
-- duplas confirmadas; o banco guarda só o que precisa ficar parado:
--
--   - profiles.papel_principal: a função (Condutor(a)/Conduzido(a)) de
--     quem está sem turma ou de quem é professor, que não tem papel em
--     turma. Nulo = ainda não escolheu.
--   - caca_semestres / caca_equipe / caca_resultados: a foto do semestre
--     encerrado. A equipe muda (professor sai, professor entra), então o
--     resultado de cada aluno é congelado junto com a equipe daquele dia.
--
-- Por que o app calcula e o banco só guarda: a regra (papel pela turma
-- de nível mais alto, meta, degraus) vive em lib/caca.ts, junto do resto
-- da retrospectiva; duplicá-la em SQL seria manter duas regras.
--
-- O "Encerrar semestre" chama guardar_caca_do_semestre() com o que o app
-- calculou. Só a organização escreve (a função); todo mundo logado lê,
-- porque o emblema aparece no perfil.
--
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.profiles
  add column if not exists papel_principal text;

alter table public.profiles drop constraint if exists profiles_papel_principal_check;
alter table public.profiles add constraint profiles_papel_principal_check
  check (papel_principal in ('Condutor(a)', 'Conduzido(a)'));

create table if not exists public.caca_semestres (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz,
  fim timestamptz not null default now()
);

create table if not exists public.caca_equipe (
  semestre_id uuid not null references public.caca_semestres(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null check (papel in ('Condutor(a)', 'Conduzido(a)')),
  primary key (semestre_id, user_id)
);

create table if not exists public.caca_resultados (
  semestre_id uuid not null references public.caca_semestres(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nivel int not null check (nivel between 1 and 4),
  pegos int not null,
  meta int not null,
  total_equipe int not null,
  primary key (semestre_id, user_id)
);

alter table public.caca_semestres enable row level security;
alter table public.caca_equipe enable row level security;
alter table public.caca_resultados enable row level security;

-- Só leitura: a escrita passa pela função (security definer)
drop policy if exists "caca_semestres_select" on public.caca_semestres;
drop policy if exists "caca_equipe_select" on public.caca_equipe;
drop policy if exists "caca_resultados_select" on public.caca_resultados;
create policy "caca_semestres_select" on public.caca_semestres
  for select to authenticated using (true);
create policy "caca_equipe_select" on public.caca_equipe
  for select to authenticated using (true);
create policy "caca_resultados_select" on public.caca_resultados
  for select to authenticated using (true);

/**
 * Chamada pelo "Encerrar semestre": guarda a foto da caça calculada pelo
 * app. p = {"inicio": iso|null, "equipe": [{"user_id","papel"}],
 * "resultados": [{"user_id","nivel","pegos","meta","total_equipe"}]}.
 * Só entra quem chegou ao nível 1 (o check recusa 0). Tudo numa
 * transação só; devolve o id do semestre guardado.
 */
create or replace function public.guardar_caca_do_semestre(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if not is_organizador() then
    raise exception 'Só a organização encerra o semestre';
  end if;

  insert into caca_semestres (inicio)
  values (nullif(p->>'inicio', '')::timestamptz)
  returning id into sid;

  insert into caca_equipe (semestre_id, user_id, papel)
  select sid, (e->>'user_id')::uuid, e->>'papel'
  from jsonb_array_elements(coalesce(p->'equipe', '[]'::jsonb)) e;

  insert into caca_resultados (semestre_id, user_id, nivel, pegos, meta, total_equipe)
  select sid, (r->>'user_id')::uuid, (r->>'nivel')::int, (r->>'pegos')::int,
         (r->>'meta')::int, (r->>'total_equipe')::int
  from jsonb_array_elements(coalesce(p->'resultados', '[]'::jsonb)) r;

  return sid;
end;
$$;

grant execute on function public.guardar_caca_do_semestre(jsonb) to authenticated;
