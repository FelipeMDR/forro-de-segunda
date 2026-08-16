-- ============================================================
-- MIGRAÇÃO 019 — Registro do consentimento (LGPD)
--
-- A LGPD pede prova de consentimento: quem aceitou, quando, e A QUE
-- TEXTO aquele "sim" se referia. Guardar só a data não bastaria —
-- daqui a um ano, com o aviso já reescrito, ninguém saberia dizer o
-- que a pessoa aceitou. Por isso a VERSÃO fica gravada junto.
--
-- O aceite viaja como metadado do cadastro (raw_user_meta_data) e o
-- gatilho o copia para o perfil, do mesmo jeito que já acontece com o
-- telefone. Assim ele nasce com a conta, numa transação só: não existe
-- janela em que a conta exista sem o registro do aceite.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.profiles
  add column if not exists termos_aceitos_em timestamptz,
  add column if not exists termos_versao text;

comment on column public.profiles.termos_aceitos_em is
  'Quando a pessoa aceitou o aviso de privacidade, no cadastro.';
comment on column public.profiles.termos_versao is
  'Qual versão do aviso foi aceita (ver VERSAO_TERMOS no app).';

-- ------------------------------------------------------------
-- Cadastro: grava o aceite junto com o resto
-- ------------------------------------------------------------
-- Igual à da migração 013, somando as duas colunas do consentimento.
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
  versao text;
begin
  tel := new.raw_user_meta_data ->> 'telefone';
  tel_norm := normalizar_telefone(coalesce(tel, ''));
  versao := new.raw_user_meta_data ->> 'termos_versao';

  select nome into nome_lista from alunos_cadastrados
  where normalizar_telefone(telefone) = tel_norm
    and length(tel_norm) >= 8
    and nome is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where telefone = tel_norm and length(tel_norm) >= 8
  limit 1;

  insert into profiles (
    id, nome, avatar_url, telefone, email,
    termos_versao, termos_aceitos_em
  )
  values (
    new.id,
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
      nome_convite,
      'Dançarino(a)'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(trim(coalesce(tel, '')), ''),
    -- Só o e-mail de verdade; o sintético não serve para nada aqui
    case when new.email like '%@alunos.forrodesegunda.app' then null
         else new.email end,
    versao,
    -- Sem versão não houve aceite: contas antigas ficam com nulo, e é
    -- assim que a organização sabe de quem ainda falta pedir.
    case when versao is null then null else now() end
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

-- ------------------------------------------------------------
-- Registrar o aceite de quem já tem conta
-- ------------------------------------------------------------
-- Contas criadas antes desta migração não passaram por tela nenhuma.
-- O app pede o aceite na próxima entrada e chama esta função — que só
-- escreve para o próprio usuário e só se ainda estiver em branco (o
-- consentimento é um fato datado, não um campo a sobrescrever).
create or replace function public.aceitar_termos(p_versao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  update public.profiles
  set termos_versao = p_versao,
      termos_aceitos_em = now()
  where id = auth.uid()
    and termos_aceitos_em is null;
end;
$$;

revoke all on function public.aceitar_termos(text) from public, anon;
grant execute on function public.aceitar_termos(text) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Para saber quem ainda não aceitou:
--   select count(*) from public.profiles where termos_aceitos_em is null;
-- ============================================================
