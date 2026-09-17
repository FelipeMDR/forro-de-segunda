-- Quantas linhas cada tela do app pede de uma vez — e se passou do teto
-- do PostgREST (Project Settings → API → "Max rows", 1000 por padrão).
--
-- Antes de o app paginar, uma consulta com mais linhas que o teto
-- voltava CORTADA e sem erro. No ranking de rodízio isso apareceu como
-- "perdi ponto com o passar dos dias": a cada noite nova, duplas antigas
-- saíam da resposta. Se a coluna `passa_do_teto` estiver true numa
-- versão do app anterior à paginação, esse era o motivo.

-- 1) Duplas confirmadas por desafio (é a consulta do ranking de rodízio)
select
  c.titulo,
  c.data_inicio,
  c.data_fim,
  count(d.*)            as linhas_duplas,
  count(d.*) > 1000     as passa_do_teto
from public.challenges c
left join public.challenge_members m on m.challenge_id = c.id
left join public.duplas d
  on d.de_user = m.user_id
 and d.confirmada
 and d.data between c.data_inicio and c.data_fim
group by c.id, c.titulo, c.data_inicio, c.data_fim
order by c.data_inicio desc;

-- 2) Check-ins por desafio (ranking de presença) e no semestre (painel)
select
  c.titulo,
  count(k.*)        as linhas_checkins,
  count(k.*) > 1000 as passa_do_teto
from public.challenges c
left join public.challenge_members m on m.challenge_id = c.id
left join public.checkins k
  on k.user_id = m.user_id
 and k.criado_em >= (c.data_inicio::timestamp at time zone 'America/Sao_Paulo')
 and k.criado_em <  ((c.data_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
group by c.id, c.titulo
order by c.data_inicio desc;

select count(*) as checkins_ultimos_6_meses,
       count(*) > 1000 as passa_do_teto
from public.checkins
where criado_em > now() - interval '6 months';

-- 3) O teto configurado neste projeto (se a linha vier vazia, é o padrão 1000)
select current_setting('pgrst.db_max_rows', true) as max_rows;
