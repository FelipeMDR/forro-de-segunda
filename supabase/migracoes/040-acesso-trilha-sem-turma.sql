-- ============================================================
-- MIGRAÇÃO 040 — Acesso à trilha de quem está sem turma
--
-- Quem não está em turma no semestre (em geral veteranos que só vão ao
-- Espaço Livre) vê o acervo da trilha: só os passos que a turma mais
-- atrasada do nível já teve em aula, sem chave (lib/trilha.ts). Esta
-- tabela diz ATÉ QUE NÍVEL vai esse acervo; sem linha = Iniciante.
--
-- De onde vem o nível:
--   - "Encerrar semestre" chama guardar_niveis_do_semestre(), que troca
--     a tabela inteira pelo maior nível que cada aluno teve numa turma
--     naquele semestre. Quem já estava sem turma perde a linha e volta
--     para Iniciante (um semestre de fora mantém o nível; dois, não).
--   - A organização ajusta à mão pelo painel; vale até o próximo
--     encerramento.
--
-- Só a organização escreve; cada um lê o próprio nível.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.trilha_acesso (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nivel text not null check (nivel in ('intermediario', 'avancado')),
  atualizado_em timestamptz not null default now()
);

alter table public.trilha_acesso enable row level security;

drop policy if exists "trilha_acesso_select" on public.trilha_acesso;
drop policy if exists "trilha_acesso_insert" on public.trilha_acesso;
drop policy if exists "trilha_acesso_update" on public.trilha_acesso;
drop policy if exists "trilha_acesso_delete" on public.trilha_acesso;
create policy "trilha_acesso_select" on public.trilha_acesso
  for select using (user_id = auth.uid() or is_organizador());
create policy "trilha_acesso_insert" on public.trilha_acesso
  for insert with check (is_organizador());
create policy "trilha_acesso_update" on public.trilha_acesso
  for update using (is_organizador()) with check (is_organizador());
create policy "trilha_acesso_delete" on public.trilha_acesso
  for delete using (is_organizador());

/**
 * Chamada pelo "Encerrar semestre" ANTES de apagar as matrículas: guarda
 * o maior nível de cada aluno nas turmas do semestre. Iniciante não
 * precisa de linha (é o padrão). Tudo numa transação só.
 */
create or replace function public.guardar_niveis_do_semestre()
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_organizador() then
    raise exception 'Só a organização encerra o semestre';
  end if;
  delete from trilha_acesso where true;
  insert into trilha_acesso (user_id, nivel)
  select pt.user_id,
         case max(case t.nivel when 'avancado' then 3 when 'intermediario' then 2 else 1 end)
           when 3 then 'avancado' else 'intermediario' end
  from profile_turmas pt
  join turmas t on t.nome = pt.turma
  where t.nivel in ('intermediario', 'avancado')
  group by pt.user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.guardar_niveis_do_semestre() to authenticated;
