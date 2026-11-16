-- ============================================================
-- MIGRAÇÃO 046 — Métricas do card de divulgação
--
-- O card "Ingressos à venda" da tela Hoje (lib/divulgacao.ts) anota o
-- que cada pessoa fez com cada oferta, para a organização saber
-- quantos viram, quantos abriram os detalhes, quantos tocaram em
-- Comprar e quantos fecharam o card — e de quais turmas.
--
--   - divulgacao: o id da oferta no app ("forro-na-rep-2026-12").
--   - evento:
--       visto    → o card apareceu na tela (o app manda no máximo um
--                  por pessoa, oferta e dia)
--       detalhes → tocou na oferta para ver local, horário, turmas
--       clique   → tocou em Comprar (foi para o formulário)
--       fechou   → tocou no × do card
--
-- A compra em si acontece no formulário do Google, fora do app: aqui
-- só se sabe quem foi até ele.
--
-- Cada pessoa só grava eventos em nome próprio; só a organização lê.
-- Ninguém edita nem apaga pelo app (a conta apagada leva os eventos
-- junto, pelo cascade).
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.divulgacao_eventos (
  id bigint generated always as identity primary key,
  divulgacao text not null check (length(divulgacao) between 1 and 80),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  evento text not null check (evento in ('visto', 'detalhes', 'clique', 'fechou')),
  criado_em timestamptz not null default now()
);

create index if not exists divulgacao_eventos_divulgacao_idx
  on public.divulgacao_eventos (divulgacao, criado_em);

alter table public.divulgacao_eventos enable row level security;

drop policy if exists divulgacao_eventos_insert on public.divulgacao_eventos;
create policy divulgacao_eventos_insert on public.divulgacao_eventos
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists divulgacao_eventos_select on public.divulgacao_eventos;
create policy divulgacao_eventos_select on public.divulgacao_eventos
  for select to authenticated
  using (public.is_organizador());

grant select, insert on public.divulgacao_eventos to authenticated;
