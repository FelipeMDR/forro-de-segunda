-- ============================================================
-- MIGRAÇÃO 006 — Limpeza automática de fotos
--
-- O Supabase passou a bloquear `delete from storage.objects` por
-- trigger ("Direct deletion from storage tables is not allowed"), então
-- o retencao.sql não consegue mais apagar nada sozinho: apagar arquivo
-- só pela Storage API, que é HTTP e não existe dentro do Postgres.
--
-- A divisão de trabalho passa a ser:
--   - Este SQL DECIDE o que sai (regra de negócio, fica no banco).
--   - A Edge Function `limpar-fotos` APAGA (Storage API).
--   - O pg_cron CHAMA a função toda semana (ninguém precisa lembrar).
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
-- Depois, publique a função e agende o cron (passos no fim do arquivo).
-- ============================================================

-- Caminho dentro do bucket a partir da URL pública. Espelha o
-- caminhoNoBucket() do src/lib/supabaseApi.ts.
create or replace function public.caminho_no_bucket(url text)
returns text
language sql
immutable
as $$
  select case
    when url is null or url = '' then null
    when position('/object/public/fotos/' in url) = 0 then null
    else split_part(
      substring(url from position('/object/public/fotos/' in url)
                          + length('/object/public/fotos/')),
      '?', 1)
  end;
$$;

-- Lista somente-leitura do que está sobrando. Serve de conferência
-- (retencao.sql) e é a mesma regra usada pela limpeza de verdade.
create or replace function public.fotos_orfas()
returns table (caminho text, criado_em timestamptz, bytes bigint)
language sql
security definer
set search_path = public
as $$
  select o.name,
         o.created_at,
         coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'fotos'
    -- Sem esse corte, um arquivo recém-enviado poderia ser apagado na
    -- janela entre o upload e o insert da linha no banco.
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.checkins c
      where public.caminho_no_bucket(c.foto_url) = o.name
    )
    and not exists (
      select 1 from public.profiles p
      where public.caminho_no_bucket(p.avatar_url) = o.name
    )
  order by o.created_at;
$$;

/**
 * Prepara a limpeza e devolve os caminhos que a Edge Function deve
 * apagar pela Storage API.
 *
 * Primeiro marca como arquivadas as fotos de check-ins com mais de 4
 * meses (o registro da presença fica; só a imagem sai) — favoritos são
 * poupados. Com a URL zerada, esses arquivos viram órfãos e caem na
 * mesma varredura, junto com os que sobraram de uploads interrompidos.
 *
 * É idempotente de propósito: se a função falhar no meio, o arquivo
 * continua órfão e sai na semana seguinte. Nunca fica o inverso — uma
 * linha apontando para um arquivo que já não existe.
 */
create or replace function public.preparar_limpeza_fotos()
returns table (caminho text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.checkins
  set foto_url = ''
  where criado_em < now() - interval '4 months'
    and not favorito
    and foto_url <> '';

  return query select f.caminho from public.fotos_orfas() f;
end;
$$;

-- Só a Edge Function (service_role) roda a limpeza; a de conferência
-- pode ser chamada pela organização pelo SQL Editor.
revoke all on function public.preparar_limpeza_fotos() from public, authenticated, anon;
grant execute on function public.preparar_limpeza_fotos() to service_role;
revoke all on function public.fotos_orfas() from public, anon;
grant execute on function public.fotos_orfas() to service_role;

-- ============================================================
-- PASSO 2 — Publicar a Edge Function (no seu computador, uma vez):
--
--   npx supabase login
--   npx supabase link --project-ref SEU-PROJECT-REF
--   npx supabase functions deploy limpar-fotos
--
-- Teste manual (deve responder {"apagados":N,...}):
--
--   curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/limpar-fotos \
--        -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"
--
-- ============================================================
-- PASSO 3 — Agendar. Rode no SQL Editor DEPOIS de publicar a função,
-- trocando SEU-PROJETO e SUA_SERVICE_ROLE_KEY:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.unschedule('limpar-fotos-semanal')
--   where exists (select 1 from cron.job where jobname = 'limpar-fotos-semanal');
--
--   select cron.schedule(
--     'limpar-fotos-semanal',
--     '0 8 * * 2',  -- terça 8h UTC (5h de Brasília), longe do horário de aula
--     $cron$
--       select net.http_post(
--         url := 'https://SEU-PROJETO.supabase.co/functions/v1/limpar-fotos',
--         headers := '{"Authorization": "Bearer SUA_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
--       );
--     $cron$
--   );
--
-- Conferir os agendamentos e as últimas execuções:
--
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- OBS: a service role key fica guardada na tabela cron.job, que só o
-- dono do banco enxerga. Se preferir não deixá-la ali, dá para guardar
-- no Vault (Dashboard > Settings > Vault) e ler com
-- vault.decrypted_secrets dentro do cron.
-- ============================================================
