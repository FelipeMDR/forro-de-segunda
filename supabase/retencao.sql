-- ============================================================
-- Retenção de fotos — CONFERÊNCIA (este arquivo não apaga nada)
--
-- A limpeza é automática desde a migração 006: a Edge Function
-- `limpar-fotos` roda toda semana pelo pg_cron e apaga
--   - fotos de check-ins com mais de 4 meses (a presença fica no
--     ranking e no histórico; favoritos são poupados)
--   - órfãos: arquivos que nenhum check-in nem perfil referencia
--
-- Este arquivo virou só diagnóstico. Apagar por SQL não é mais
-- possível: o Supabase bloqueia `delete from storage.objects`
-- ("Direct deletion from storage tables is not allowed") — só a
-- Storage API apaga de verdade, e é ela que a função usa.
--
-- Por que 4 meses: no cenário de sucesso (60 check-ins/dia, 6 dias por
-- semana) são ~1.560 fotos/mês. Com o teto de 90 KB por foto, 6 meses
-- de acervo chegariam a ~825 MB — 83% do 1 GB do free tier, sem folga
-- para os favoritos antigos. Com 4 meses, ~550 MB no pior caso.
-- ============================================================

-- 1) Quanto o bucket está ocupando hoje, por tipo de arquivo:
select
  case when name like '%avatar%' then 'avatares' else 'check-ins' end as tipo,
  count(*) as arquivos,
  pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) as espaco
from storage.objects
where bucket_id = 'fotos'
group by 1;

-- 2) O que a próxima limpeza levaria (mesma regra da Edge Function):
select count(*) as arquivos,
       pg_size_pretty(sum(bytes)) as espaco_a_liberar
from public.fotos_orfas();

-- 3) A lista, se quiser olhar caso a caso:
select * from public.fotos_orfas();

-- 4) Check-ins que perderiam a foto na próxima rodada (o registro da
--    presença continua; favoritos não entram):
select count(*) as fotos_a_arquivar
from public.checkins
where criado_em < now() - interval '4 months'
  and not favorito
  and foto_url <> '';

-- 5) As últimas execuções do cron (deu erro? rodou mesmo?):
select jobid, runid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 10;

-- ============================================================
-- Para rodar a limpeza na hora, sem esperar a terça:
--
--   curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/limpar-fotos \
--        -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"
--
-- Só simular (não apaga nada, devolve a lista):
--
--   curl -X POST "https://SEU-PROJETO.supabase.co/functions/v1/limpar-fotos?simular=1" \
--        -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"
-- ============================================================
