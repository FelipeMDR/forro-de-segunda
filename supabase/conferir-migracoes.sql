-- ============================================================
-- Quais migrações já estão no banco?
--
-- Cole no SQL Editor e rode. Cada linha procura algo que só existe
-- depois daquela migração — coluna, tabela ou função. Não altera nada.
--
-- Serve para quando bate a dúvida de "será que rodei essa?": o app não
-- guarda registro do que foi aplicado, e uma migração faltando aparece
-- para o aluno como erro de "schema cache", que não explica nada.
-- ============================================================

select migracao, case when aplicada then '✅ ok' else '❌ FALTA RODAR' end as situacao
from (values
  (
    '012 — cancelar aula suspende o desafio',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'feriados'
        and column_name = 'suspende_desafios'
    )
  ),
  (
    '013 — e-mail na conta e "esqueci minha senha"',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'email'
    )
    and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sincroniza_email'
    )
  ),
  (
    '014 — veredito de local antes de entrar no desafio',
    -- O sinal aqui é uma AUSÊNCIA: a versão nova deixou de cruzar com
    -- challenge_members, porque o veredito é sobre o lugar, não sobre
    -- quem já era membro.
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'registrar_checkin'
        and pg_get_functiondef(p.oid) not like '%challenge_members%'
    )
  ),
  (
    '015 — "eu vou hoje" na agenda',
    to_regclass('public.confirmacoes_presenca') is not null
  ),
  (
    '016 — marcar dupla',
    to_regclass('public.duplas') is not null
  ),
  (
    '017 — histórico de semestres (retrospectiva)',
    to_regclass('public.semestres') is not null
  ),
  (
    '018 — noite de forró (virada às 5h + fuso de Itajubá)',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'noite_do_checkin'
    )
  ),
  (
    '019 — consentimento LGPD no cadastro',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'termos_aceitos_em'
    )
    and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'aceitar_termos'
    )
  ),
  (
    '020 — abertura antecipada (oposto do feriado)',
    to_regclass('public.aberturas_antecipadas') is not null
  ),
  (
    '021 — telefone: achar pelos últimos 8 dígitos',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'telefones_batem'
    )
  ),
  (
    '022 — telefone: DDD obrigatório, comparação com/sem 9',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'telefone_ddd'
    )
  ),
  (
    '023 — turmas em que a pessoa dá aula',
    to_regclass('public.turma_professores') is not null
  )
) as t(migracao, aplicada)
order by migracao;
