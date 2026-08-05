-- ============================================================
-- MIGRAÇÃO 008 — Trava de local nos desafios
--
-- Permite amarrar um desafio a um lugar: só conta ponto quem tirou a
-- foto dentro do raio (o salão da aula, a casa da festa).
--
-- DECISÃO DE PRIVACIDADE — o app NÃO guarda a coordenada do aluno.
-- O ranking é calculado no navegador de quem abre a tela, então uma
-- coluna de latitude/longitude nos check-ins seria baixável por
-- qualquer aluno logado: a localização precisa de todos os colegas,
-- de graça. Em vez disso, a coordenada é avaliada aqui dentro, na
-- hora do check-in, e o que fica salvo é só o veredito em
-- checkin_locais ("esta foto valeu no local do desafio X").
--
-- LIMITE CONHECIDO: a localização vem do navegador e pode ser
-- falsificada por quem se dispuser a isso (GPS falso, devtools). Isso
-- eleva bastante a barreira, mas não é prova. Para o uso do projeto —
-- desencorajar o check-in do sofá de casa — resolve.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists local_nome text,
  add column if not exists local_lat double precision,
  add column if not exists local_lng double precision,
  add column if not exists local_raio_m int;

-- Ou tem local completo, ou não tem local nenhum
alter table public.challenges
  drop constraint if exists challenges_local_completo;
alter table public.challenges
  add constraint challenges_local_completo check (
    (local_lat is null and local_lng is null and local_raio_m is null)
    or (local_lat is not null and local_lng is not null and local_raio_m > 0)
  );

-- Veredito por check-in: em quais desafios aquela foto valeu no local.
-- Só a função abaixo escreve aqui — se o cliente pudesse inserir,
-- forjaria a própria presença.
create table if not exists public.checkin_locais (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  primary key (checkin_id, challenge_id)
);

alter table public.checkin_locais enable row level security;
drop policy if exists "checkin_locais_select" on public.checkin_locais;
create policy "checkin_locais_select" on public.checkin_locais
  for select to authenticated using (true);
-- Sem policy de insert/update/delete: ninguém escreve direto.

create index if not exists checkin_locais_challenge_idx
  on public.checkin_locais (challenge_id);

-- Haversine em metros. Espelha src/lib/geo.ts.
create or replace function public.distancia_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  )));
$$;

/**
 * Cria o check-in e, se vier coordenada, registra em quais desafios do
 * aluno ela caiu dentro do raio.
 *
 * Roda como security definer porque precisa escrever em checkin_locais,
 * onde o cliente não tem permissão — é isso que impede alguém de
 * carimbar presença sem estar no lugar. O check-in em si continua
 * passando pelo trigger de limite de frequência (migração 007).
 *
 * Coordenada nula (aluno negou o GPS) = check-in normal, sem validação:
 * a foto entra no feed, mas não valida desafio com trava de local.
 */
create or replace function public.registrar_checkin(
  p_foto_url text,
  p_legenda text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;

  insert into public.checkins (user_id, foto_url, legenda)
  values (v_uid, p_foto_url, nullif(btrim(coalesce(p_legenda, '')), ''))
  returning id into v_id;

  if p_lat is not null and p_lng is not null then
    insert into public.checkin_locais (checkin_id, challenge_id)
    select v_id, c.id
    from public.challenges c
    join public.challenge_members m
      on m.challenge_id = c.id and m.user_id = v_uid
    where c.local_lat is not null
      and current_date between c.data_inicio and c.data_fim
      and public.distancia_m(p_lat, p_lng, c.local_lat, c.local_lng)
          <= c.local_raio_m
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

revoke all on function public.registrar_checkin(text, text, double precision, double precision) from public, anon;
grant execute on function public.registrar_checkin(text, text, double precision, double precision) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- A trava vale daqui pra frente: check-ins antigos não têm veredito
-- registrado, então ligar o local num desafio já em andamento zera os
-- pontos anteriores dele. Prefira ligar antes de começar.
--
-- Para definir o local pelo SQL (o normal é pelo formulário do desafio):
--   update public.challenges
--   set local_nome = 'Espaço Livre', local_lat = -22.4256,
--       local_lng = -45.4528, local_raio_m = 200
--   where titulo = 'Copa do mês';
-- ============================================================
