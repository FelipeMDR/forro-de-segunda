-- ============================================================
-- MIGRAÇÃO 042 — Destaques do perfil
--
-- O perfil mostra só até 3 distintivos em destaque; o resto fica em
-- "Todos os distintivos". A pessoa escolhe quais (e em que ordem).
--
--   - profiles.destaques: as chaves dos distintivos escolhidos, em
--     ordem. Nulo = nunca escolheu, e o app escolhe pelos mais raros.
--     A chave é a do app (lib/destaques.ts): "presenca", "rodizio",
--     "dj", "custom-<id>", "caca-atual", "caca-<início>" — a de marco
--     não tem o nível, para o destaque seguir valendo quando sobe.
--
-- Todo mundo logado lê (a policy profiles_select), porque os destaques
-- aparecem no perfil dos outros; o dono edita (profiles_update).
--
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.profiles
  add column if not exists destaques text[];

alter table public.profiles drop constraint if exists profiles_destaques_check;
alter table public.profiles add constraint profiles_destaques_check
  check (destaques is null or cardinality(destaques) <= 3);
