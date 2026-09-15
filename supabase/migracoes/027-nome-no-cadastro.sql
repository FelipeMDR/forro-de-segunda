-- ============================================================
-- MIGRAÇÃO 027 — Conta não nasce mais "Dançarino(a)"
--
-- O QUE ACONTECIA
-- `profiles.nome` é obrigatório, e `handle_new_user` preenche com o
-- nome da lista de chamada. Quando a lista não tinha nome para o
-- telefone (planilha importada sem a coluna, linha em branco, aluno
-- cadastrado à mão só com o telefone), o gatilho caía no último
-- recurso: 'Dançarino(a)'. A tela de cadastro nunca perguntou o nome,
-- então o metadado `nome` — que o gatilho já sabia ler — ia sempre
-- vazio. Resultado: contas anônimas no painel, e a pessoa nem
-- desconfia, porque ela sabe quem é.
--
-- O QUE MUDA
-- 1. A tela de cadastro passa a pedir o nome QUANDO a lista não tem, e
--    manda no metadado. O gatilho passa a preferir o metadado à lista:
--    a tela só pergunta quando a lista está em branco, então na prática
--    a lista continua mandando sempre que tem algo — e quando não tem,
--    vale o que a pessoa digitou, sem depender da ordem das linhas.
-- 2. `telefone_na_lista` devolve o nome de QUALQUER linha que tenha um.
--    Antes pegava a primeira linha do telefone; se ela estava sem nome e
--    a segunda (outra turma) tinha, a tela dizia "sem nome" e o gatilho
--    achava o nome — as duas funções olhavam a mesma lista e discordavam.
--
-- Não mexe nas contas que já estão com 'Dançarino(a)': essas o app
-- pergunta no feed, e `corrigir-nomes.sql` ajuda a organização a
-- cruzar com a lista de chamada.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.telefone_na_lista(tel text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  tem_na_lista boolean;
  nome_lista text;
  eh_convidado boolean;
  nome_convite text;
  conta boolean;
begin
  if public.telefone_ddd(tel) is null then
    return jsonb_build_object('existe', false, 'nome', null, 'ja_tem_conta', false);
  end if;

  select exists (
    select 1 from alunos_cadastrados
    where public.telefones_batem(telefone, tel)
  ) into tem_na_lista;

  -- Linha com nome primeiro: o telefone pode estar em duas turmas e só
  -- uma delas ter vindo com o nome preenchido.
  select nome into nome_lista from alunos_cadastrados
  where public.telefones_batem(telefone, tel)
    and nullif(trim(nome), '') is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where public.telefones_batem(telefone, tel)
  limit 1;
  eh_convidado := found;

  select exists (
    select 1 from profiles
    where telefone is not null
      and public.telefones_batem(telefone, tel)
  ) into conta;

  return jsonb_build_object(
    'existe', tem_na_lista or eh_convidado,
    'nome', coalesce(nome_lista, nome_convite),
    'ja_tem_conta', conta
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tel text;
  tem_ddd boolean;
  nome_lista text;
  nome_convite text;
  versao text;
begin
  tel := new.raw_user_meta_data ->> 'telefone';
  tem_ddd := public.telefone_ddd(tel) is not null;
  versao := new.raw_user_meta_data ->> 'termos_versao';

  select nome into nome_lista from alunos_cadastrados
  where tem_ddd
    and public.telefones_batem(telefone, tel)
    and nullif(trim(nome), '') is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where tem_ddd and public.telefones_batem(telefone, tel)
  limit 1;

  insert into profiles (
    id, nome, avatar_url, telefone, email,
    termos_versao, termos_aceitos_em
  )
  values (
    new.id,
    -- O que a pessoa digitou vem antes da lista: a tela só pergunta
    -- quando `telefone_na_lista` não achou nome, então quando o
    -- metadado existe é porque a lista não tinha.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      nome_lista,
      nome_convite,
      'Dançarino(a)'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(trim(coalesce(tel, '')), ''),
    case when new.email like '%@alunos.forrodesegunda.app' then null
         else new.email end,
    versao,
    case when versao is null then null else now() end
  )
  on conflict (id) do nothing;

  -- `a.turma is not null`: veterano sem turma entra sem vínculo nenhum
  insert into profile_turmas (user_id, turma, papel_danca)
  select new.id, a.turma, a.papel_danca
  from alunos_cadastrados a
  where tem_ddd
    and public.telefones_batem(a.telefone, tel)
    and a.turma is not null
  on conflict (user_id, turma) do nothing;

  if tem_ddd then
    insert into challenge_members (challenge_id, user_id)
    select v.challenge_id, new.id
    from challenge_convidados v
    where public.telefones_batem(v.telefone, tel)
    on conflict (challenge_id, user_id) do nothing;

    delete from challenge_convidados where public.telefones_batem(telefone, tel);
  end if;

  insert into roles (user_id, papel) values (new.id, 'aluno')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
