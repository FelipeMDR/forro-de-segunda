-- ============================================================
-- MIGRAÇÃO 018 — Noite de forró em vez de dia do calendário
--
-- DOIS PROBLEMAS, a mesma origem: "dia" estava definido como dia do
-- calendário em UTC, e nenhuma das duas coisas corresponde a uma noite
-- de forró.
--
-- 1. MEIA-NOITE CORTAVA A NOITE EM DUAS. Em espaço livre a galera fica
--    de madrugada. Quem deu check-in às 23h e quem deu à 1h estavam na
--    MESMA noite, mas caíam em datas diferentes — e não conseguiam se
--    marcar como dupla. Agora a noite vai das 05:00 às 04:59 do dia
--    seguinte, e pertence ao dia em que começou.
--
-- 2. O FUSO DERRUBAVA QUASE TODO MUNDO. `criado_em::date` converte um
--    timestamptz usando o fuso da sessão, que no Supabase é UTC. Em
--    Itajubá (UTC-3), qualquer check-in a partir das 21:00 locais já
--    caía no dia seguinte em UTC — enquanto o app, que calcula no fuso
--    do celular, mandava o dia local. Ou seja: marcar dupla falhava
--    para praticamente toda a aula, que começa às 19h e vai até tarde.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

/**
 * A que noite de forró um instante pertence.
 *
 * Converte para o fuso local ANTES de decidir o dia (senão o problema 2
 * acima volta), e desconta as horas de virada para que a madrugada
 * continue pertencendo à noite anterior.
 *
 * O fuso é fixo de propósito: o projeto acontece em Itajubá, e uma
 * noite de forró é um evento local, não um intervalo em UTC.
 */
create or replace function public.noite_do_checkin(quando timestamptz)
returns date
language sql
immutable
as $$
  select (
    (quando at time zone 'America/Sao_Paulo') - interval '5 hours'
  )::date;
$$;

/**
 * Igual à da migração 016, trocando `criado_em::date = p_data` por
 * `noite_do_checkin(criado_em) = p_data` nas duas checagens de
 * co-presença. O resto — quem pode marcar, a confirmação automática
 * quando os dois se marcam — segue idêntico.
 */
create or replace function public.marcar_dupla(
  p_parceiro uuid,
  p_data date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  if p_parceiro = v_uid then
    raise exception 'Não dá para marcar você mesmo';
  end if;

  if not exists (
    select 1 from checkins
    where user_id = v_uid and noite_do_checkin(criado_em) = p_data
  ) then
    raise exception 'Você não fez check-in nessa noite';
  end if;

  if not exists (
    select 1 from checkins
    where user_id = p_parceiro and noite_do_checkin(criado_em) = p_data
  ) then
    raise exception 'Essa pessoa não fez check-in nessa noite';
  end if;

  insert into public.duplas (data, de_user, para_user)
  values (p_data, v_uid, p_parceiro)
  on conflict (data, de_user, para_user) do nothing;

  if exists (
    select 1 from public.duplas
    where data = p_data and de_user = p_parceiro and para_user = v_uid
  ) then
    update public.duplas
    set confirmada = true
    where data = p_data
      and ((de_user = v_uid and para_user = p_parceiro)
        or (de_user = p_parceiro and para_user = v_uid));
  end if;
end;
$$;

revoke all on function public.marcar_dupla(uuid, date) from public, anon;
grant execute on function public.marcar_dupla(uuid, date) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Duplas já gravadas não são remexidas: a data delas continua sendo a
-- que o app calculou na época. Como só marcações de mão dupla contam
-- para distintivo, uma eventual noite partida no passado no máximo
-- deixa de somar — nada fica errado.
-- ============================================================
