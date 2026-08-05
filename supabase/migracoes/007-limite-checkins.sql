-- ============================================================
-- MIGRAÇÃO 007 — Trava de publicação de check-ins
--
-- Evita enxurrada de fotos no feed (e o custo de storage junto).
-- Duas regras, que precisam valer aqui no banco: a tela também
-- confere, mas quem chamar a API direto passaria por cima dela.
--
--   1) Respiro de 5 minutos entre uma foto e a próxima.
--   2) No máximo 5 check-ins numa JANELA MÓVEL de 6 horas.
--
-- Por que janela móvel e não "por dia": dia de calendário zeraria à
-- meia-noite, no meio de um Espaço Livre que vai das 21h às 2h — a
-- mesma razão pela qual os desafios contam por janela. E 24h móveis
-- travariam a aula do dia seguinte. Seis horas cobrem uma noite e já
-- liberaram no dia seguinte.
--
-- Os números espelham src/lib/limites.ts — mude nos dois lugares.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.limita_checkins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultima timestamptz;
  v_recentes int;
begin
  select max(criado_em) into v_ultima
  from public.checkins
  where user_id = new.user_id;

  if v_ultima is not null
     and new.criado_em - v_ultima < interval '5 minutes' then
    raise exception 'Espere alguns minutos entre uma foto e outra 😉';
  end if;

  select count(*) into v_recentes
  from public.checkins
  where user_id = new.user_id
    and criado_em > new.criado_em - interval '6 hours';

  if v_recentes >= 5 then
    raise exception 'Você já postou 5 check-ins nas últimas horas. Curte a festa que depois dá pra postar mais! 💃';
  end if;

  return new;
end;
$$;

-- Excluir um check-in libera a vaga de volta (a contagem é sobre o que
-- existe), então quem postou torto pode apagar e repostar na hora.
drop trigger if exists checkins_limita on public.checkins;
create trigger checkins_limita
  before insert on public.checkins
  for each row execute function public.limita_checkins();

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Para afrouxar/apertar, edite os três números acima (5 minutos,
-- 6 hours, 5) e rode o arquivo de novo — e ajuste os mesmos valores
-- em src/lib/limites.ts, que é o que a tela usa para avisar antes.
-- ============================================================
