-- ============================================================
-- MIGRAÇÃO 014 — Check-in conta mesmo para quem entra no desafio depois
--
-- Entrar num desafio é escolher competir, e isso não é obrigatório.
-- Mas quem sempre apareceu e resolve entrar no meio do caminho devia
-- levar junto as presenças que já tinha.
--
-- Para desafio SEM trava de local isso já funcionava: o ranking soma
-- os check-ins do período, sem olhar a data de entrada.
--
-- Para desafio COM trava de local, não: registrar_checkin só gravava o
-- veredito ("esta foto valeu no local X") para quem JÁ ERA MEMBRO na
-- hora da foto. Quem entrasse depois começava do zero, e não havia
-- conserto — a coordenada não é guardada em lugar nenhum, então não dá
-- para avaliar o passado.
--
-- A correção é gravar o veredito para todo desafio ativo com local,
-- independentemente de participação. Quando a pessoa entrar, os pontos
-- aparecem sozinhos.
--
-- O QUE MUDA EM EXPOSIÇÃO: passa a existir uma linha dizendo que
-- determinada foto foi tirada dentro do raio daquele desafio, mesmo
-- para quem não participa dele. Continua sem coordenada nenhuma, e a
-- foto já está no feed com data e hora — o lugar da aula é público. O
-- que NÃO fazemos é guardar onde a pessoa estava quando a foto caiu
-- fora de todos os raios: aí nenhuma linha é criada.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

create or replace function public.registrar_checkin(
  p_foto_url text,
  p_legenda text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Você precisa entrar primeiro';
  end if;

  insert into public.checkins (user_id, foto_url, legenda)
  values (v_uid, p_foto_url, nullif(btrim(coalesce(p_legenda, '')), ''))
  returning id into v_id;

  if p_lat is not null and p_lng is not null then
    -- Sem o join com challenge_members: o veredito é sobre o LUGAR,
    -- não sobre participação. Quem entrar depois aproveita.
    insert into public.checkin_locais (checkin_id, challenge_id)
    select v_id, c.id
    from public.challenges c
    where c.local_lat is not null
      and current_date between c.data_inicio and c.data_fim
      and public.distancia_m(p_lat, p_lng, c.local_lat, c.local_lng)
          <= c.local_raio_m
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

revoke all on function public.registrar_checkin(text, text, double precision, double precision) from public, anon;
grant execute on function public.registrar_checkin(text, text, double precision, double precision) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- VALE DAQUI PRA FRENTE. Check-ins que já foram feitos por quem não
-- era membro continuam sem veredito e seguem não pontuando em desafio
-- com trava de local — não há como saber, hoje, se aquelas fotos foram
-- tiradas dentro do raio. Desafio sem trava de local não é afetado:
-- lá o retroativo sempre valeu.
-- ============================================================
