-- Contas que ficaram com o nome de preenchimento, cruzadas com a lista
-- de chamada pelo telefone. A coluna `nome_na_lista` é a sugestão; se
-- vier vazia, a lista também não sabe — aí é perguntar para a pessoa
-- (o app já pergunta no feed) ou reconhecer pela foto de perfil.
--
-- Passo 1: olhar.
select
  p.id,
  p.telefone,
  p.email,
  p.criado_em,
  (
    select string_agg(distinct a.nome, ' / ')
    from public.alunos_cadastrados a
    where nullif(trim(a.nome), '') is not null
      and p.telefone is not null
      and public.telefones_batem(a.telefone, p.telefone)
  ) as nome_na_lista,
  (
    select string_agg(distinct t.turma, ', ')
    from public.profile_turmas t
    where t.user_id = p.id
  ) as turmas
from public.profiles p
where p.nome = 'Dançarino(a)'
order by p.criado_em;

-- Passo 2: corrigir de uma vez quem tem nome na lista (as outras ficam
-- para o app perguntar). Descomente e rode depois de conferir o passo 1.
--
-- update public.profiles p
-- set nome = s.nome
-- from (
--   select p2.id, min(a.nome) as nome
--   from public.profiles p2
--   join public.alunos_cadastrados a
--     on public.telefones_batem(a.telefone, p2.telefone)
--   where p2.nome = 'Dançarino(a)'
--     and p2.telefone is not null
--     and nullif(trim(a.nome), '') is not null
--   group by p2.id
-- ) s
-- where p.id = s.id;
