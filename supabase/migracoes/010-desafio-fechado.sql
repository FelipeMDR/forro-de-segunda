-- ============================================================
-- MIGRAÇÃO 010 — Desafio de entrada restrita
--
-- Para desafios de evento restrito (Forró na Rep): o aluno não
-- entra sozinho, só a organização adiciona — normalmente importando a
-- lista de quem comprou ingresso.
--
-- A festa é aberta, então parte da lista pode não ter conta no app.
-- Esses ficam em challenge_convidados (por telefone) e entram sozinhos
-- no desafio quando criarem a conta — mesmo mecanismo que a lista de
-- chamada já usa para turma.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.challenges
  add column if not exists entrada_restrita boolean not null default false;

-- Convidados ainda sem conta: guardados por telefone até a conta existir
create table if not exists public.challenge_convidados (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  -- Só dígitos, normalizado, para casar independente da formatação
  telefone text not null,
  -- Como veio na planilha. A normalização guarda os 10 últimos dígitos
  -- e assim come parte do DDD, então mostrar o valor normalizado faria
  -- o número parecer de outro estado na hora de conferir a lista.
  telefone_exibicao text,
  nome text,
  criado_em timestamptz not null default now(),
  primary key (challenge_id, telefone)
);

alter table public.challenge_convidados
  add column if not exists telefone_exibicao text;

alter table public.challenge_convidados enable row level security;

-- Contém telefone de gente de fora do projeto: só a organização vê.
drop policy if exists "convidados_organizador" on public.challenge_convidados;
create policy "convidados_organizador" on public.challenge_convidados
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- Entrada restrita: o aluno não se inscreve nem se desinscreve sozinho.
-- Precisa valer aqui, senão uma chamada direta à API entraria na festa
-- sem ingresso.
drop policy if exists "members_insert" on public.challenge_members;
create policy "members_insert" on public.challenge_members
  for insert to authenticated
  with check (
    public.is_organizador()
    or (
      user_id = auth.uid()
      and not exists (
        select 1 from public.challenges c
        where c.id = challenge_id and c.entrada_restrita
      )
    )
  );

drop policy if exists "members_delete" on public.challenge_members;
create policy "members_delete" on public.challenge_members
  for delete to authenticated
  using (
    public.is_organizador()
    or (
      user_id = auth.uid()
      and not exists (
        select 1 from public.challenges c
        where c.id = challenge_id and c.entrada_restrita
      )
    )
  );

/**
 * Convidado da festa também pode criar conta.
 *
 * Sem isso o recurso não fecha o ciclo: o cadastro só aceita telefone
 * que está na lista de chamada, e a festa é aberta ao público — quem
 * comprou ingresso sem ser aluno seria barrado no cadastro e o convite
 * nunca se ativaria.
 */
create or replace function public.telefone_na_lista(tel text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a record;
  tem_na_lista boolean;
  eh_convidado boolean;
  nome_convite text;
  conta boolean;
begin
  if length(normalizar_telefone(tel)) < 8 then
    return jsonb_build_object('existe', false, 'nome', null, 'ja_tem_conta', false);
  end if;

  select nome into a from alunos_cadastrados
  where normalizar_telefone(telefone) = normalizar_telefone(tel)
  limit 1;
  tem_na_lista := found;

  select nome into nome_convite from challenge_convidados
  where telefone = normalizar_telefone(tel)
  limit 1;
  eh_convidado := found;

  select exists (
    select 1 from profiles
    where telefone is not null
      and normalizar_telefone(telefone) = normalizar_telefone(tel)
  ) into conta;

  return jsonb_build_object(
    'existe', tem_na_lista or eh_convidado,
    'nome', coalesce(a.nome, nome_convite),
    'ja_tem_conta', conta
  );
end;
$$;

grant execute on function public.telefone_na_lista(text) to anon, authenticated;

/**
 * Conta nova entra automaticamente nos desafios em que foi convidada.
 *
 * Reescreve handle_new_user acrescentando esse trecho ao que já existia
 * (perfil, turmas da lista de chamada, papel) — é o mesmo gatilho, não
 * dá para ter dois.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tel text;
  tel_norm text;
  nome_lista text;
  nome_convite text;
begin
  tel := new.raw_user_meta_data ->> 'telefone';
  tel_norm := normalizar_telefone(coalesce(tel, ''));

  select nome into nome_lista from alunos_cadastrados
  where normalizar_telefone(telefone) = tel_norm
    and length(tel_norm) >= 8
  limit 1;

  -- Convidado da festa não está na lista de chamada, mas o nome veio
  -- na planilha de ingressos — melhor que cair no genérico.
  select nome into nome_convite from challenge_convidados
  where telefone = tel_norm and length(tel_norm) >= 8
  limit 1;

  insert into profiles (id, nome, avatar_url, telefone)
  values (
    new.id,
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
      nome_convite,
      'Dançarino(a)'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(trim(coalesce(tel, '')), '')
  )
  on conflict (id) do nothing;

  -- Copia TODAS as turmas da lista de chamada para o novo perfil
  insert into profile_turmas (user_id, turma, papel_danca)
  select new.id, a.turma, a.papel_danca
  from alunos_cadastrados a
  where normalizar_telefone(a.telefone) = tel_norm
    and length(tel_norm) >= 8
  on conflict (user_id, turma) do nothing;

  -- Desafios em que o telefone foi convidado (ingresso comprado antes
  -- de existir conta no app)
  if length(tel_norm) >= 8 then
    insert into challenge_members (challenge_id, user_id)
    select v.challenge_id, new.id
    from challenge_convidados v
    where v.telefone = tel_norm
    on conflict (challenge_id, user_id) do nothing;

    delete from challenge_convidados where telefone = tel_norm;
  end if;

  insert into roles (user_id, papel) values (new.id, 'aluno')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Conferir quem ainda está pendente de criar conta:
--   select c.titulo, v.nome, v.telefone
--   from challenge_convidados v
--   join challenges c on c.id = v.challenge_id;
-- ============================================================
