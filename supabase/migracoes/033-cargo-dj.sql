-- ============================================================
-- MIGRAÇÃO 033 — Cargo de DJ 💿 (no máximo 5)
--
-- O QUE ACONTECIA
-- Todo professor (e diretor de ensino) podia conectar o Spotify e ser
-- DJ. Mas o app do Spotify, no modo de desenvolvimento, só aceita 5
-- contas — o sexto professor conectava e levava um "não liberado".
--
-- O QUE MUDA
-- - Existe o cargo "DJ". Quem conecta o Spotify e é aceito por ele
--   (a conta está liberada no painel do Spotify) ganha o cargo na hora.
-- - Com 5 DJs, a porta fecha: nenhum outro professor vê mais a conexão
--   do Spotify nem liga o Modo DJ. Os 5 continuam podendo.
-- - A organização edita a lista no painel (Pessoas → DJs, ou pelo
--   cargo da pessoa). Dar o cargo a uma 6ª pessoa é recusado: tire de
--   alguém antes. Tirar o cargo desconecta o Spotify da pessoa e fecha
--   a sessão de DJ dela, se estiver aberta.
-- - Quem já estava conectado ganha o cargo agora (até 5, pela ordem em
--   que conectou).
--
-- Lembrete: a lista do painel do Spotify (User Management) é à parte.
-- Ao trocar um DJ aqui, troque lá também.
--
-- Rode no SQL Editor depois da 029. Pode rodar mais de uma vez.
-- ============================================================

insert into public.cargos (nome, ordem) values ('DJ', 12)
on conflict (nome) do nothing;

-- ---------- O teto ----------
create or replace function public.limite_djs()
returns int
language sql immutable
as $$ select 5 $$;

create or replace function public.total_djs()
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from profile_cargos where cargo = 'DJ';
$$;

-- ---------- Quem pode ser DJ ----------
-- Quem tem o cargo, sempre. Fora isso, professor / diretor de ensino /
-- organizador, mas só enquanto houver vaga.
create or replace function public.pode_ser_dj(p_uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profile_cargos where user_id = p_uid and cargo = 'DJ'
  ) or (
    total_djs() < limite_djs()
    and (
      exists (
        select 1 from profile_cargos
        where user_id = p_uid and cargo in ('Professor(a)', 'Diretor(a) de Ensino')
      ) or exists (
        select 1 from roles where user_id = p_uid and papel = 'organizador'
      )
    )
  );
$$;

-- ---------- O teto vale para todo mundo, painel incluído ----------
create or replace function public.cargo_dj_no_limite()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.cargo <> 'DJ' then
    return new;
  end if;
  -- Serializa: dois professores conectando no mesmo instante não
  -- passam os dois pela 5ª vaga
  perform pg_advisory_xact_lock(hashtext('cargo-dj'));
  -- Upsert de quem já é DJ não é uma vaga nova
  if exists (
    select 1 from profile_cargos where user_id = new.user_id and cargo = 'DJ'
  ) then
    return new;
  end if;
  if total_djs() >= limite_djs() then
    raise exception 'Já há % DJs. Tire o cargo de alguém antes.', limite_djs();
  end if;
  return new;
end;
$$;

drop trigger if exists cargo_dj_no_limite on public.profile_cargos;
create trigger cargo_dj_no_limite
  before insert on public.profile_cargos
  for each row execute function public.cargo_dj_no_limite();

-- Sem o cargo, sem as chaves do Spotify: a vaga liberada não fica com
-- alguém que ainda toca música pelo app
create or replace function public.cargo_dj_removido()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.cargo <> 'DJ' then
    return old;
  end if;
  update dj_sessoes
  set fechada_em = now(), motivo_fechamento = 'desligou'
  where fechada_em is null and dj_user_id = old.user_id;
  delete from dj_conexoes where user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists cargo_dj_removido on public.profile_cargos;
create trigger cargo_dj_removido
  after delete on public.profile_cargos
  for each row execute function public.cargo_dj_removido();

-- ---------- Só para a Edge Function spotify-conectar ----------
-- Chamada depois que o Spotify aceitou a conta. Devolve false se as
-- vagas acabaram entre a conferência e agora (aí a conexão é desfeita).
create or replace function public.conceder_cargo_dj(p_uid uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cargo-dj'));
  if exists (
    select 1 from profile_cargos where user_id = p_uid and cargo = 'DJ'
  ) then
    return true;
  end if;
  if not pode_ser_dj(p_uid) then
    return false;
  end if;
  insert into profile_cargos (user_id, cargo) values (p_uid, 'DJ');
  return true;
end;
$$;

-- ---------- Quem já estava conectado ----------
insert into public.profile_cargos (user_id, cargo)
select c.user_id, 'DJ'
from public.dj_conexoes c
where not exists (
  select 1 from public.profile_cargos pc
  where pc.user_id = c.user_id and pc.cargo = 'DJ'
)
order by c.conectado_em
limit greatest(0, public.limite_djs() - public.total_djs());

-- ---------- Permissões ----------
revoke all on function public.total_djs() from public, anon;
grant execute on function public.total_djs() to authenticated;
revoke all on function public.cargo_dj_no_limite() from public, anon, authenticated;
revoke all on function public.cargo_dj_removido() from public, anon, authenticated;
revoke all on function public.conceder_cargo_dj(uuid) from public, anon, authenticated;
