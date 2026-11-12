-- ============================================================
-- MIGRAÇÃO 043 — Desafio de ingresso (Forró na Rep)
--
-- O PROBLEMA
-- Quem comprou ingresso para a festa entra no desafio de entrada
-- restrita (migração 010), mas a lista de compradores vive numa
-- planilha do Google e a organização tinha de importá-la à mão, de
-- novo a cada venda. E o distintivo de quem foi à festa dependia de
-- alguém lembrar de marcar.
--
-- O QUE MUDA
-- 1. O desafio ganha data e horário da festa (`evento_data`,
--    `evento_inicio`, `evento_fim`). Isso o marca como "desafio de
--    ingresso" e dá ao banco o que ele precisa para saber, sozinho,
--    quem esteve na festa.
-- 2. `origem` ('manual' ou 'planilha') em `challenge_members` e
--    `challenge_convidados`: a sincronização com a planilha só mexe no
--    que ela mesma trouxe. Quem a organização adicionou à mão nunca
--    sai por ela. Quando um convidado da planilha cria a conta, a
--    origem acompanha (`membro_por_convite`).
-- 3. `ingresso_segredos`: o Apps Script da planilha chama o banco com a
--    chave anon (pública), e quem protege é um segredo por desafio.
--    Só o HASH fica guardado; o texto aparece uma única vez, quando a
--    organização o gera. A tabela não tem policy nenhuma: só funções
--    security definer chegam nela.
-- 4. Distintivo DERIVADO (`ingressos_do_perfil`): nada é gravado quando
--    a pessoa entra na festa. "Ingresso garantido" vale para quem é
--    membro; "Marquei presença" para quem tem um check-in válido dentro
--    do horário da festa (a festa passa da meia-noite: 18:00 até 04:00
--    do dia seguinte). A organização corrige casos à mão em
--    `ingresso_presencas` (`marcar_presenca_ingresso`), e a correção
--    vence o automático.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- ---------- Estrutura do desafio de ingresso ----------

alter table public.challenges
  add column if not exists evento_data date,
  add column if not exists evento_inicio time,
  add column if not exists evento_fim time,
  -- Outros desafios cujos check-ins também valem como "noite extra"
  add column if not exists noite_extra_para uuid[] not null default '{}',
  add column if not exists ingresso_emoji text,
  add column if not exists ingresso_titulo text,
  add column if not exists presenca_emoji text,
  add column if not exists presenca_titulo text;

alter table public.challenges drop constraint if exists challenges_ingresso_completo;
alter table public.challenges add constraint challenges_ingresso_completo
  check (
    evento_data is null
    or (entrada_restrita and evento_inicio is not null and evento_fim is not null)
  );

-- ---------- Origem de quem entra ----------

alter table public.challenge_members
  add column if not exists origem text not null default 'manual';
alter table public.challenge_members drop constraint if exists challenge_members_origem_check;
alter table public.challenge_members add constraint challenge_members_origem_check
  check (origem in ('manual', 'planilha'));

alter table public.challenge_convidados
  add column if not exists origem text not null default 'manual';
alter table public.challenge_convidados drop constraint if exists challenge_convidados_origem_check;
alter table public.challenge_convidados add constraint challenge_convidados_origem_check
  check (origem in ('manual', 'planilha'));

-- ---------- Tabelas novas ----------

create table if not exists public.ingresso_segredos (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  segredo_hash text not null,
  criado_em timestamptz not null default now()
);
-- Sem policy de propósito: nem a organização lê o hash pela API.
alter table public.ingresso_segredos enable row level security;

create table if not exists public.ingresso_sincronizacoes (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  em timestamptz not null,
  resumo jsonb not null
);
alter table public.ingresso_sincronizacoes enable row level security;
drop policy if exists "ingresso_sync_select" on public.ingresso_sincronizacoes;
create policy "ingresso_sync_select" on public.ingresso_sincronizacoes
  for select to authenticated
  using (public.is_organizador());

create table if not exists public.ingresso_presencas (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  esteve boolean not null,
  primary key (challenge_id, user_id)
);
alter table public.ingresso_presencas enable row level security;
drop policy if exists "ingresso_presencas_organizador" on public.ingresso_presencas;
create policy "ingresso_presencas_organizador" on public.ingresso_presencas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ---------- Segredo da planilha ----------

create or replace function public.gerar_segredo_ingresso(p_desafio uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  segredo text;
begin
  if not public.is_organizador() then
    raise exception 'Só a organização liga a planilha';
  end if;
  if not exists (
    select 1 from challenges where id = p_desafio and evento_data is not null
  ) then
    raise exception 'Este desafio não é de ingresso';
  end if;

  segredo := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into ingresso_segredos (challenge_id, segredo_hash)
  values (p_desafio, encode(sha256(convert_to(segredo, 'UTF8')), 'hex'))
  on conflict (challenge_id) do update
    set segredo_hash = excluded.segredo_hash, criado_em = now();

  return segredo;
end;
$$;

grant execute on function public.gerar_segredo_ingresso(uuid) to authenticated;

-- ---------- Convite vira membro (acompanha a origem) ----------

create or replace function public.membro_por_convite(p_user uuid, p_tel text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into challenge_members (challenge_id, user_id, origem)
  select v.challenge_id, p_user, v.origem
  from challenge_convidados v
  where public.telefones_batem(v.telefone, p_tel)
  on conflict (challenge_id, user_id) do nothing;

  delete from challenge_convidados where public.telefones_batem(telefone, p_tel);
end;
$$;

-- Só o gatilho de cadastro chama: por API, qualquer um poria qualquer
-- conta em qualquer desafio.
revoke execute on function public.membro_por_convite(uuid, text) from public, anon, authenticated;

-- Igual à versão da migração 027, trocando só o bloco dos convites.
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
    perform public.membro_por_convite(new.id, tel);
  end if;

  insert into roles (user_id, papel) values (new.id, 'aluno')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------- Distintivo derivado ----------

create or replace function public.ingressos_do_perfil(p_user uuid)
returns table (
  desafio_id uuid,
  titulo text,
  estado text,
  emoji text,
  titulo_distintivo text,
  desde timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with festa as (
    select
      c.id, c.titulo, m.entrou_em,
      c.ingresso_emoji, c.ingresso_titulo, c.presenca_emoji, c.presenca_titulo,
      -- A festa cruza a meia-noite quando o fim é antes do início
      ((c.evento_data + c.evento_inicio) at time zone 'America/Sao_Paulo') as abre,
      ((c.evento_data + (c.evento_fim < c.evento_inicio)::int + c.evento_fim)
        at time zone 'America/Sao_Paulo') as fecha,
      (select p.esteve from ingresso_presencas p
        where p.challenge_id = c.id and p.user_id = p_user) as correcao
    from challenges c
    join challenge_members m on m.challenge_id = c.id and m.user_id = p_user
    where c.evento_data is not null
  ),
  com_checkin as (
    select f.*,
      (select min(k.criado_em) from checkins k
        where k.user_id = p_user
          and not k.presenca_anulada
          and k.criado_em between f.abre and f.fecha) as primeiro
    from festa f
  ),
  decidido as (
    select cc.*,
      coalesce(cc.correcao, cc.primeiro is not null) as esteve
    from com_checkin cc
  )
  select
    d.id,
    d.titulo,
    case when d.esteve then 'presenca' else 'garantido' end,
    case when d.esteve then coalesce(d.presenca_emoji, '🎉')
         else coalesce(d.ingresso_emoji, '🎟️') end,
    case when d.esteve then coalesce(d.presenca_titulo, d.titulo || ' · Marquei presença')
         else coalesce(d.ingresso_titulo, d.titulo || ' · Ingresso garantido') end,
    -- Presença corrigida à mão sem check-in não tem instante de check-in:
    -- cai para a entrada no desafio
    case when d.esteve then coalesce(d.primeiro, d.entrou_em) else d.entrou_em end
  from decidido d
  order by d.abre;
$$;

grant execute on function public.ingressos_do_perfil(uuid) to authenticated;

create or replace function public.marcar_presenca_ingresso(
  p_desafio uuid, p_user uuid, p_esteve boolean
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_organizador() then
    raise exception 'Só a organização corrige a presença';
  end if;

  if p_esteve is null then
    delete from ingresso_presencas where challenge_id = p_desafio and user_id = p_user;
  else
    insert into ingresso_presencas (challenge_id, user_id, esteve)
    values (p_desafio, p_user, p_esteve)
    on conflict (challenge_id, user_id) do update set esteve = excluded.esteve;
  end if;
end;
$$;

grant execute on function public.marcar_presenca_ingresso(uuid, uuid, boolean) to authenticated;
