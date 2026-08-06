-- ============================================================
-- MIGRAÇÃO 012 — Cancelar a aula também fecha a janela do desafio
--
-- Antes, cancelar uma aula só trocava o texto da agenda: o desafio
-- continuava valendo naquele dia, então bastava ir até o local e tirar
-- uma foto para marcar presença numa noite em que não houve forró.
--
-- Agora o cancelamento carrega essa decisão. Não é automático de
-- propósito: nem todo cancelamento fecha o espaço — um feriado que
-- suspende as aulas pode ser justamente a noite do Forró na Rep.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feriados'
      and column_name = 'suspende_desafios'
  ) then
    alter table public.feriados
      add column suspende_desafios boolean not null default true;

    -- Cancelamentos JÁ cadastrados ficam como sempre estiveram (false).
    -- Ligar a regra agora não pode confiscar ponto de quem compareceu
    -- quando a regra ainda não existia — mesmo princípio da migração 009.
    -- Vale só na criação da coluna, então rodar de novo não mexe nos
    -- cancelamentos que a organização marcou depois.
    update public.feriados set suspende_desafios = false;
  end if;
end $$;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- A regra é avaliada no app, junto com o resto da janela (dias e
-- horários) — não há nada a mudar em registrar_checkin.
--
-- Para marcar um cancelamento antigo como suspensão pelo SQL (o normal
-- é pelo Painel > Feriados e cancelamentos):
--
--   update public.feriados
--   set suspende_desafios = true
--   where data = '2026-11-02';
-- ============================================================
