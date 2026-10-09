-- ============================================================
-- MIGRAÇÃO 031 — "Tocando agora" atualiza quando a música troca
--
-- O QUE ACONTECIA
-- A tela de pedidos aberta demorava até ~1min30 para mostrar a música
-- nova: o loop só olhava o Spotify a cada minuto, e a tela só buscava
-- o banco a cada 30 s. Parecia que não atualizava nunca.
--
-- O QUE MUDA
-- 1. O loop passa a rodar a cada 15 s (só com Modo DJ ligado — sem
--    sessão aberta o banco só avalia o `where exists`, nenhuma chamada).
--    O banco fica sabendo da troca de música em até 15 s.
-- 2. A tabela dj_sessoes entra no tempo real. O loop agora só grava a
--    sessão quando algo muda (a música ou um aviso), então é UM evento
--    por música — ~20 por hora — e a tela recarrega só nessa hora.
--    Bem diferente do tempo real das curtidas (migração 028), que eram
--    centenas de eventos por noite fazendo todo mundo recarregar o feed.
--
-- PRÉ-REQUISITO: os segredos dj_url_projeto e dj_service_role_key no
-- Vault (criados quando o agendamento foi ligado pela primeira vez).
--
-- Rode no SQL Editor. Pode rodar mais de uma vez. Depois, publique o
-- dj-loop de novo: npx supabase functions deploy dj-loop --use-api
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dj_sessoes'
  ) then
    alter publication supabase_realtime add table public.dj_sessoes;
  end if;
end $$;

select cron.unschedule('dj-loop')
where exists (select 1 from cron.job where jobname = 'dj-loop');

select cron.schedule('dj-loop', '15 seconds', $cron$
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
