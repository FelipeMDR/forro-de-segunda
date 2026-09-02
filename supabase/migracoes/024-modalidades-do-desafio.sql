-- ============================================================
-- MIGRAÇÃO 024 — Mais de uma disputa dentro do mesmo desafio
--
-- Até aqui um desafio tinha um ranking só: quem somou mais janelas com
-- check-in. Mas o mesmo período pode abrigar mais de uma competição —
-- no "Espaço Livre 2026.2" a organização quer o rank de presença E o
-- rank de rodízio (quem dançou com mais gente diferente) rodando lado
-- a lado, com a mesma inscrição e sem ninguém fazer nada a mais.
--
-- Uma COLUNA e não uma tabela nova: modalidade é um punhado de
-- palavras por desafio, sem dado próprio para pendurar nelas. Uma
-- tabela `challenge_modalidades` custaria um join em toda leitura de
-- desafio para guardar o que cabe num array.
--
-- Nenhum dado novo é gravado para o rodízio: ele já sai das marcações
-- de dupla (migração 016) cruzadas com as janelas do desafio. Ou seja,
-- ligar a modalidade num desafio que já está rolando faz o ranking
-- aparecer com o histórico inteiro, sem começar do zero.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists modalidades text[] not null
  default array['checkin']::text[];

-- Desafio sem modalidade nenhuma não tem o que rankear, e valor
-- desconhecido viraria uma aba vazia no app. O banco recusa os dois.
alter table public.challenges
  drop constraint if exists challenges_modalidades_validas;
alter table public.challenges
  add constraint challenges_modalidades_validas check (
    array_length(modalidades, 1) >= 1
    and modalidades <@ array['checkin', 'duplas']::text[]
  );

comment on column public.challenges.modalidades is
  'Disputas abertas neste desafio: checkin (janelas com presença) e/ou '
  'duplas (pessoas diferentes com dupla confirmada). Ver migração 024.';

-- Desafios que já existem ficam exatamente como estavam: só presença.
-- O `default` acima já cobre linhas novas; este update é para o caso de
-- a coluna ter sido criada numa tentativa anterior sem default.
update public.challenges
set modalidades = array['checkin']::text[]
where modalidades is null or array_length(modalidades, 1) is null;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Para ligar o rodízio num desafio que já existe, dá para fazer pelo
-- app (Editar desafio) ou por aqui:
--
--   update public.challenges
--   set modalidades = array['checkin', 'duplas']::text[]
--   where titulo = 'Espaço Livre 2026.2';
-- ============================================================
