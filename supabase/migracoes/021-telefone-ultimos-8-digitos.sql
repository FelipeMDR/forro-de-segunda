-- ============================================================
-- MIGRAÇÃO 021 — Achar o telefone na lista pelos últimos 8 dígitos
--
-- Alunos relatavam "meu telefone não está cadastrado" mesmo estando na
-- lista de chamada. O motivo: a lista é digitada à mão, semestre após
-- semestre, e às vezes um número entra sem o 9º dígito do celular
-- ("3599998888") enquanto a pessoa, ao criar a conta, digita do jeito
-- normal, com o 9 ("35999998888").
--
-- A normalização de antes (`normalizar_telefone`, últimos 10 dígitos)
-- não resolve isso — PIORA: cortar pela direita desalinha tudo a partir
-- do 9. "1234-5678" com o 9 na frente vira "91234-567" nos últimos 10
-- dígitos; sem o 9, os últimos 10 são "3512345678". Dígito a dígito
-- diferentes, mesmo sendo o mesmo número.
--
-- A solução: comparar só os 8 últimos dígitos (a linha, sem DDD e sem o
-- 9). Esses 8 são estáveis nos dois formatos, então a dupla passa a
-- bater. O projeto é de uma cidade só, e dois alunos com o mesmo final
-- de linha em DDDs diferentes é praticamente impossível — o risco de
-- colisão que essa folga abre é bem menor que o problema que resolve.
--
-- Só as COMPARAÇÕES mudam. `normalizar_telefone` (10 dígitos) continua
-- exatamente como está, porque também é usada para CALCULAR valores — o
-- e-mail sintético de quem ainda entra por telefone, a chave da lista de
-- senhas do modo demo. Mudar esses cálculos trocaria o e-mail/chave de
-- contas que já existem, e destrancaria exatamente o problema que essa
-- migração quer resolver.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.telefones_batem(a text, b text)
returns boolean
language sql
immutable
as $$
  select
    length(right(regexp_replace(coalesce(a, ''), '\D', '', 'g'), 8)) = 8
    and right(regexp_replace(coalesce(a, ''), '\D', '', 'g'), 8)
      = right(regexp_replace(coalesce(b, ''), '\D', '', 'g'), 8);
$$;

comment on function public.telefones_batem(text, text) is
  'Mesmo telefone, comparando só os 8 últimos dígitos (sem DDD, sem o 9º '
  'dígito do celular). Ver o cabeçalho da migração 021 para o motivo.';

-- ------------------------------------------------------------
-- Consulta pré-cadastro: "meu telefone está na lista?"
-- ------------------------------------------------------------
-- Igual à da migração 010, trocando as comparações por telefones_batem.
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
  if length(regexp_replace(coalesce(tel, ''), '\D', '', 'g')) < 8 then
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
-- Cadastro: nome, turma e convites da lista de chamada
-- ------------------------------------------------------------
-- Igual à da migração 019 (a mais recente), trocando as comparações de
-- telefone por telefones_batem — inclusive o DELETE do convite ao
-- final, que também precisava da folga: sem ela, um convite que só
-- batia pelos 8 dígitos entrava na conta (linha de challenge_members
-- abaixo) mas nunca era apagado de challenge_convidados, e ficava um
-- convite fantasma para sempre.
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
  where public.telefones_batem(telefone, tel)
    and length(tel_norm) >= 8
    and nome is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where public.telefones_batem(telefone, tel) and length(tel_norm) >= 8
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
  where public.telefones_batem(a.telefone, tel)
    and length(tel_norm) >= 8
    and a.turma is not null
  on conflict (user_id, turma) do nothing;

  if length(tel_norm) >= 8 then
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
-- Isto resolve o cadastro NOVO a partir de agora. Quem já tentou e
-- desistiu, ou já criou conta sem turma por causa do 9 faltando,
-- precisa de um ajuste manual — normalmente pelo Painel > Pessoas.
--
-- Para achar contas que provavelmente caíram nessa (têm telefone mas
-- não têm turma nenhuma, e existe alguém na lista com final parecido):
--
--   select p.id, p.nome, p.telefone, a.nome as nome_na_lista, a.telefone as telefone_na_lista
--   from profiles p
--   join alunos_cadastrados a on public.telefones_batem(p.telefone, a.telefone)
--   where not exists (
--     select 1 from profile_turmas pt where pt.user_id = p.id
--   );
-- ============================================================
