-- ============================================================
-- MIGRAÇÃO 016 — "Dancei com" e o carimbo de notificações lidas
--
-- Forró é dança de par, e até agora o app não ligava aluno com aluno.
-- Marcar com quem se dançou cria essa ligação — e é o que permite os
-- distintivos de rodízio e a retrospectiva do semestre.
--
-- COMO A MENTIRA É CONTIDA, em três camadas:
--
-- 1. CO-PRESENÇA (aqui, na função marcar_dupla): só dá para marcar
--    quem também fez check-in naquele dia. Elimina a mentira que
--    incomodaria de verdade — dizer que dançou com quem nem apareceu —
--    sem custar nenhum passo a mais para quem é honesto.
--
-- 2. CONFIRMAÇÃO AUTOMÁTICA: se os dois se marcam, a dupla vira
--    confirmada sozinha, sem etapa extra. Como os dois passam pela
--    mesma grade de rostos depois do check-in, a maioria fecha assim.
--
-- 3. DOIS NÍVEIS: marcação de mão única aparece no app, mas só a
--    confirmada conta para distintivo e retrospectiva. Quem quisesse
--    inflar o próprio número dependeria de alguém confirmar.
--
-- E a pessoa marcada pode remover a marcação a qualquer momento.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- Marcação direcionada: de_user diz que dançou com para_user naquele
-- dia. Duas linhas opostas = dupla confirmada dos dois lados.
create table if not exists public.duplas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  de_user uuid not null references public.profiles(id) on delete cascade,
  para_user uuid not null references public.profiles(id) on delete cascade,
  confirmada boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (data, de_user, para_user),
  constraint duplas_pessoas_diferentes check (de_user <> para_user)
);

create index if not exists duplas_para_idx on public.duplas (para_user, data);
create index if not exists duplas_de_idx on public.duplas (de_user, data);

alter table public.duplas enable row level security;

drop policy if exists "duplas_select" on public.duplas;
drop policy if exists "duplas_delete" on public.duplas;
-- Sem policy de insert/update: só a função marcar_dupla escreve, senão
-- a checagem de co-presença seria contornável escrevendo direto.
create policy "duplas_select" on public.duplas
  for select to authenticated using (true);
-- Apaga quem marcou (mudei de ideia) ou quem foi marcado (não rolou)
create policy "duplas_delete" on public.duplas
  for delete to authenticated
  using (de_user = auth.uid() or para_user = auth.uid());

/**
 * Marca que dancei com alguém num dia.
 *
 * Exige que OS DOIS tenham check-in na data — é a camada 1 descrita
 * acima. Roda como security definer porque escreve numa tabela sem
 * policy de insert: é isso que impede alguém de forjar a marcação
 * passando por cima da checagem.
 */
create or replace function public.marcar_dupla(
  p_parceiro uuid,
  p_data date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;
  if p_parceiro = v_uid then
    raise exception 'Não dá para marcar você mesmo';
  end if;

  if not exists (
    select 1 from checkins
    where user_id = v_uid and criado_em::date = p_data
  ) then
    raise exception 'Você não fez check-in nesse dia';
  end if;

  if not exists (
    select 1 from checkins
    where user_id = p_parceiro and criado_em::date = p_data
  ) then
    raise exception 'Essa pessoa não fez check-in nesse dia';
  end if;

  insert into public.duplas (data, de_user, para_user)
  values (p_data, v_uid, p_parceiro)
  on conflict (data, de_user, para_user) do nothing;

  -- Camada 2: se o outro lado já existe, os dois viram confirmados
  if exists (
    select 1 from public.duplas
    where data = p_data and de_user = p_parceiro and para_user = v_uid
  ) then
    update public.duplas
    set confirmada = true
    where data = p_data
      and ((de_user = v_uid and para_user = p_parceiro)
        or (de_user = p_parceiro and para_user = v_uid));
  end if;
end;
$$;

revoke all on function public.marcar_dupla(uuid, date) from public, anon;
grant execute on function public.marcar_dupla(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- Notificações
-- ------------------------------------------------------------
-- Não existe tabela de notificações: curtidas e comentários já estão
-- no banco, e a tela monta a lista consultando o que é meu. Some uma
-- tabela que cresceria para sempre, somem gatilhos e limpeza.

-- Faltava a hora da reação (comentário já tinha). Sem ela não dá para
-- ordenar a lista nem separar o que é novo.
alter table public.reactions
  add column if not exists criado_em timestamptz;
-- Reações antigas herdam a data da foto: mais honesto que carimbar
-- todas com "agora", o que faria a lista nascer cheia de falso-novo.
update public.reactions r
set criado_em = c.criado_em
from public.checkins c
where c.id = r.checkin_id and r.criado_em is null;
alter table public.reactions
  alter column criado_em set default now();
alter table public.reactions
  alter column criado_em set not null;

-- Até onde a pessoa já viu. Contas que existem hoje começam zeradas
-- (nada pendente); contas novas nascem carimbadas pelo default.
alter table public.profiles
  add column if not exists notificacoes_vistas_em timestamptz default now();
update public.profiles
set notificacoes_vistas_em = now()
where notificacoes_vistas_em is null;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
-- ============================================================
