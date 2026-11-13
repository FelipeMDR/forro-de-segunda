-- ============================================================
-- MIGRAÇÃO 045 — Resumo da sincronização com o total e os repetidos
--
-- O PROBLEMA
-- O painel mostrava "58 dentro · 27 aguardando conta" para uma planilha
-- de 92 linhas, e a conta não fechava. As linhas que faltavam eram
-- telefones repetidos (o mesmo número em duas linhas), que a
-- sincronização pulava sem registrar em lugar nenhum.
--
-- O QUE MUDA
-- O resumo de `sincronizar_planilha_ingresso` ganha:
--   - `linhas_planilha`: quantas linhas com nome ou telefone havia;
--   - `repetidos`: [{linha, nome, igual_a}] — a linha repetida, o nome
--     escrito nela e a linha onde o mesmo telefone apareceu primeiro.
-- Assim dentro + aguardando + inválidos + ambíguos + repetidos =
-- linhas da planilha, e a organização sabe o que limpar.
-- Nada mais muda na função (é a da 043 com essas contas a mais).
--
-- Rode no SQL Editor (ou `npm run migrar`). Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.sincronizar_planilha_ingresso(p_segredo text, p_grade jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_desafio uuid;
  v_congelado boolean;
  v_grade jsonb := case when jsonb_typeof(p_grade) = 'array' then p_grade else '[]' end;
  v_total int;
  v_cab int;
  c_nome int;
  c_tel int;
  c_marcar int;
  a_nome int;
  a_tel int;
  a_marcar int;
  v_linha jsonb;
  v_nome text;
  v_cel text;
  v_tel text;
  v_chave text;
  v_ddd text;
  v_lin text;
  v_perfis uuid[];
  v_convites text[];
  v_perfis_por_linha jsonb;
  v_convites_por_linha jsonb;
  v_sit text;
  v_status text;
  v_chaves text[] := '{}';
  v_linhas jsonb := '[]';
  v_invalidos jsonb := '[]';
  v_ambiguos jsonb := '[]';
  v_repetidos jsonb := '[]';
  -- chave -> linha (1, 2, …, como na planilha) onde ela apareceu primeiro
  v_primeira jsonb := '{}';
  n_linhas int := 0;
  n_dentro int := 0;
  n_aguardando int := 0;
  n_convites int;
  n_da_planilha int;
  n_fora int := 0;
  n_removidos int := 0;
  n_travadas int := 0;
begin
  -- `for update`: duas sincronizações do mesmo desafio esperam uma a outra
  select s.challenge_id,
         -- Congelamento (spec, "Congelamento depois do evento"): do dia
         -- seguinte à festa em diante, nada entra nem sai. Se a planilha
         -- for limpa ou reaproveitada, a edição que passou não perde os
         -- distintivos. `noite_do_checkin` vira o dia às 05:00, então a
         -- madrugada da festa ainda conta como dia da festa.
         coalesce(public.noite_do_checkin(public.ingresso_agora()) > c.evento_data, false)
    into v_desafio, v_congelado
  from ingresso_segredos s
  join challenges c on c.id = s.challenge_id
  where c.evento_data is not null
    and s.segredo_hash = encode(sha256(convert_to(coalesce(p_segredo, ''), 'UTF8')), 'hex')
  for update of s;

  if v_desafio is null then
    raise exception 'Segredo inválido';
  end if;

  -- A base da trava é quem já vinha da planilha antes deste envio
  select (select count(*) from challenge_members
           where challenge_id = v_desafio and origem = 'planilha')
       + (select count(*) from challenge_convidados
           where challenge_id = v_desafio and origem = 'planilha')
    into n_da_planilha;

  -- Telefones decompostos uma vez por chamada, não a cada linha da
  -- planilha: cada perfil e cada convite deste desafio vira (DDD, linha)
  -- uma vez só, num mapa pela linha. Por linha da planilha fica uma busca
  -- no mapa, em vez de `telefones_batem` (várias expressões regulares)
  -- contra todos os perfis; a chamada anon tem poucos segundos. A regra
  -- de casar é a de `telefones_batem`: a linha bate sempre, e o DDD
  -- quando os dois lados o têm (a chave da planilha sempre tem).
  -- O mapa de convites não precisa ser refeito durante o laço: convite
  -- novo tem a chave da própria linha, e outra linha com a mesma chave é
  -- `repetido` antes de consultar o mapa.
  select coalesce(jsonb_object_agg(x.linha, x.itens), '{}')
    into v_perfis_por_linha
  from (
    select t.linha, jsonb_agg(jsonb_build_object('id', t.id, 'ddd', t.ddd)) as itens
    from (
      select p.id,
             public.telefone_ddd(p.telefone) as ddd,
             public.telefone_linha(p.telefone) as linha
      from profiles p
    ) t
    where t.linha <> ''
    group by t.linha
  ) x;

  select coalesce(jsonb_object_agg(x.linha, x.itens), '{}')
    into v_convites_por_linha
  from (
    select t.linha, jsonb_agg(jsonb_build_object('tel', t.telefone, 'ddd', t.ddd)) as itens
    from (
      select v.telefone,
             public.telefone_ddd(v.telefone) as ddd,
             public.telefone_linha(v.telefone) as linha
      from challenge_convidados v
      where v.challenge_id = v_desafio
    ) t
    where t.linha <> ''
    group by t.linha
  ) x;

  -- Cabeçalho: a primeira linha com uma célula NOME e outra CELULAR ou
  -- TELEFONE (sem diferenciar maiúsculas e acentos). A coluna de marcar
  -- é a que começa com ADICIONADO, e é opcional.
  v_total := jsonb_array_length(v_grade);
  for i in 0 .. v_total - 1 loop
    select
      min(e.k - 1) filter (where e.t = 'NOME'),
      min(e.k - 1) filter (where e.t in ('CELULAR', 'TELEFONE')),
      min(e.k - 1) filter (where e.t like 'ADICIONADO%')
      into a_nome, a_tel, a_marcar
    from (
      select k, upper(translate(trim(v),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) as t
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_grade -> i) = 'array' then v_grade -> i else '[]' end
      ) with ordinality as x(v, k)
    ) e;

    if a_nome is not null and a_tel is not null then
      v_cab := i;
      c_nome := a_nome;
      c_tel := a_tel;
      c_marcar := a_marcar;
      exit;
    end if;
  end loop;

  if v_cab is not null then
    for i in v_cab + 1 .. v_total - 1 loop
      v_linha := case when jsonb_typeof(v_grade -> i) = 'array' then v_grade -> i else '[]' end;
      v_nome := trim(coalesce(v_linha ->> c_nome, ''));
      v_cel := trim(coalesce(v_linha ->> c_tel, ''));
      -- Linhas numeradas (QT.) sem nome nem telefone, no fim da lista
      continue when v_nome = '' and v_cel = '';
      n_linhas := n_linhas + 1;

      v_tel := public.telefone_da_planilha(v_cel);
      v_ddd := public.telefone_ddd(v_tel);
      v_lin := public.telefone_linha(v_tel);
      v_sit := null;

      if v_ddd is null or length(v_lin) <> 8 then
        v_sit := 'telefone_invalido';
        v_invalidos := v_invalidos || jsonb_build_array(
          jsonb_build_object('linha', i + 1, 'nome', v_nome));
      else
        v_chave := v_ddd || v_lin;

        if v_chave = any(v_chaves) then
          v_sit := 'repetido';
          v_repetidos := v_repetidos || jsonb_build_array(
            jsonb_build_object('linha', i + 1, 'nome', v_nome,
                               'igual_a', (v_primeira ->> v_chave)::int));
        else
          v_chaves := v_chaves || v_chave;
          v_primeira := v_primeira || jsonb_build_object(v_chave, i + 1);
          -- = telefones_batem(p.telefone, v_chave), pelo mapa
          select array_agg((e ->> 'id')::uuid) into v_perfis
          from jsonb_array_elements(coalesce(v_perfis_por_linha -> v_lin, '[]')) e
          where e ->> 'ddd' is null or e ->> 'ddd' = v_ddd;
          -- = telefones_batem(telefone, v_chave) nos convites do desafio
          select array_agg(e ->> 'tel') into v_convites
          from jsonb_array_elements(coalesce(v_convites_por_linha -> v_lin, '[]')) e
          where e ->> 'ddd' is null or e ->> 'ddd' = v_ddd;
          n_convites := coalesce(cardinality(v_convites), 0);

          if coalesce(cardinality(v_perfis), 0) > 1 then
            -- Contas antigas sem DDD casam só pela linha: ninguém entra
            -- por aqui, e a organização resolve à mão
            v_sit := 'ambiguo';
            v_ambiguos := v_ambiguos || jsonb_build_array(
              jsonb_build_object('linha', i + 1, 'nome', v_nome));
          elsif cardinality(v_perfis) = 1 then
            if v_congelado then
              -- Só lê: fora do desafio, a linha não entra na resposta e o
              -- script não mexe na caixa dela
              if exists (select 1 from challenge_members
                          where challenge_id = v_desafio and user_id = v_perfis[1]) then
                v_sit := 'dentro';
              end if;
            else
              -- Membro manual que está na planilha passa a ser da planilha
              insert into challenge_members (challenge_id, user_id, origem)
              values (v_desafio, v_perfis[1], 'planilha')
              on conflict (challenge_id, user_id) do update set origem = 'planilha';
              v_sit := 'dentro';
            end if;
          else
            if v_congelado then
              if n_convites > 0 then
                v_sit := 'aguardando_conta';
              end if;
            else
              if n_convites = 1 then
                -- Convite único que bate: passa a ser da planilha (como o
                -- membro manual que está nela)
                update challenge_convidados
                  set origem = 'planilha',
                      nome = coalesce(nullif(v_nome, ''), nome),
                      telefone_exibicao = v_cel
                where challenge_id = v_desafio
                  and telefone = v_convites[1];
              elsif n_convites = 0 then
                -- Guarda a chave (DDD + linha), não os dígitos crus:
                -- `normalizar_telefone` de um celular de 11 dígitos fica com
                -- os 10 últimos e perde o primeiro dígito do DDD, e aí o
                -- convite nunca bateria com o cadastro (`membro_por_convite`)
                insert into challenge_convidados
                  (challenge_id, telefone, telefone_exibicao, nome, origem)
                values
                  (v_desafio, public.normalizar_telefone(v_chave), v_cel,
                   nullif(v_nome, ''), 'planilha')
                on conflict (challenge_id, telefone) do nothing;
              else
                -- Dois ou mais convites batem (um antigo sem DDD casa só
                -- pela linha): nenhum vira da planilha, senão uma mudança
                -- na planilha apagaria um convite manual; e nada de convite
                -- novo, que seria duplicado. A pessoa já está convidada.
                null;
              end if;
              v_sit := 'aguardando_conta';
            end if;
          end if;
        end if;
      end if;

      if v_sit is not null then
        v_linhas := v_linhas || jsonb_build_array(
          jsonb_build_object('indice', i, 'situacao', v_sit));
        n_dentro := n_dentro + (v_sit = 'dentro')::int;
        n_aguardando := n_aguardando + (v_sit = 'aguardando_conta')::int;
      end if;
    end loop;
  end if;

  v_status := case
    when v_congelado then 'congelado'
    when v_cab is null then 'sem_cabecalho'
    else 'ok'
  end;

  if v_status = 'ok' then
    n_fora := public.remover_fora_da_planilha(v_desafio, v_chaves, false);
    -- Trava contra remoção em massa (spec, "Trava de segurança"): uma
    -- planilha esvaziada, uma aba trocada ou uma falha do Google não
    -- podem tirar o ingresso de ninguém. Lista válida vazia, ou mais de
    -- 20% de quem veio da planilha E mais de 3 pessoas: ninguém sai, as
    -- entradas valem, e a organização confirma pelo painel se for de
    -- propósito.
    if n_fora > 0 and (
      cardinality(v_chaves) = 0
      or (n_fora > 0.2 * n_da_planilha and n_fora > 3)
    ) then
      n_travadas := n_fora;
    elsif n_fora > 0 then
      n_removidos := public.remover_fora_da_planilha(v_desafio, v_chaves, true);
    end if;
  end if;

  insert into ingresso_sincronizacoes (challenge_id, em, resumo)
  values (v_desafio, now(), jsonb_build_object(
    'status', v_status,
    'dentro', n_dentro,
    'aguardando', n_aguardando,
    'invalidos', v_invalidos,
    'ambiguos', v_ambiguos,
    'repetidos', v_repetidos,
    'linhas_planilha', n_linhas,
    'removidos', n_removidos,
    'remocoes_travadas', n_travadas,
    'chaves', to_jsonb(v_chaves)
  ))
  on conflict (challenge_id) do update
    set em = excluded.em, resumo = excluded.resumo;

  return jsonb_build_object(
    'status', v_status,
    'coluna_marcar', c_marcar,
    'linhas', v_linhas,
    'removidos', n_removidos,
    'remocoes_travadas', n_travadas
  );
end;
$$;

grant execute on function public.sincronizar_planilha_ingresso(text, jsonb) to anon, authenticated;
