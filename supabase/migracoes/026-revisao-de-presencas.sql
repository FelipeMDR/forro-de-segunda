-- ============================================================
-- MIGRAÇÃO 026 — A organização revisa as fotos e anula o que não valeu
--
-- POR QUE NÃO É UM SENSOR
-- A trava de GPS foi desligada porque punia quem apareceu: sinal que
-- não fecha, permissão negada e leitura imprecisa viravam acusação
-- contra o aluno. Rede wi-fi também não serve aqui — a do espaço é da
-- universidade, e boa parte da galera está no 4G.
--
-- O que sobra é o que o app já tinha de mais forte desde o começo: a
-- FOTO, tirada na hora, sem galeria, e visível para todo mundo. Trinta
-- miniaturas de uma noite lado a lado, e a que foi tirada num quarto
-- salta aos olhos em dois segundos. Isso não precisa de sensor nem de
-- modelo: precisa de uma tela onde dê para olhar e marcar.
--
-- A DIFERENÇA EM RELAÇÃO A EXCLUIR A FOTO
-- Já dava para o organizador APAGAR um check-in (policy de delete).
-- Mas apagar é forte demais para este caso: leva a foto, os
-- comentários e as reações junto, e trata como abuso o que quase
-- sempre é engano. Anular só desliga a PRESENÇA: a foto continua no
-- feed, e o ponto some — que é exatamente o que estava em disputa.
--
-- Anular também é reversível, e guarda quem anulou e quando. Isso
-- importa porque a decisão é sobre uma pessoa, não sobre um dado.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

alter table public.checkins
  add column if not exists presenca_anulada boolean not null default false,
  add column if not exists anulada_por uuid references public.profiles(id)
    on delete set null,
  add column if not exists anulada_em timestamptz;

comment on column public.checkins.presenca_anulada is
  'A organização revisou e decidiu que esta foto não vale presença. A '
  'foto segue no feed; só o ponto sai. Ver migração 026.';

-- Achar rápido o que ainda não foi revisado numa noite.
create index if not exists checkins_anulada_idx
  on public.checkins (presenca_anulada, criado_em desc);

/**
 * Liga/desliga a presença de um check-in. Só organizador.
 *
 * Via função, e não por policy de update, pelo mesmo motivo do
 * `favoritar_checkin` (migração 005): uma policy de update aberta
 * deixaria trocar também a foto e a legenda depois de publicadas.
 */
create or replace function public.anular_presenca(
  p_checkin uuid,
  p_valor boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_organizador() then
    raise exception 'Só a organização pode revisar presenças';
  end if;

  update public.checkins
  set presenca_anulada = p_valor,
      anulada_por = case when p_valor then v_uid else null end,
      anulada_em  = case when p_valor then now() else null end
  where id = p_checkin;
end;
$$;

revoke all on function public.anular_presenca(uuid, boolean) from public, anon;
grant execute on function public.anular_presenca(uuid, boolean) to authenticated;

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- Nada muda sozinho: todo check-in nasce valendo, e só sai da conta
-- quando alguém da organização marcar. É o oposto da trava de GPS, que
-- reprovava por padrão quando o sensor não respondia.
--
-- CADA MARCAÇÃO É UM RÓTULO. Se um dia valer a pena treinar um modelo
-- para ordenar a fila de revisão (a ideia é do Felipe), o conjunto de
-- treino sai daqui: `presenca_anulada = true` são os exemplos
-- negativos, e o resto das fotos do mesmo período, os positivos.
-- ============================================================
