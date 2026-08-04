-- ============================================================
-- MIGRAÇÃO 005 — Check-ins favoritos
--
-- O aluno pode marcar os próprios check-ins como favoritos. Eles
-- ganham uma galeria no perfil e ficam DE FORA da política de
-- retenção (retencao.sql), que apaga as fotos com mais de 6 meses.
--
-- Como favorito = foto guardada pra sempre, existe um teto por
-- pessoa (LIMITE_FAVORITOS = 12, igual ao src/lib/types.ts). Se
-- mudar aqui, mude lá também.
--
-- Rode ESTE arquivo no SQL Editor do Supabase se o seu banco já
-- está no ar. NÃO rode o schema.sql inteiro de novo.
--
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

alter table public.checkins
  add column if not exists favorito boolean not null default false;

-- Galeria do perfil: favoritos de uma pessoa, do mais novo pro mais velho
create index if not exists checkins_favoritos_idx
  on public.checkins (user_id, criado_em desc)
  where favorito;

-- Marcar favorito é a ÚNICA alteração permitida num check-in — por isso
-- uma função em vez de uma policy de update (que deixaria o dono trocar
-- também a foto e a legenda depois de publicadas).
create or replace function public.favoritar_checkin(
  p_checkin uuid,
  p_valor boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_total int;
begin
  select user_id into v_dono from public.checkins where id = p_checkin;
  if v_dono is null then
    raise exception 'Check-in não encontrado';
  end if;
  if v_dono <> auth.uid() then
    raise exception 'Você só pode favoritar os seus próprios check-ins';
  end if;

  if p_valor then
    select count(*) into v_total
    from public.checkins
    where user_id = auth.uid() and favorito and id <> p_checkin;
    if v_total >= 12 then
      raise exception 'Você já tem 12 favoritos. Desmarque um para guardar outro.';
    end if;
  end if;

  update public.checkins set favorito = p_valor where id = p_checkin;
end;
$$;

revoke all on function public.favoritar_checkin(uuid, boolean) from public;
grant execute on function public.favoritar_checkin(uuid, boolean) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- A retencao.sql já foi atualizada para pular os favoritos — use
-- sempre a versão nova daquele arquivo daqui pra frente.
-- ============================================================
