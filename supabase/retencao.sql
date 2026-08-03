-- ============================================================
-- Política de retenção de fotos (rodar de vez em quando, ou
-- agendar com pg_cron): apaga do Storage as fotos de check-ins
-- com mais de 6 meses, mantendo o REGISTRO do check-in (presença,
-- ranking e streak continuam valendo — só a imagem sai).
--
-- Mantém o storage abaixo de 1 GB do free tier.
-- ============================================================

-- 1) Ver quanto seria liberado (só conferência):
select count(*) as fotos_antigas
from storage.objects o
where o.bucket_id = 'fotos'
  and o.created_at < now() - interval '6 months'
  and o.name not like '%avatar%';

-- 2) Apagar os arquivos antigos do Storage:
delete from storage.objects
where bucket_id = 'fotos'
  and created_at < now() - interval '6 months'
  and name not like '%avatar%';

-- 3) Marcar a URL como vazia nos check-ins antigos (o app mostra
--    um placeholder quando foto_url = ''):
update public.checkins
set foto_url = ''
where criado_em < now() - interval '6 months';
