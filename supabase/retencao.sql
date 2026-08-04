-- ============================================================
-- Política de retenção de fotos (rodar de vez em quando, ou
-- agendar com pg_cron): apaga do Storage as fotos de check-ins
-- com mais de 4 meses, mantendo o REGISTRO do check-in (presença,
-- ranking e streak continuam valendo — só a imagem sai).
--
-- Por que 4 meses: no cenário de sucesso (60 check-ins/dia, 6 dias por
-- semana) são ~1.560 fotos/mês. Com o teto de 90 KB por foto, 6 meses
-- de acervo chegariam a ~825 MB — 83% do 1 GB do free tier, sem folga
-- para os favoritos antigos. Com 4 meses, ~550 MB no pior caso.
--
-- EXCEÇÃO: check-ins marcados como favoritos pelo dono (coluna
-- `favorito`, migração 005) nunca são arquivados. É pra isso que
-- o favorito serve — e por isso existe um teto por pessoa.
--
-- Mantém o storage abaixo de 1 GB do free tier.
-- ============================================================

-- 1) Ver quanto seria liberado (só conferência):
select count(*) as fotos_antigas
from storage.objects o
where o.bucket_id = 'fotos'
  and o.created_at < now() - interval '4 months'
  and o.name not like '%avatar%'
  and not exists (
    select 1 from public.checkins c
    where c.favorito and c.foto_url like '%' || o.name
  );

-- 2) Apagar os arquivos antigos do Storage (menos os favoritos):
delete from storage.objects o
where o.bucket_id = 'fotos'
  and o.created_at < now() - interval '4 months'
  and o.name not like '%avatar%'
  and not exists (
    select 1 from public.checkins c
    where c.favorito and c.foto_url like '%' || o.name
  );

-- 3) Marcar a URL como vazia nos check-ins antigos (o app mostra
--    um placeholder quando foto_url = ''):
update public.checkins
set foto_url = ''
where criado_em < now() - interval '4 months'
  and not favorito;

-- ============================================================
-- Faxina de órfãos: arquivos no bucket que ninguém mais aponta.
--
-- O app já apaga o avatar antigo ao trocar a foto de perfil e a foto
-- do check-in ao excluí-lo. Isto aqui recolhe o que ficou para trás
-- antes dessa correção, e o que escapar de um upload interrompido no
-- meio (arquivo sobe, a linha no banco não chega a ser criada).
--
-- O corte de 1 dia é proteção: sem ele, um arquivo recém-enviado
-- poderia ser apagado na janela entre o upload e o insert da linha.
-- ============================================================

-- 4) Conferir antes de apagar (rode e olhe a lista):
select o.name, o.created_at, round((o.metadata->>'size')::numeric / 1024, 1) as kb
from storage.objects o
where o.bucket_id = 'fotos'
  and o.created_at < now() - interval '1 day'
  and not exists (
    select 1 from public.checkins c where c.foto_url like '%' || o.name
  )
  and not exists (
    select 1 from public.profiles p where p.avatar_url like '%' || o.name
  )
order by o.created_at;

-- 5) Apagar os órfãos (mesma condição do passo 4):
delete from storage.objects o
where o.bucket_id = 'fotos'
  and o.created_at < now() - interval '1 day'
  and not exists (
    select 1 from public.checkins c where c.foto_url like '%' || o.name
  )
  and not exists (
    select 1 from public.profiles p where p.avatar_url like '%' || o.name
  );
