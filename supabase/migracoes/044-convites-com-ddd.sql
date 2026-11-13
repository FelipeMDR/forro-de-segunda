-- ============================================================
-- MIGRAÇÃO 044 — Convites importados por CSV com o DDD certo
--
-- O PROBLEMA
-- A importação da lista de ingressos pelo painel (CSV) gravava o
-- convite com `normalizeTelefone`, que guarda os 10 ÚLTIMOS dígitos.
-- Num celular de 11 dígitos isso come o primeiro dígito do DDD:
-- "35988887777" virava "5988887777", lido como DDD 59. Desde a
-- migração 022 a comparação exige DDD igual quando os dois lados têm
-- DDD, então o convite nunca casava com a conta criada depois: a
-- pessoa ficava fora do desafio, e o convite, esperando para sempre.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- 1. Recalcula a chave de cada convite a partir do valor original
--    (`telefone_exibicao`): DDD + linha, a mesma chave que o app grava
--    agora (`chaveDoConvite`) e que a sincronização da planilha usa
--    (migração 043). Convite sem valor original, ou cujo valor não tem
--    DDD, fica como está. Se o convite quebrado duplica um convite que
--    já estava certo no mesmo desafio, o quebrado sai.
-- 2. Quem já criou a conta e ficou de fora por causa disso entra agora
--    no desafio (com a origem do convite) e o convite sai da espera.
--    Só quando o telefone casa com UMA conta: se casa com mais de uma
--    (contas antigas sem DDD casam pela linha sozinha), o convite fica
--    esperando, para a organização resolver à mão.
--
-- Depende da 022 (`telefone_ddd`, `telefone_linha`, `telefones_batem`)
-- e da 043 (coluna `origem`).
--
-- Rode no SQL Editor (ou `npm run migrar`). Pode rodar mais de uma vez.
-- ============================================================

-- 1a. Convites quebrados que duplicam um convite certo: saem.
--     Também resolve dois quebrados que dariam a mesma chave certa no
--     mesmo desafio (fica o primeiro), para o update abaixo não bater
--     na chave primária (challenge_id, telefone).
with candidatos as (
  select
    v.challenge_id,
    v.telefone,
    public.telefone_ddd(v.telefone_exibicao) || public.telefone_linha(v.telefone_exibicao) as chave
  from public.challenge_convidados v
  where v.telefone_exibicao is not null
    and public.telefone_ddd(v.telefone_exibicao) is not null
    and length(public.telefone_linha(v.telefone_exibicao)) = 8
    and v.telefone <> public.telefone_ddd(v.telefone_exibicao) || public.telefone_linha(v.telefone_exibicao)
),
ordenados as (
  select c.*,
    row_number() over (partition by c.challenge_id, c.chave order by c.telefone) as ordem
  from candidatos c
)
delete from public.challenge_convidados v
using ordenados o
where v.challenge_id = o.challenge_id
  and v.telefone = o.telefone
  and (
    o.ordem > 1
    or exists (
      select 1 from public.challenge_convidados certo
      where certo.challenge_id = o.challenge_id and certo.telefone = o.chave
    )
  );

-- 1b. Os demais quebrados ganham a chave certa.
update public.challenge_convidados v
set telefone = public.telefone_ddd(v.telefone_exibicao) || public.telefone_linha(v.telefone_exibicao)
where v.telefone_exibicao is not null
  and public.telefone_ddd(v.telefone_exibicao) is not null
  and length(public.telefone_linha(v.telefone_exibicao)) = 8
  and v.telefone <> public.telefone_ddd(v.telefone_exibicao) || public.telefone_linha(v.telefone_exibicao);

-- 2. Convite cujo telefone já tem conta (exatamente uma) vira
--    participação, e o convite sai da espera. É o que `handle_new_user`
--    teria feito no cadastro se a chave estivesse certa.
with unicos as (
  select v.challenge_id, v.telefone, v.origem, min(p.id::text)::uuid as user_id
  from public.challenge_convidados v
  join public.profiles p
    on p.telefone is not null
   and public.telefones_batem(p.telefone, v.telefone)
  group by v.challenge_id, v.telefone, v.origem
  having count(*) = 1
),
inseridos as (
  insert into public.challenge_members (challenge_id, user_id, origem)
  select u.challenge_id, u.user_id, u.origem from unicos u
  on conflict (challenge_id, user_id) do nothing
)
delete from public.challenge_convidados v
using unicos u
where v.challenge_id = u.challenge_id and v.telefone = u.telefone;

-- ============================================================
-- Conferir depois de rodar — convites que ainda esperam conta:
--   select c.titulo, v.nome, v.telefone_exibicao, v.telefone
--   from challenge_convidados v join challenges c on c.id = v.challenge_id
--   order by c.titulo, v.nome;
-- Convite sem `telefone_exibicao` com 10 dígitos pode ser um celular
-- que perdeu o DDD e não dá para recuperar: confira à mão.
-- ============================================================
