-- ============================================================
-- MIGRAÇÃO 020 — Abertura antecipada (o oposto do feriado)
--
-- Às vezes uma aula é cancelada e o espaço livre abre mais cedo do que
-- o normal. Quem chega e faz check-in nesse intervalo extra aparecia no
-- feed, mas não pontuava: a janela do desafio só começava no horário de
-- sempre, e o check-in ficava fora dela.
--
-- Esta migração cria o registro para marcar "hoje o espaço abriu às
-- HH:MM" — e o efeito é imediato e retroativo: como o ranking é
-- calculado na hora (não guarda pontos por check-in), assim que o
-- organizador salva a abertura, os check-ins que já foram feitos
-- naquele intervalo passam a contar sozinhos. Não precisa reprocessar
-- nada nem corrigir pontuação na mão.
--
-- Só ADIANTA o início de uma janela que já existia naquele dia da
-- semana — nunca cria janela nova, nunca atrasa nem encurta o fim. Um
-- desafio sem janela naquele dia, ou que já começaria mais cedo que o
-- horário informado, simplesmente não é afetado.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.aberturas_antecipadas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora_abertura time not null,
  motivo text,
  criado_em timestamptz not null default now()
);

alter table public.aberturas_antecipadas enable row level security;

drop policy if exists "aberturas_antecipadas_select" on public.aberturas_antecipadas;
create policy "aberturas_antecipadas_select" on public.aberturas_antecipadas
  for select to authenticated using (true);

drop policy if exists "aberturas_antecipadas_write" on public.aberturas_antecipadas;
create policy "aberturas_antecipadas_write" on public.aberturas_antecipadas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- A regra é avaliada no app (janelaDoCheckin, em src/lib/dates.ts),
-- junto com o resto da janela — não há nada a mudar no banco além
-- desta tabela. O painel do organizador ganha uma seção nova, ao lado
-- de "Feriados e cancelamentos", para cadastrar direto do celular na
-- hora em que o espaço abre mais cedo.
-- ============================================================
