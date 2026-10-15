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

-- Chaves gastas. Apagar o passo devolve a chave (cascade).
create table if not exists public.trilha_liberacoes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passo_id uuid not null references public.trilha_passos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, passo_id)
);

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
-- (id sempre true). "Só o próximo passo" NÃO é regra editável: é o que
-- impede o aluno de queimar a largada.
create table if not exists public.trilha_regras (
  id boolean primary key default true check (id),
  pontos_por_chave int not null default 3 check (pontos_por_chave between 1 and 20),
  antecedencia_dias int not null default 7 check (antecedencia_dias between 0 and 30),
  atualizado_em timestamptz not null default now()
);
insert into public.trilha_regras (id) values (true) on conflict (id) do nothing;

alter table public.trilha_regras enable row level security;
drop policy if exists "trilha_regras_select" on public.trilha_regras;
create policy "trilha_regras_select" on public.trilha_regras
  for select to authenticated using (true);

create or replace function public.salvar_regras_trilha(p_pontos int, p_dias int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_organizador() then
    raise exception 'Só a organização muda as regras das chaves';
  end if;
  update trilha_regras
  set pontos_por_chave = p_pontos, antecedencia_dias = p_dias, atualizado_em = now()
  where id;
end;
$$;

create or replace function public.inicio_semestre_trilha()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(max(encerrado_em), '-infinity'::timestamptz) from semestres;
$$;

/**
 * Teto dos pontos de chave no semestre. Conta POR CIMA do app: aqui
 * vale qualquer noite com check-in não anulado, lá só a presença na
 * janela de um desafio. Assim o banco nunca recusa uma chave que o app
 * mostrou, e ainda barra quem chamar a função sem ter ido ao forró.
 */
create or replace function public.teto_pontos_trilha(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  with corte as (
    select inicio_semestre_trilha() as t,
           (inicio_semestre_trilha() at time zone 'America/Sao_Paulo')::date as d
  ),
  presencas as (
    select count(distinct noite_do_checkin(c.criado_em)) as n
    from checkins c, corte
    -- Corta pela NOITE, como o app: encerrar o semestre no meio do forró
    -- não pode tirar do banco a presença que o app já mostrou.
    where c.user_id = p_uid and not c.presenca_anulada
      and noite_do_checkin(c.criado_em) >= noite_do_checkin(corte.t)
  ),
  noites_dupla as (
    select count(distinct du.data) as n
    from duplas du, corte
    where du.de_user = p_uid and du.confirmada and du.data >= corte.d
  ),
  novas as (
    select count(*) as n
    from (
      select min(du.data) as primeira
      from duplas du
      where du.de_user = p_uid and du.confirmada
      group by du.para_user
    ) x, corte
    where x.primeira >= corte.d
  )
  select (presencas.n + noites_dupla.n + novas.n)::int
  from presencas, noites_dupla, novas;
$$;
-- O Supabase dá EXECUTE a anon/authenticated em toda função nova; sem
-- isto, qualquer um consultaria a presença de outra pessoa.
revoke all on function public.teto_pontos_trilha(uuid) from public, anon, authenticated;

create or replace function public.liberar_passo_com_chave(p_passo uuid)
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

  select count(*) into v_usadas
  from trilha_liberacoes
  where user_id = v_uid and criado_em >= inicio_semestre_trilha();

  select pontos_por_chave into v_pontos from trilha_regras where id;
  if teto_pontos_trilha(v_uid) < coalesce(v_pontos, 3) * (v_usadas + 1) then
    raise exception 'Você ainda não tem chave';
  end if;

  insert into trilha_liberacoes (user_id, passo_id) values (v_uid, p_passo);
end;
$$;
