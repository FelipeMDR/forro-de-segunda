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
--    vence o automático. A lista do clube lê a mesma regra por
--    `presencas_do_clube` (só user_id e presente).
-- 5. `sincronizar_planilha_ingresso`: o Apps Script manda a aba crua e o
--    banco acha o cabeçalho, casa os telefones, põe e tira gente. Duas
--    proteções: a trava contra remoção em massa (a organização confirma
--    com `confirmar_remocoes_ingresso`) e o congelamento depois da festa.
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

-- `evento_data` no fim: o app só comemora edições recentes. Mudar as
-- colunas de retorno exige recriar a função.
drop function if exists public.ingressos_do_perfil(uuid);
create or replace function public.ingressos_do_perfil(p_user uuid)
returns table (
  desafio_id uuid,
  titulo text,
  estado text,
  emoji text,
  titulo_distintivo text,
  desde timestamptz,
  evento_data date
)
language sql stable security definer
set search_path = public
as $$
  with festa as (
    select
      c.id, c.titulo, m.entrou_em, c.evento_data,
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
    case when d.esteve then coalesce(d.primeiro, d.entrou_em) else d.entrou_em end,
    d.evento_data
  from decidido d
  order by d.abre;
$$;

-- Só quem está logado: deslogado não tem por que ler o perfil de ninguém
revoke execute on function public.ingressos_do_perfil(uuid) from public, anon;
grant execute on function public.ingressos_do_perfil(uuid) to authenticated;

-- Quem do clube marcou presença, para a lista pública do desafio. O
-- aluno não lê `ingresso_presencas` (só a organização), e o ranking só
-- vê check-ins: sem esta função, a correção à mão não aparecia na lista.
-- Mesma regra de `ingressos_do_perfil`: a correção vence; sem ela, vale
-- um check-in não anulado no horário da festa. Só user_id e presente,
-- nada de telefone nem de outro dado.
create or replace function public.presencas_do_clube(p_desafio uuid)
returns table (user_id uuid, presente boolean)
language sql stable security definer
set search_path = public
as $$
  with festa as (
    select
      c.id,
      ((c.evento_data + c.evento_inicio) at time zone 'America/Sao_Paulo') as abre,
      ((c.evento_data + (c.evento_fim < c.evento_inicio)::int + c.evento_fim)
        at time zone 'America/Sao_Paulo') as fecha
    from challenges c
    where c.id = p_desafio and c.evento_data is not null
  )
  select
    m.user_id,
    coalesce(
      (select p.esteve from ingresso_presencas p
        where p.challenge_id = f.id and p.user_id = m.user_id),
      exists (
        select 1 from checkins k
        where k.user_id = m.user_id
          and not k.presenca_anulada
          and k.criado_em between f.abre and f.fecha
      )
    )
  from festa f
  join challenge_members m on m.challenge_id = f.id;
$$;

revoke execute on function public.presencas_do_clube(uuid) from public, anon;
grant execute on function public.presencas_do_clube(uuid) to authenticated;

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

-- ---------- Sincronização da planilha ----------

-- O "agora" da sincronização. Em produção é só now(); existe para os
-- testes simularem o dia seguinte à festa com `create or replace`.
create or replace function public.ingresso_agora()
returns timestamptz
language sql stable
as $$ select now() $$;

-- Dígitos do telefone como veio da planilha. Quem copia do formulário
-- traz o +55 (12 ou 13 dígitos), e com ele `telefone_ddd` não acha o DDD;
-- por isso o 55 sai antes de validar.
create or replace function public.telefone_da_planilha(t text)
returns text
language sql immutable
as $$
  select case
    when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x;
$$;

-- Quem a planilha trouxe e não está mais nela: `origem 'planilha'` cujo
-- telefone não bate com nenhuma das chaves (DDD + linha) da grade. A
-- sincronização e a confirmação da organização usam esta mesma
-- definição. Com `p_apagar = false` só conta.
-- Sair do desafio tira o distintivo derivado (é de quem é membro), mas
-- `ingresso_presencas` fica: se a pessoa voltar, a correção volta junto.
-- Custo: cada telefone (chave, membro, convite) vira (DDD, linha) uma
-- vez só, e a comparação é pela linha, que o banco junta por hash. Com
-- `telefones_batem` em cada par seriam membros × chaves expressões
-- regulares, e a chamada anon tem poucos segundos. A regra é a mesma de
-- `telefones_batem`: a linha bate sempre; o DDD, quando os dois têm.
create or replace function public.remover_fora_da_planilha(
  p_desafio uuid, p_chaves text[], p_apagar boolean
)
returns int
language sql
set search_path = public
as $$
  with chaves as (
    select public.telefone_ddd(k) as ddd, public.telefone_linha(k) as linha
    from unnest(p_chaves) k
  ),
  membros_tel as (
    select m.user_id,
           public.telefone_ddd(p.telefone) as ddd,
           public.telefone_linha(p.telefone) as linha
    from challenge_members m
    left join profiles p on p.id = m.user_id
    where m.challenge_id = p_desafio and m.origem = 'planilha'
  ),
  convidados_tel as (
    select v.telefone,
           public.telefone_ddd(v.telefone) as ddd,
           public.telefone_linha(v.telefone) as linha
    from challenge_convidados v
    where v.challenge_id = p_desafio and v.origem = 'planilha'
  ),
  fora_membros as (
    select t.user_id from membros_tel t
    where not exists (
      select 1 from chaves c
      where t.linha <> '' and c.linha = t.linha
        and (t.ddd is null or c.ddd is null or t.ddd = c.ddd)
    )
  ),
  fora_convidados as (
    select t.telefone from convidados_tel t
    where not exists (
      select 1 from chaves c
      where t.linha <> '' and c.linha = t.linha
        and (t.ddd is null or c.ddd is null or t.ddd = c.ddd)
    )
  ),
  apaga_membros as (
    delete from challenge_members m
    using fora_membros f
    where p_apagar and m.challenge_id = p_desafio and m.user_id = f.user_id
  ),
  apaga_convidados as (
    delete from challenge_convidados v
    using fora_convidados f
    where p_apagar and v.challenge_id = p_desafio and v.telefone = f.telefone
  )
  select ((select count(*) from fora_membros) + (select count(*) from fora_convidados))::int;
$$;

-- Interna: por API, apagaria gente sem segredo nem organização.
revoke execute on function public.remover_fora_da_planilha(uuid, text[], boolean)
  from public, anon, authenticated;

-- Chamada pelo Apps Script com a chave anon. Quem protege é o segredo do
-- desafio. A resposta só tem índice e situação de cada linha e contagens:
-- nome e linha dos avisos vão para `ingresso_sincronizacoes`, que só a
-- organização lê.
create or replace function public.sincronizar_planilha_ingresso(p_segredo text, p_grade jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_desafio uuid;
  v_congelado boolean;
  v_grade jsonb := case when jsonb_typeof(p_grade) = 'array' then p_grade else '[]' end;
  v_total int;
  v_cab int;
  c_nome int;
  c_tel int;
  c_marcar int;
  a_nome int;
  a_tel int;
  a_marcar int;
  v_linha jsonb;
  v_nome text;
  v_cel text;
  v_tel text;
  v_chave text;
  v_ddd text;
  v_lin text;
  v_perfis uuid[];
  v_convites text[];
  v_perfis_por_linha jsonb;
  v_convites_por_linha jsonb;
  v_sit text;
  v_status text;
  v_chaves text[] := '{}';
  v_linhas jsonb := '[]';
  v_invalidos jsonb := '[]';
  v_ambiguos jsonb := '[]';
  n_dentro int := 0;
  n_aguardando int := 0;
  n_convites int;
  n_da_planilha int;
  n_fora int := 0;
  n_removidos int := 0;
  n_travadas int := 0;
begin
  -- `for update`: duas sincronizações do mesmo desafio esperam uma a outra
  select s.challenge_id,
         -- Congelamento (spec, "Congelamento depois do evento"): do dia
         -- seguinte à festa em diante, nada entra nem sai. Se a planilha
         -- for limpa ou reaproveitada, a edição que passou não perde os
         -- distintivos. `noite_do_checkin` vira o dia às 05:00, então a
         -- madrugada da festa ainda conta como dia da festa.
         coalesce(public.noite_do_checkin(public.ingresso_agora()) > c.evento_data, false)
    into v_desafio, v_congelado
  from ingresso_segredos s
  join challenges c on c.id = s.challenge_id
  where c.evento_data is not null
    and s.segredo_hash = encode(sha256(convert_to(coalesce(p_segredo, ''), 'UTF8')), 'hex')
  for update of s;

  if v_desafio is null then
    raise exception 'Segredo inválido';
  end if;

  -- A base da trava é quem já vinha da planilha antes deste envio
  select (select count(*) from challenge_members
           where challenge_id = v_desafio and origem = 'planilha')
       + (select count(*) from challenge_convidados
           where challenge_id = v_desafio and origem = 'planilha')
    into n_da_planilha;

  -- Telefones decompostos uma vez por chamada, não a cada linha da
  -- planilha: cada perfil e cada convite deste desafio vira (DDD, linha)
  -- uma vez só, num mapa pela linha. Por linha da planilha fica uma busca
  -- no mapa, em vez de `telefones_batem` (várias expressões regulares)
  -- contra todos os perfis; a chamada anon tem poucos segundos. A regra
  -- de casar é a de `telefones_batem`: a linha bate sempre, e o DDD
  -- quando os dois lados o têm (a chave da planilha sempre tem).
  -- O mapa de convites não precisa ser refeito durante o laço: convite
  -- novo tem a chave da própria linha, e outra linha com a mesma chave é
  -- `repetido` antes de consultar o mapa.
  select coalesce(jsonb_object_agg(x.linha, x.itens), '{}')
    into v_perfis_por_linha
  from (
    select t.linha, jsonb_agg(jsonb_build_object('id', t.id, 'ddd', t.ddd)) as itens
    from (
      select p.id,
             public.telefone_ddd(p.telefone) as ddd,
             public.telefone_linha(p.telefone) as linha
      from profiles p
    ) t
    where t.linha <> ''
    group by t.linha
  ) x;

  select coalesce(jsonb_object_agg(x.linha, x.itens), '{}')
    into v_convites_por_linha
  from (
    select t.linha, jsonb_agg(jsonb_build_object('tel', t.telefone, 'ddd', t.ddd)) as itens
    from (
      select v.telefone,
             public.telefone_ddd(v.telefone) as ddd,
             public.telefone_linha(v.telefone) as linha
      from challenge_convidados v
      where v.challenge_id = v_desafio
    ) t
    where t.linha <> ''
    group by t.linha
  ) x;

  -- Cabeçalho: a primeira linha com uma célula NOME e outra CELULAR ou
  -- TELEFONE (sem diferenciar maiúsculas e acentos). A coluna de marcar
  -- é a que começa com ADICIONADO, e é opcional.
  v_total := jsonb_array_length(v_grade);
  for i in 0 .. v_total - 1 loop
    select
      min(e.k - 1) filter (where e.t = 'NOME'),
      min(e.k - 1) filter (where e.t in ('CELULAR', 'TELEFONE')),
      min(e.k - 1) filter (where e.t like 'ADICIONADO%')
      into a_nome, a_tel, a_marcar
    from (
      select k, upper(translate(trim(v),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) as t
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_grade -> i) = 'array' then v_grade -> i else '[]' end
      ) with ordinality as x(v, k)
    ) e;

    if a_nome is not null and a_tel is not null then
      v_cab := i;
      c_nome := a_nome;
      c_tel := a_tel;
      c_marcar := a_marcar;
      exit;
    end if;
  end loop;

  if v_cab is not null then
    for i in v_cab + 1 .. v_total - 1 loop
      v_linha := case when jsonb_typeof(v_grade -> i) = 'array' then v_grade -> i else '[]' end;
      v_nome := trim(coalesce(v_linha ->> c_nome, ''));
      v_cel := trim(coalesce(v_linha ->> c_tel, ''));
      -- Linhas numeradas (QT.) sem nome nem telefone, no fim da lista
      continue when v_nome = '' and v_cel = '';

      v_tel := public.telefone_da_planilha(v_cel);
      v_ddd := public.telefone_ddd(v_tel);
      v_lin := public.telefone_linha(v_tel);
      v_sit := null;

      if v_ddd is null or length(v_lin) <> 8 then
        v_sit := 'telefone_invalido';
        v_invalidos := v_invalidos || jsonb_build_array(
          jsonb_build_object('linha', i + 1, 'nome', v_nome));
      else
        v_chave := v_ddd || v_lin;

        if v_chave = any(v_chaves) then
          v_sit := 'repetido';
        else
          v_chaves := v_chaves || v_chave;
          -- = telefones_batem(p.telefone, v_chave), pelo mapa
          select array_agg((e ->> 'id')::uuid) into v_perfis
          from jsonb_array_elements(coalesce(v_perfis_por_linha -> v_lin, '[]')) e
          where e ->> 'ddd' is null or e ->> 'ddd' = v_ddd;
          -- = telefones_batem(telefone, v_chave) nos convites do desafio
          select array_agg(e ->> 'tel') into v_convites
          from jsonb_array_elements(coalesce(v_convites_por_linha -> v_lin, '[]')) e
          where e ->> 'ddd' is null or e ->> 'ddd' = v_ddd;
          n_convites := coalesce(cardinality(v_convites), 0);

          if coalesce(cardinality(v_perfis), 0) > 1 then
            -- Contas antigas sem DDD casam só pela linha: ninguém entra
            -- por aqui, e a organização resolve à mão
            v_sit := 'ambiguo';
            v_ambiguos := v_ambiguos || jsonb_build_array(
              jsonb_build_object('linha', i + 1, 'nome', v_nome));
          elsif cardinality(v_perfis) = 1 then
            if v_congelado then
              -- Só lê: fora do desafio, a linha não entra na resposta e o
              -- script não mexe na caixa dela
              if exists (select 1 from challenge_members
                          where challenge_id = v_desafio and user_id = v_perfis[1]) then
                v_sit := 'dentro';
              end if;
            else
              -- Membro manual que está na planilha passa a ser da planilha
              insert into challenge_members (challenge_id, user_id, origem)
              values (v_desafio, v_perfis[1], 'planilha')
              on conflict (challenge_id, user_id) do update set origem = 'planilha';
              v_sit := 'dentro';
            end if;
          else
            if v_congelado then
              if n_convites > 0 then
                v_sit := 'aguardando_conta';
              end if;
            else
              if n_convites = 1 then
                -- Convite único que bate: passa a ser da planilha (como o
                -- membro manual que está nela)
                update challenge_convidados
                  set origem = 'planilha',
                      nome = coalesce(nullif(v_nome, ''), nome),
                      telefone_exibicao = v_cel
                where challenge_id = v_desafio
                  and telefone = v_convites[1];
              elsif n_convites = 0 then
                -- Guarda a chave (DDD + linha), não os dígitos crus:
                -- `normalizar_telefone` de um celular de 11 dígitos fica com
                -- os 10 últimos e perde o primeiro dígito do DDD, e aí o
                -- convite nunca bateria com o cadastro (`membro_por_convite`)
                insert into challenge_convidados
                  (challenge_id, telefone, telefone_exibicao, nome, origem)
                values
                  (v_desafio, public.normalizar_telefone(v_chave), v_cel,
                   nullif(v_nome, ''), 'planilha')
                on conflict (challenge_id, telefone) do nothing;
              else
                -- Dois ou mais convites batem (um antigo sem DDD casa só
                -- pela linha): nenhum vira da planilha, senão uma mudança
                -- na planilha apagaria um convite manual; e nada de convite
                -- novo, que seria duplicado. A pessoa já está convidada.
                null;
              end if;
              v_sit := 'aguardando_conta';
            end if;
          end if;
        end if;
      end if;

      if v_sit is not null then
        v_linhas := v_linhas || jsonb_build_array(
          jsonb_build_object('indice', i, 'situacao', v_sit));
        n_dentro := n_dentro + (v_sit = 'dentro')::int;
        n_aguardando := n_aguardando + (v_sit = 'aguardando_conta')::int;
      end if;
    end loop;
  end if;

  v_status := case
    when v_congelado then 'congelado'
    when v_cab is null then 'sem_cabecalho'
    else 'ok'
  end;

  if v_status = 'ok' then
    n_fora := public.remover_fora_da_planilha(v_desafio, v_chaves, false);
    -- Trava contra remoção em massa (spec, "Trava de segurança"): uma
    -- planilha esvaziada, uma aba trocada ou uma falha do Google não
    -- podem tirar o ingresso de ninguém. Lista válida vazia, ou mais de
    -- 20% de quem veio da planilha E mais de 3 pessoas: ninguém sai, as
    -- entradas valem, e a organização confirma pelo painel se for de
    -- propósito.
    if n_fora > 0 and (
      cardinality(v_chaves) = 0
      or (n_fora > 0.2 * n_da_planilha and n_fora > 3)
    ) then
      n_travadas := n_fora;
    elsif n_fora > 0 then
      n_removidos := public.remover_fora_da_planilha(v_desafio, v_chaves, true);
    end if;
  end if;

  insert into ingresso_sincronizacoes (challenge_id, em, resumo)
  values (v_desafio, now(), jsonb_build_object(
    'status', v_status,
    'dentro', n_dentro,
    'aguardando', n_aguardando,
    'invalidos', v_invalidos,
    'ambiguos', v_ambiguos,
    'removidos', n_removidos,
    'remocoes_travadas', n_travadas,
    'chaves', to_jsonb(v_chaves)
  ))
  on conflict (challenge_id) do update
    set em = excluded.em, resumo = excluded.resumo;

  return jsonb_build_object(
    'status', v_status,
    'coluna_marcar', c_marcar,
    'linhas', v_linhas,
    'removidos', n_removidos,
    'remocoes_travadas', n_travadas
  );
end;
$$;

grant execute on function public.sincronizar_planilha_ingresso(text, jsonb) to anon, authenticated;

-- A organização confirma a remoção que a trava segurou. Mesma definição
-- de "fora da planilha" da sincronização, com as chaves da última.
-- `p_esperado` é o número de travadas que o painel mostrou: o gatilho
-- roda a cada 5 minutos, e se a planilha mudou nesse meio-tempo (4
-- travadas viraram 100) a confirmação não vale para a lista nova.
drop function if exists public.confirmar_remocoes_ingresso(uuid);
create or replace function public.confirmar_remocoes_ingresso(p_desafio uuid, p_esperado int)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_resumo jsonb;
  v_congelado boolean;
  n int;
begin
  if not public.is_organizador() then
    raise exception 'Só a organização confirma a remoção';
  end if;

  -- Mesma fila da sincronização (o segredo do desafio)
  perform 1 from ingresso_segredos where challenge_id = p_desafio for update;

  select s.resumo,
         coalesce(public.noite_do_checkin(public.ingresso_agora()) > c.evento_data, false)
    into v_resumo, v_congelado
  from ingresso_sincronizacoes s
  join challenges c on c.id = s.challenge_id
  where s.challenge_id = p_desafio;

  if coalesce((v_resumo ->> 'remocoes_travadas')::int, 0) is distinct from p_esperado then
    raise exception 'A lista mudou desde que você conferiu. Confira de novo.';
  end if;

  -- Só sobre uma leitura boa da planilha: sem cabeçalho as chaves vêm
  -- vazias e tirariam todo mundo; depois da festa ninguém sai mais.
  if v_resumo is null or v_resumo ->> 'status' <> 'ok' or v_congelado then
    return 0;
  end if;

  n := public.remover_fora_da_planilha(
    p_desafio,
    array(select jsonb_array_elements_text(v_resumo -> 'chaves')),
    true
  );

  update ingresso_sincronizacoes
    set resumo = resumo || jsonb_build_object('remocoes_travadas', 0, 'removidos', n)
  where challenge_id = p_desafio;

  return n;
end;
$$;

revoke execute on function public.confirmar_remocoes_ingresso(uuid, int) from public, anon;
grant execute on function public.confirmar_remocoes_ingresso(uuid, int) to authenticated;
