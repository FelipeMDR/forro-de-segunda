-- ============================================================
-- MIGRAÇÃO 011 — Aluno sem turma no semestre
--
-- Veteranos que não fazem mais aula mas continuam frequentando os
-- espaços livres precisam de conta no app. A lista de chamada exigia
-- turma (`turma text not null`), então não havia como cadastrá-los:
-- a organização era obrigada a inventar uma turma para eles.
--
-- Agora a turma é opcional na lista. Sem turma, a linha serve só para
-- LIBERAR o cadastro — a pessoa entra no app sem vínculo de turma, e a
-- organização pode dar uma turma depois pelo painel, se ela voltar a
-- fazer aula.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.alunos_cadastrados
  alter column turma drop not null;

-- Sem turma, "" e NULL significam a mesma coisa; normalizar evita duas
-- linhas para a mesma pessoa e simplifica as consultas.
update public.alunos_cadastrados
set turma = null
where btrim(coalesce(turma, '')) = '';

/**
 * Recria handle_new_user com uma única mudança: não tenta copiar turma
 * nula para profile_turmas (onde a coluna é NOT NULL, o que abortaria o
 * cadastro do veterano). O resto — nome, convites de desafio, papel —
 * segue igual à migração 010.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tel text;
  tel_norm text;
  nome_lista text;
  nome_convite text;
begin
  tel := new.raw_user_meta_data ->> 'telefone';
  tel_norm := normalizar_telefone(coalesce(tel, ''));

  select nome into nome_lista from alunos_cadastrados
  where normalizar_telefone(telefone) = tel_norm
    and length(tel_norm) >= 8
    and nome is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where telefone = tel_norm and length(tel_norm) >= 8
  limit 1;

  insert into profiles (id, nome, avatar_url, telefone)
  values (
    new.id,
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
      nome_convite,
      'Dançarino(a)'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(trim(coalesce(tel, '')), '')
  )
  on conflict (id) do nothing;

  -- `a.turma is not null`: veterano sem turma entra sem vínculo nenhum
  insert into profile_turmas (user_id, turma, papel_danca)
  select new.id, a.turma, a.papel_danca
  from alunos_cadastrados a
  where normalizar_telefone(a.telefone) = tel_norm
    and length(tel_norm) >= 8
    and a.turma is not null
  on conflict (user_id, turma) do nothing;

  if length(tel_norm) >= 8 then
    insert into challenge_members (challenge_id, user_id)
    select v.challenge_id, new.id
    from challenge_convidados v
    where v.telefone = tel_norm
    on conflict (challenge_id, user_id) do nothing;

    delete from challenge_convidados where telefone = tel_norm;
  end if;

  insert into roles (user_id, papel) values (new.id, 'aluno')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Cadastrar um veterano direto pelo SQL (o normal é pelo painel):
--   insert into public.alunos_cadastrados (nome, telefone, turma)
--   values ('Fulano Veterano', '35 99999-0000', null);
--
-- Ver quem está sem turma no semestre:
--   select nome, telefone from public.alunos_cadastrados
--   where turma is null;
-- ============================================================
