-- ============================================================
-- MIGRAÇÃO 032 — Editar a legenda de um check-in
--
-- O QUE ACONTECIA
-- Publicado, o check-in ficava como estava: um erro de digitação na
-- legenda só se corrigia apagando a foto e postando de novo — o que
-- perdia as reações e os comentários, e ainda esbarrava no intervalo
-- entre check-ins (migração 007).
--
-- O QUE MUDA
-- Uma função para o dono trocar SÓ a legenda. Continua sem policy de
-- update em checkins (ver favoritar_checkin, migração 005): a foto e a
-- data seguem intocáveis, que é o que vale como presença.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.editar_legenda(
  p_checkin uuid,
  p_legenda text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
begin
  select user_id into v_dono from public.checkins where id = p_checkin;
  if v_dono is null then
    raise exception 'Check-in não encontrado';
  end if;
  if v_dono <> auth.uid() then
    raise exception 'Você só pode editar os seus próprios check-ins';
  end if;
  -- Mesmo teto do campo na tela de check-in
  if char_length(v_legenda) > 200 then
    raise exception 'A legenda pode ter no máximo 200 caracteres';
  end if;

  update public.checkins set legenda = v_legenda where id = p_checkin;
end;
$$;

revoke all on function public.editar_legenda(uuid, text) from public;
grant execute on function public.editar_legenda(uuid, text) to authenticated;
