-- ============================================================
-- MIGRAÇÃO 030 — O agendamento consegue chamar o dj-loop
--
-- O QUE ACONTECIA
-- O dj-loop reconhecia o agendamento (pg_cron) comparando o cabeçalho
-- Authorization com a variável SUPABASE_SERVICE_ROLE_KEY da função,
-- como texto. As duas não batem caractere por caractere — a chave que
-- o Supabase entrega às funções não é a mesma string copiada do painel
-- — e toda chamada do agendamento caía no "Só o DJ da noite pode fazer
-- isso" (403). Resultado: o Modo DJ só andava na hora em que era
-- ligado, e "Tocando agora" parava ali.
--
-- A limpeza de fotos (migração 006) já tinha tropeçado nisso e resolveu
-- do jeito certo: quem decide se a chave é de serviço é o BANCO, que
-- confere a assinatura do token. Esta função não faz nada além de
-- existir com `execute` só para service_role: se a chamada do dj-loop
-- com o token recebido consegue executá-la, é o agendamento.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez. Depois, publique o
-- dj-loop de novo: npx supabase functions deploy dj-loop --use-api
-- ============================================================

create or replace function public.dj_loop_autorizado()
returns boolean
language sql stable
as $$
  select true;
$$;

revoke all on function public.dj_loop_autorizado() from public, anon, authenticated;
grant execute on function public.dj_loop_autorizado() to service_role;
