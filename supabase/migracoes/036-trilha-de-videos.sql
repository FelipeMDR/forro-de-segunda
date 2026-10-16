-- ============================================================
-- MIGRAÇÃO 036 — Trilha de vídeo-aulas
--
-- Os vídeos ficam no YouTube (não listados); aqui só o ID, o nome do
-- passo e a ordem. Uma trilha inteira são poucas dezenas de linhas.
--
-- QUANDO UM PASSO ABRE é decidido no app (lib/trilha.ts), a partir da
-- Agenda: a trava é de tela, não de cofre — quem tem o link do YouTube
-- assiste de qualquer jeito. O banco só confere o que dá vantagem a
-- alguém: gastar chave.
--
-- Rode no SQL Editor e depois "Reload schema cache". Pode rodar mais
-- de uma vez.
-- ============================================================

alter table public.turmas
  add column if not exists nivel text
    check (nivel in ('iniciante', 'intermediario', 'avancado')),
  add column if not exists trilha_inicio date;

-- Evento de data única que repõe a aula cancelada nesta data (mesma
-- turma). Conta como aula da trilha no lugar da cancelada.
alter table public.events
  add column if not exists reposicao_de date;

create table if not exists public.trilha_passos (
  id uuid primary key default gen_random_uuid(),
  nivel text not null check (nivel in ('iniciante', 'intermediario', 'avancado')),
  -- Só ordena: a aula nº N é o N-ésimo passo do nível nessa ordem.
  ordem int not null,
  nome text not null check (length(trim(nome)) > 0),
  video_frente text check (video_frente ~ '^[A-Za-z0-9_-]{11}$'),
  video_condutor text check (video_condutor ~ '^[A-Za-z0-9_-]{11}$'),
  video_conduzida text check (video_conduzida ~ '^[A-Za-z0-9_-]{11}$'),
  dica text,
  pode_chave boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists trilha_passos_nivel_idx on public.trilha_passos (nivel, ordem);
-- Perfis de quem ensinou o passo: o vídeo mostra a foto e o nome de cada um.
-- Coluna à parte para quem já rodou a 036 antes.
alter table public.trilha_passos
  add column if not exists professores_ids uuid[] not null default '{}';

-- Chaves gastas. Apagar o passo devolve a chave (cascade).
create table if not exists public.trilha_liberacoes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passo_id uuid not null references public.trilha_passos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, passo_id)
);
-- Quantas chaves o passo custou: 1 para o primeiro que a turma ainda não
-- viu, 2 para o seguinte, 4, 8… (quem já rodou a 036 antes ganha a coluna)
alter table public.trilha_liberacoes
  add column if not exists custo int not null default 1 check (custo >= 1);

create or replace function public.pode_editar_trilha()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_organizador()
    or exists (
      select 1 from profile_cargos
      where user_id = auth.uid()
        and cargo in ('Professor(a)', 'Diretor(a) de Ensino')
    )
    or exists (select 1 from turma_professores where user_id = auth.uid())
  );
$$;

alter table public.trilha_passos enable row level security;
alter table public.trilha_liberacoes enable row level security;

drop policy if exists "trilha_passos_select" on public.trilha_passos;
drop policy if exists "trilha_passos_insert" on public.trilha_passos;
drop policy if exists "trilha_passos_update" on public.trilha_passos;
drop policy if exists "trilha_passos_delete" on public.trilha_passos;
create policy "trilha_passos_select" on public.trilha_passos
  for select to authenticated using (true);
create policy "trilha_passos_insert" on public.trilha_passos
  for insert to authenticated with check (pode_editar_trilha());
create policy "trilha_passos_update" on public.trilha_passos
  for update to authenticated using (pode_editar_trilha()) with check (pode_editar_trilha());
create policy "trilha_passos_delete" on public.trilha_passos
  for delete to authenticated using (pode_editar_trilha());

-- Sem policy de insert: só liberar_passo_com_chave escreve.
drop policy if exists "trilha_liberacoes_select" on public.trilha_liberacoes;
create policy "trilha_liberacoes_select" on public.trilha_liberacoes
  for select to authenticated using (user_id = auth.uid() or pode_editar_trilha());

/** Nível e primeira aula da trilha de uma turma (professores e organização). */
create or replace function public.definir_trilha_da_turma(
  p_turma text, p_nivel text, p_inicio date
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar_trilha() then
    raise exception 'Só professores e a organização editam a trilha';
  end if;
  update turmas set nivel = p_nivel, trilha_inicio = p_inicio where nome = p_turma;
  if not found then
    raise exception 'Turma não encontrada';
  end if;
end;
$$;

-- Regras das chaves, editáveis pela organização no painel. Uma linha só
-- (id sempre true). O custo em dobro de cada passo mais à frente NÃO é
-- editável: é o que segura quem quer queimar a largada.
create table if not exists public.trilha_regras (
  id boolean primary key default true check (id),
  pontos_por_chave int not null default 10 check (pontos_por_chave between 1 and 20),
  atualizado_em timestamptz not null default now()
);
-- Pesos dos pontos e tabela de preços (colunas à parte para quem já rodou
-- a 036 antes). Calibrado com o ranking do Espaço Livre 2026.2:
-- presença pesa 3 (senão a parceria, que favorece veteranos, domina), e
-- o preço cresce até um teto em vez de dobrar sem fim.
alter table public.trilha_regras
  alter column pontos_por_chave set default 10,
  add column if not exists peso_presenca int not null default 3 check (peso_presenca between 0 and 10),
  add column if not exists peso_parceria int not null default 1 check (peso_parceria between 0 and 10),
  -- Preço do 1º, 2º, 3º… passo à frente no próprio nível; o último vale
  -- dali em diante (teto)
  add column if not exists preco_degraus int[] not null default '{1,2,3,4,5}',
  add column if not exists preco_um_nivel int not null default 8 check (preco_um_nivel between 1 and 100),
  add column if not exists preco_dois_niveis int not null default 12 check (preco_dois_niveis between 1 and 100);
insert into public.trilha_regras (id) values (true) on conflict (id) do nothing;

alter table public.trilha_regras enable row level security;
drop policy if exists "trilha_regras_select" on public.trilha_regras;
create policy "trilha_regras_select" on public.trilha_regras
  for select to authenticated using (true);

drop function if exists public.salvar_regras_trilha(int, int);
drop function if exists public.salvar_regras_trilha(int);
create or replace function public.salvar_regras_trilha(
  p_pontos int,
  p_peso_presenca int,
  p_peso_parceria int,
  p_degraus int[],
  p_um_nivel int,
  p_dois_niveis int
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_organizador() then
    raise exception 'Só a organização muda as regras das chaves';
  end if;
  if p_degraus is null or cardinality(p_degraus) = 0 or cardinality(p_degraus) > 10
     or exists (select 1 from unnest(p_degraus) x where x is null or x < 1 or x > 100) then
    raise exception 'Preços por passo: de 1 a 10 valores, cada um de 1 a 100';
  end if;
  update trilha_regras
  set pontos_por_chave = p_pontos,
      peso_presenca = p_peso_presenca,
      peso_parceria = p_peso_parceria,
      preco_degraus = p_degraus,
      preco_um_nivel = p_um_nivel,
      preco_dois_niveis = p_dois_niveis,
      atualizado_em = now()
  where id;
end;
$$;

/**
 * Início do desafio principal (o da Forródex), que é de onde vêm os
 * pontos das chaves. null = nenhum desafio principal: ninguém pontua.
 */
create or replace function public.desafio_principal_trilha()
returns table (data_inicio date, data_fim date)
language sql stable security definer set search_path = public as $$
  select c.data_inicio, c.data_fim from challenges c where c.forrodex limit 1;
$$;

/**
 * Teto dos pontos de chave: os pontos são os do desafio principal
 * (Presença + Parcerias da Forródex), que o app calcula com as regras do
 * ranking. Aqui se conta POR CIMA, para o banco nunca recusar uma chave
 * que o app mostrou:
 * - Presença: qualquer noite com check-in não anulado no período (o app
 *   ainda exige a janela e o local do desafio);
 * - Parcerias: uma por dupla confirmada no período (a carta vale 1 a 4,
 *   e chegar a valer N exige ao menos N noites com a pessoa).
 */
create or replace function public.teto_pontos_trilha(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  with d as (select * from desafio_principal_trilha()),
  presencas as (
    select count(distinct noite_do_checkin(c.criado_em)) as n
    from checkins c, d
    where c.user_id = p_uid and not c.presenca_anulada
      and noite_do_checkin(c.criado_em) between d.data_inicio - 1 and d.data_fim + 1
  ),
  parcerias as (
    select count(*) as n
    from duplas du, d
    where du.de_user = p_uid and du.confirmada
      and du.data between d.data_inicio - 1 and d.data_fim + 1
  )
  select coalesce((select n from presencas), 0)::int * coalesce((select peso_presenca from trilha_regras where id), 1)
       + coalesce((select n from parcerias), 0)::int * coalesce((select peso_parceria from trilha_regras where id), 1);
$$;
-- O Supabase dá EXECUTE a anon/authenticated em toda função nova; sem
-- isto, qualquer um consultaria a presença de outra pessoa.
revoke all on function public.teto_pontos_trilha(uuid) from public, anon, authenticated;

/**
 * Gasta `p_custo` chaves num passo. O PREÇO (tabela `trilha_regras`,
 * pela distância do passo à turma e pelo nível) é calculado no app, que é
 * onde mora o calendário da trilha; aqui só se confere que é um preço
 * possível (1 a 100) e que o aluno tem chaves para pagar. Como a trava é de tela (vídeo não
 * listado), isso basta.
 */
drop function if exists public.liberar_passo_com_chave(uuid);
create or replace function public.liberar_passo_com_chave(p_passo uuid, p_custo int default 1)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_passo trilha_passos;
  v_usadas int;
  v_pontos int;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  if p_custo is null or p_custo < 1 or p_custo > 100 then
    raise exception 'Preço de chave inválido';
  end if;
  -- Dois toques seguidos não gastam a mesma chave duas vezes.
  perform pg_advisory_xact_lock(hashtext('trilha:' || v_uid::text));

  select * into v_passo from trilha_passos where id = p_passo;
  if not found then
    raise exception 'Esse passo não existe mais';
  end if;
  if not v_passo.pode_chave then
    raise exception 'Esse passo só abre depois da aula';
  end if;
  if v_passo.video_frente is null then
    raise exception 'Esse passo ainda não tem vídeo';
  end if;
  if exists (select 1 from trilha_liberacoes where user_id = v_uid and passo_id = p_passo) then
    return;
  end if;

  -- Gastos contam do início do desafio principal (sem ele, teto é 0)
  select coalesce(sum(custo), 0) into v_usadas
  from trilha_liberacoes
  where user_id = v_uid
    and criado_em >= coalesce(
      (select (data_inicio::timestamp at time zone 'America/Sao_Paulo') from desafio_principal_trilha()),
      '-infinity'::timestamptz
    );

  select pontos_por_chave into v_pontos from trilha_regras where id;
  if teto_pontos_trilha(v_uid) < coalesce(v_pontos, 3) * (v_usadas + p_custo) then
    raise exception 'Você ainda não tem chaves suficientes';
  end if;

  insert into trilha_liberacoes (user_id, passo_id, custo) values (v_uid, p_passo, p_custo);
end;
$$;
