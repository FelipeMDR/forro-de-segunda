-- ============================================================
-- MIGRAÇÃO 047 — Desafio de ingresso cujo distintivo não evolui
--
-- O PROBLEMA
-- O workshop também vende ingresso por uma aba da mesma planilha, mas não
-- dá para garantir o check-in de quem vai: o distintivo do workshop fica
-- em "Ingresso garantido" e não vira "Marquei presença".
--
-- O QUE MUDA
-- `challenges.ingresso_evolui` (padrão true: o Forró na Rep continua
-- igual). Com false, `ingressos_do_perfil` e `presencas_do_clube` nunca
-- dão presença — nem por check-in, nem por correção da organização. O
-- app também não abre noite extra para esse desafio.
--
-- Rode no SQL Editor (ou `npm run migrar`). Pode rodar mais de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists ingresso_evolui boolean not null default true;

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
      c.id, c.titulo, m.entrou_em, c.evento_data, c.ingresso_evolui,
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
      -- Distintivo que não evolui (workshop): nunca há presença
      cc.ingresso_evolui and coalesce(cc.correcao, cc.primeiro is not null) as esteve
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
      c.ingresso_evolui,
      ((c.evento_data + c.evento_inicio) at time zone 'America/Sao_Paulo') as abre,
      ((c.evento_data + (c.evento_fim < c.evento_inicio)::int + c.evento_fim)
        at time zone 'America/Sao_Paulo') as fecha
    from challenges c
    where c.id = p_desafio and c.evento_data is not null
  )
  select
    m.user_id,
    f.ingresso_evolui and coalesce(
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
