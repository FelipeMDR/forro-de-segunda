-- ============================================================
-- MIGRAÇÃO 028 — Tempo real só nas fotos
--
-- O PROBLEMA
-- O projeto estourou a cota de ingestão de logs do Supabase (1 GB no
-- plano gratuito, 2,22 GB usados no ciclo). A causa é volume de
-- requisição, não tamanho de dado: cada chamada à API vira uma linha
-- de log, e o app estava multiplicando chamadas sozinho.
--
-- O multiplicador era o tempo real. `checkins`, `comments` e
-- `reactions` estavam publicadas, e o feed assinava as três com
-- `event: '*'`. Reação é, de longe, a tabela que mais muda — numa
-- segunda movimentada são centenas de linhas. Cada linha virava um
-- evento para CADA aparelho com o app aberto, e cada aparelho
-- respondia recarregando o feed. Cinquenta pessoas no salão viravam
-- dezenas de milhares de requisições por noite, todas registradas.
--
-- O QUE MUDA AQUI
-- Só `checkins` continua publicada. O app já parou de assinar as
-- outras duas; tirá-las da publicação fecha a torneira do outro lado,
-- no banco: o Postgres deixa de decodificar essas mudanças para o
-- Realtime e o Realtime deixa de processá-las.
--
-- O QUE NÃO MUDA
-- Nada do que a pessoa vê. Reação e comentário continuam aparecendo
-- na hora para quem os faz (a tela desenha sem esperar o servidor) e
-- chegam aos outros na próxima carga natural — abrir o app, voltar
-- para ele, rolar a lista. Foto nova continua em tempo real, que é o
-- que faz o feed parecer vivo, e é a linha mais rara das três.
--
-- REVERSÍVEL: para voltar atrás, basta o `add table` de novo.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ) then
    alter publication supabase_realtime drop table public.reactions;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime drop table public.comments;
  end if;

  -- Garante que a que importa está lá (em bases antigas pode faltar)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checkins'
  ) then
    alter publication supabase_realtime add table public.checkins;
  end if;
end $$;

-- Confira o resultado (deve sobrar `checkins`, e não `reactions`/`comments`):
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;
