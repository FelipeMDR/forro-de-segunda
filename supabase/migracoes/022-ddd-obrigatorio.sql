-- ============================================================
-- MIGRAÇÃO 022 — Telefone: DDD volta a valer, agora obrigatório
--
-- A migração 021 resolveu o 9º dígito comparando só os 8 últimos
-- dígitos — e, ao fazer isso, jogou fora o DDD inteiro. Fazia sentido
-- quando o projeto era só de Itajubá; deixou de fazer sentido porque o
-- projeto recebe gente de fora, e dois alunos podem ter a mesma linha
-- final em cidades diferentes sem serem a mesma pessoa.
--
-- Esta migração:
--   1. Separa telefone em DDD (2 dígitos) e LINHA (8 dígitos, sem o 9º
--      dígito do celular) — `telefone_ddd` e `telefone_linha`.
--   2. Reescreve `telefones_batem`: quando os DOIS números têm DDD, ele
--      PRECISA bater. Número antigo sem DDD (de antes desta regra
--      existir) continua casando só pela linha — é o melhor que dá
--      para fazer sem inventar um DDD que ninguém informou.
--   3. Passa a EXIGIR DDD no cadastro novo (`telefone_na_lista` e
--      `handle_new_user`): sem DDD, o telefone não é reconhecido nem
--      na lista, nem para copiar turma/convites. Mesma regra do
--      `telefoneValido` no app (ver lib/phone.ts).
--
-- Dado antigo sem DDD continua funcionando (não precisa corrigir a
-- base retroativamente) — a exigência vale para quem digita a partir
-- de agora.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- DDD (2 dígitos) do telefone, ou null se não deu pra identificar um
-- (número sem DDD — formato antigo, hoje não mais aceito no cadastro).
-- Mesma regra de `nucleoTelefone` em src/lib/phone.ts:
--   11 dígitos = DDD + 9 + linha  -> DDD
--   10 dígitos = DDD + linha      -> DDD
--    9 ou 8 dígitos = sem DDD     -> null
create or replace function public.telefone_ddd(t text)
returns text
language sql
immutable
as $$
  select case length(regexp_replace(coalesce(t, ''), '\D', '', 'g'))
    when 11 then left(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 2)
    when 10 then left(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 2)
    else null
  end;
$$;

-- Os 8 dígitos da linha, sem DDD e sem o 9º dígito do celular.
create or replace function public.telefone_linha(t text)
returns text
language sql
immutable
as $$
  select case length(regexp_replace(coalesce(t, ''), '\D', '', 'g'))
    when 11 then substring(regexp_replace(coalesce(t, ''), '\D', '', 'g') from 4 for 8)
    when 10 then right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
    when 9 then right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
    when 8 then regexp_replace(coalesce(t, ''), '\D', '', 'g')
    else ''
  end;
$$;

-- Substitui a versão da migração 021, que comparava só a linha.
create or replace function public.telefones_batem(a text, b text)
returns boolean
language sql
immutable
as $$
  select
    public.telefone_linha(a) <> ''
    and public.telefone_linha(a) = public.telefone_linha(b)
    and (
      public.telefone_ddd(a) is null
      or public.telefone_ddd(b) is null
      or public.telefone_ddd(a) = public.telefone_ddd(b)
    );
$$;

comment on function public.telefones_batem(text, text) is
  'Mesmo telefone: linha (8 dígitos) igual, e DDD igual quando os dois '
  'lados o informam. Ver o cabeçalho da migração 022 para o motivo.';

-- ------------------------------------------------------------
-- Consulta pré-cadastro: agora exige DDD para achar o telefone
-- ------------------------------------------------------------
create or replace function public.telefone_na_lista(tel text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a record;
  tem_na_lista boolean;
  eh_convidado boolean;
  nome_convite text;
  conta boolean;
begin
  if public.telefone_ddd(tel) is null then
    return jsonb_build_object('existe', false, 'nome', null, 'ja_tem_conta', false);
  end if;

  select nome into a from alunos_cadastrados
  where public.telefones_batem(telefone, tel)
  limit 1;
  tem_na_lista := found;

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
    'nome', coalesce(a.nome, nome_convite),
    'ja_tem_conta', conta
  );
end;
$$;

grant execute on function public.telefone_na_lista(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Cadastro: mesma troca de guarda (DDD obrigatório em vez de 8 dígitos)
-- ------------------------------------------------------------
-- Igual à da migração 021, trocando `length(tel_norm) >= 8` por
-- `public.telefone_ddd(tel) is not null` nas quatro checagens.
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
    and nome is not null
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
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
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

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Números já gravados sem DDD continuam funcionando normalmente (a
-- exigência vale só para quem digita a partir de agora) — mas se
-- quiser ver quantos ainda estão nesse estado:
--
--   select count(*) from alunos_cadastrados where telefone_ddd(telefone) is null;
--   select count(*) from profiles where telefone is not null and telefone_ddd(telefone) is null;
-- ============================================================
