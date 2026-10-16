-- ============================================================
-- MIGRAÇÃO 038 — Trilha de vídeos aceita o Google Drive
--
-- Até aqui a trilha guardava só o ID de 11 caracteres do YouTube. Agora
-- também aceita vídeos do Drive, guardados como "drive:<ID do arquivo>".
-- Os vídeos do YouTube já cadastrados continuam iguais.
--
-- No Drive, o arquivo precisa estar como "Qualquer pessoa com o link pode
-- ver" (senão o aluno vê "pedir acesso"). O plano é migrar tudo para o
-- YouTube depois, que aguenta melhor muitas visualizações.
--
-- Rode no SQL Editor e depois "Reload schema cache". Pode rodar mais
-- de uma vez.
-- ============================================================

alter table public.trilha_passos
  drop constraint if exists trilha_passos_video_frente_check,
  drop constraint if exists trilha_passos_video_condutor_check,
  drop constraint if exists trilha_passos_video_conduzida_check;

alter table public.trilha_passos
  add constraint trilha_passos_video_frente_check
    check (video_frente ~ '^([A-Za-z0-9_-]{11}|drive:[A-Za-z0-9_-]{20,})$'),
  add constraint trilha_passos_video_condutor_check
    check (video_condutor ~ '^([A-Za-z0-9_-]{11}|drive:[A-Za-z0-9_-]{20,})$'),
  add constraint trilha_passos_video_conduzida_check
    check (video_conduzida ~ '^([A-Za-z0-9_-]{11}|drive:[A-Za-z0-9_-]{20,})$');
