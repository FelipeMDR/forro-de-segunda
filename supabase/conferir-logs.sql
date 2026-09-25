-- ============================================================
-- De onde vêm os logs — para rodar no LOGS EXPLORER do Supabase
-- (Logs → Logs Explorer), NÃO no SQL Editor.
--
-- O plano gratuito inclui 1 GB de ingestão de logs por ciclo, e toda
-- chamada à API vira uma linha. Quando a conta estoura, o que estourou
-- quase sempre é VOLUME DE REQUISIÇÃO, não tamanho de dado.
--
-- No plano gratuito os logs ficam guardados 1 dia: ajuste o seletor de
-- período para as últimas 24h, senão as consultas voltam vazias. Para
-- ver uma noite de forró, rode na terça de manhã.
-- ============================================================

-- 1) QUEM MAIS PEDE — requisições por caminho da API.
--    `/rest/v1/checkins` no topo com dezenas de milhares por dia é o
--    feed recarregando; `/realtime/v1` é o tempo real.
select
  r.path as caminho,
  count(*) as requisicoes
from edge_logs as t
cross join unnest(t.metadata) as m
cross join unnest(m.request) as r
group by caminho
order by requisicoes desc
limit 20;

-- 2) QUANTAS AO TODO, hora a hora. Compare com o horário da aula: se o
--    pico bate com a noite de forró, é o app; se é plano o dia todo,
--    é rotina de fundo (cron, monitor externo, robô).
select
  timestamp_trunc(t.timestamp, hour) as hora,
  count(*) as requisicoes
from edge_logs as t
group by hora
order by hora desc;

-- 3) ERRO EM REPETIÇÃO — um 4xx/5xx que acontece sempre gera log
--    sempre, e costuma passar despercebido porque o app tem plano B.
select
  res.status_code as status,
  r.path as caminho,
  count(*) as vezes
from edge_logs as t
cross join unnest(t.metadata) as m
cross join unnest(m.request) as r
cross join unnest(m.response) as res
where res.status_code >= 400
group by status, caminho
order by vezes desc
limit 20;

-- 4) POSTGRES falando demais — se `postgres_logs` for a maior fatia,
--    o problema não é requisição, é verbosidade ou erro repetido
--    (violação de RLS, constraint, função quebrada).
select
  p.error_severity as gravidade,
  count(*) as linhas
from postgres_logs as t
cross join unnest(t.metadata) as m
cross join unnest(m.parsed) as p
group by gravidade
order by linhas desc;

-- 5) As mensagens de Postgres mais repetidas (o texto exato ajuda a
--    achar a consulta culpada):
select
  t.event_message as mensagem,
  count(*) as vezes
from postgres_logs as t
group by mensagem
order by vezes desc
limit 20;
