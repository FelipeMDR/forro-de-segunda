-- ============================================================
-- MIGRAÇÃO 009 — Ligar a trava de local não pode zerar pontos
--
-- BUG corrigido aqui: ao ligar o local num desafio em andamento, todos
-- os pontos já conquistados sumiam. Com trava, o ponto passa a exigir
-- veredito de localização — e os check-ins antigos não têm veredito
-- porque a regra não existia quando foram feitos. Editar regra não
-- pode confiscar ponto de quem já compareceu.
--
-- Correção: o desafio passa a guardar DESDE QUANDO a trava vale.
-- Check-in anterior a esse instante conta como sempre contou; a
-- exigência de estar no local só vale daí pra frente.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists local_desde timestamptz;

/**
 * Mantém local_desde sozinho, para o cliente não poder forjá-lo (nem
 * errar): marca o instante em que a trava foi LIGADA, preserva esse
 * instante enquanto ela seguir ligada — mexer no raio depois não
 * re-anistia ninguém — e limpa quando a trava é desligada.
 */
create or replace function public.marca_local_desde()
returns trigger
language plpgsql
as $$
begin
  if new.local_lat is null then
    new.local_desde := null;
  elsif tg_op = 'INSERT' then
    new.local_desde := now();
  elsif old.local_lat is null or old.local_desde is null then
    new.local_desde := now();          -- acabou de ligar
  else
    new.local_desde := old.local_desde; -- já estava ligada: preserva
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_local_desde on public.challenges;
create trigger challenges_local_desde
  before insert or update on public.challenges
  for each row execute function public.marca_local_desde();

-- Conserta quem já está no ar: desafios que hoje têm trava ligada mas
-- ainda não têm o marco. Usar now() devolve os pontos de todos os
-- check-ins anteriores, que é exatamente o que foi tirado sem querer.
update public.challenges
set local_desde = now()
where local_lat is not null and local_desde is null;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Conferir o marco de cada desafio com trava:
--   select titulo, local_nome, local_raio_m, local_desde
--   from public.challenges where local_lat is not null;
-- ============================================================
