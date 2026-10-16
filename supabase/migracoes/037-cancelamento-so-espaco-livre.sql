-- ============================================================
-- MIGRAÇÃO 037 — Cancelar só o Espaço Livre, mantendo as aulas
--
-- Até aqui todo cancelamento cancelava aula: a da turma escolhida ou a
-- de todas. Faltava o caso em que as aulas acontecem, mas o salão não
-- fica livre depois (treinamento da diretoria, evento no espaço). Para
-- fechar os desafios era preciso "cancelar todas as turmas", e a trilha
-- de vídeos andava uma semana sem ninguém ter perdido aula.
--
-- `cancela_aulas = false` marca esse caso: o dia fecha os desafios
-- (suspende_desafios) e não mexe em aula, agenda nem trilha.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.feriados
  add column if not exists cancela_aulas boolean not null default true;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Para corrigir um cancelamento antigo em que as aulas aconteceram:
--
--   update public.feriados
--   set cancela_aulas = false, suspende_desafios = true, turma = null
--   where data = '2026-09-21';
-- ============================================================
