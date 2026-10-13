-- ============================================================
-- MIGRAÇÃO 034 — Modo DJ fecha os pedidos sozinho
--
-- O QUE ACONTECIA
-- O Modo DJ só fechava quando o DJ tocava em "Desligar" (ou na virada
-- da noite, às 05:00). Quem esquecia deixava os pedidos abertos depois
-- que a dança acabava: gente pedindo música para um salão vazio, e o
-- loop chamando o Spotify a cada 15 s à toa.
--
-- O QUE MUDA
-- - A sessão ganha `fecha_em`: o horário em que os pedidos fecham
--   sozinhos. Vazio = até o DJ desligar (como sempre foi).
-- - O DJ escolhe ao ligar (2 h, 4 h ou até desligar), pela função
--   programar_fechamento_dj.
-- - O agendamento do dj-loop (a cada 15 s) fecha a sessão vencida
--   antes de chamar o loop, com o motivo 'horario'.
--
-- Rode no SQL Editor depois da 031. Pode rodar mais de uma vez.
-- ============================================================

alter table public.dj_sessoes add column if not exists fecha_em timestamptz;

alter table public.dj_sessoes
  drop constraint if exists dj_sessoes_motivo_fechamento_check;
alter table public.dj_sessoes
  add constraint dj_sessoes_motivo_fechamento_check
  check (motivo_fechamento in ('desligou', 'assumida', 'virada', 'conexao_perdida', 'horario'));

-- ---------- Programar o fechamento ----------
-- Só o DJ da sessão aberta. null = até desligar.
create or replace function public.programar_fechamento_dj(p_fecha_em timestamptz)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_fecha_em is not null and p_fecha_em <= now() then
    raise exception 'Esse horário já passou';
  end if;
  update dj_sessoes
  set fecha_em = p_fecha_em
  where fechada_em is null and dj_user_id = auth.uid();
  if not found then
    raise exception 'Seu Modo DJ não está ligado';
  end if;
end;
$$;

revoke all on function public.programar_fechamento_dj(timestamptz) from public;
grant execute on function public.programar_fechamento_dj(timestamptz) to authenticated;

-- ---------- O agendamento fecha a sessão vencida ----------
-- Mesmo agendamento da migração 031, com o fechamento antes da chamada:
-- a sessão vencida fecha, e aí o `where exists` não chama mais o loop.
select cron.unschedule('dj-loop')
where exists (select 1 from cron.job where jobname = 'dj-loop');

select cron.schedule('dj-loop', '15 seconds', $cron$
  update public.dj_sessoes
  set fechada_em = now(), motivo_fechamento = 'horario'
  where fechada_em is null and fecha_em is not null and fecha_em <= now();

  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dj_url_projeto')
           || '/functions/v1/dj-loop',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dj_service_role_key'),
      'Content-Type', 'application/json'
    )
  )
  where exists (select 1 from public.dj_sessoes where fechada_em is null);
$cron$);

-- Confira: deve aparecer dj-loop | 15 seconds | true
select jobname, schedule, active from cron.job where jobname = 'dj-loop';
