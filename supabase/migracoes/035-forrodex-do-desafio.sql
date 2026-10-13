-- ============================================================
-- MIGRAÇÃO 035 — Forródex presa a um desafio
--
-- O QUE ACONTECIA
-- A Forródex mostrava todo mundo que tem turma no semestre e as duplas
-- desde o último "Encerrar semestre". Com o projeto inteiro dentro, a
-- coleção vira uma lista de gente para procurar, e mistura quem nem
-- está participando do desafio que a organização quer movimentar.
--
-- O QUE MUDA
-- - O desafio ganha `forrodex`: marcado, a Forródex de todo mundo passa
--   a mostrar só quem participa dele e as duplas do período dele.
-- - No máximo um desafio marcado por vez (índice único parcial).
-- - Nada na tela dos alunos fala do vínculo — só o organizador vê a
--   opção, no formulário de edição do desafio. Não muda de desafio
--   sozinha: com outro já marcado, o app recusa e diz qual.
--
-- Rode no SQL Editor e depois "Reload schema cache". Pode rodar mais
-- de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists forrodex boolean not null default false;

create unique index if not exists challenges_um_forrodex
  on public.challenges (forrodex)
  where forrodex;
