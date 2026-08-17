-- ============================================================
-- Forró de Segunda — esquema completo do Supabase
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- ============================================================

-- ---------- Tabelas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  avatar_url text,
  telefone text,
  -- Cópia do e-mail de auth.users (só o real, nunca o sintético): o app
  -- não lê auth.users, e o painel precisa saber quem já pode recuperar
  -- a senha. Ver migração 013.
  email text,
  -- Até onde a pessoa já viu as notificações. Não há tabela de
  -- notificações: a lista é montada das reações, comentários e duplas
  -- que são meus, e este carimbo separa o novo do já visto (mig. 016).
  notificacoes_vistas_em timestamptz default now(),
  criado_em timestamptz not null default now()
);

-- Turmas do aluno. Um aluno pode estar em VÁRIAS turmas, com papéis
-- diferentes na dança (ex.: Condutor no Avançado, Conduzido no Inter).
-- Só a organização escreve aqui (ver RLS).
create table if not exists public.profile_turmas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turma text not null,
  papel_danca text check (papel_danca in ('Condutor(a)', 'Conduzido(a)')),
  primary key (user_id, turma)
);

-- Turmas em que a pessoa DÁ AULA — não em que estuda (isso é
-- profile_turmas). Tabela separada porque os dois vínculos significam
-- coisas diferentes: profile_turmas alimenta o rótulo do feed, o
-- distintivo de turma, o ranking e a chamada, e um professor lá dentro
-- passaria a contar como aluno matriculado em todos eles. Ver migração 023.
create table if not exists public.turma_professores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turma text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, turma)
);
create index if not exists turma_professores_turma_idx
  on public.turma_professores (turma);

create table if not exists public.roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  papel text not null default 'aluno' check (papel in ('aluno', 'organizador'))
);

-- Desafio = competição: cada check-in dentro da janela vale 1 ponto.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  data_inicio date not null,
  data_fim date not null,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

-- Janela de check-in por dia da semana: cada espaço tem seu próprio
-- horário de aula, então cada dia do desafio pode ter uma janela
-- diferente (ex.: segunda 18h–23h, quarta 20h–22h). No máximo uma
-- janela por dia em cada desafio.
create table if not exists public.challenge_janelas (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=domingo … 6=sábado
  hora_inicio time not null,
  hora_fim time not null,
  primary key (challenge_id, dia_semana)
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- Um check-in vale para todos os desafios cuja janela ele cai
-- (o ranking avalia dia/horário/período), por isso não há challenge_id.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  foto_url text not null,
  legenda text,
  -- Favorito do dono: ganha galeria no perfil e escapa da retenção de
  -- fotos (retencao.sql). Só muda via favoritar_checkin().
  favorito boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists checkins_criado_em_idx on public.checkins (criado_em desc);
create index if not exists checkins_user_idx on public.checkins (user_id);
create index if not exists checkins_favoritos_idx
  on public.checkins (user_id, criado_em desc)
  where favorito;

create table if not exists public.reactions (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null,
  criado_em timestamptz not null default now(),
  primary key (checkin_id, user_id)
);

-- Marcação de dupla: de_user diz que dançou com para_user naquele dia.
-- Duas linhas opostas = confirmada dos dois lados. Só a função
-- marcar_dupla escreve (ver migração 016), porque é ela que exige que
-- os dois tenham check-in no dia.
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

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null check (char_length(texto) <= 300),
  criado_em timestamptz not null default now()
);
create index if not exists comments_checkin_idx on public.comments (checkin_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  motivo text,
  criado_em timestamptz not null default now(),
  resolvido boolean not null default false
);

-- Agenda: eventos de data única (Forró na Rep) ou semanais (aula da turma).
-- turma = null → aparece para todo mundo.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  turma text,
  dia_semana int check (dia_semana between 0 and 6),
  data date,
  hora time,
  criado_em timestamptz not null default now(),
  check (dia_semana is not null or data is not null)
);

-- Feriados/cancelamentos: suspendem a(s) aula(s) recorrente(s) numa
-- data específica (ex.: feriado nacional, professor ausente).
-- turma = null → cancela a aula de TODAS as turmas nesse dia;
-- com turma definida, cancela só a aula daquela turma.
-- suspende_desafios = true → não teve forró: os desafios também não
-- contam ponto nessa data. É escolha do cancelamento, porque nem todo
-- feriado fecha o espaço (pode ser justo a noite do Forró na Rep).
create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  motivo text,
  turma text,
  suspende_desafios boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O oposto do feriado: o espaço abriu mais cedo que o normal naquele
-- dia (ex.: uma aula anterior foi cancelada e o salão liberou antes da
-- hora). Adianta o início da janela dos desafios nesse dia — nunca
-- atrasa, nunca cria janela onde não havia uma. Sem turma: o desafio
-- não pertence a turma nenhuma, então a abertura também não.
create table if not exists public.aberturas_antecipadas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora_abertura time not null,
  motivo text,
  criado_em timestamptz not null default now()
);

-- Histórico de "Encerrar semestre" — é daqui que a retrospectiva sabe
-- quando o semestre atual começou, em vez de chutar pelo calendário.
create table if not exists public.semestres (
  id uuid primary key default gen_random_uuid(),
  encerrado_em timestamptz not null default now(),
  encerrado_por uuid references public.profiles(id) on delete set null
);

-- "Eu vou hoje": confirmação de presença numa OCORRÊNCIA da agenda.
-- A aula de segunda é um evento recorrente só, então a chave inclui a
-- data — confirmar esta segunda não confirma a próxima. Ver migração 015.
create table if not exists public.confirmacoes_presenca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  evento_id uuid not null references public.events(id) on delete cascade,
  data date not null,
  criado_em timestamptz not null default now(),
  unique (user_id, evento_id, data)
);
create index if not exists confirmacoes_data_idx
  on public.confirmacoes_presenca (data);

-- Lista de chamada: telefone → turma. É ela que LIBERA o cadastro:
-- o aluno só cria conta se o telefone estiver aqui, e já entra com
-- nome e turma preenchidos.
-- Uma linha por (aluno, turma): o mesmo telefone se repete quando o
-- aluno faz mais de uma turma.
create table if not exists public.alunos_cadastrados (
  id uuid primary key default gen_random_uuid(),
  nome text,
  telefone text not null,
  turma text not null,
  papel_danca text check (papel_danca in ('Condutor(a)', 'Conduzido(a)')),
  criado_em timestamptz not null default now()
);

-- Turmas do semestre, definidas pela organização
-- (ex.: Iniciante 01, Iniciante 02, Inter, AV)
create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);
insert into public.turmas (nome) values
  ('Iniciante 01'), ('Intermediário'), ('Avançado')
on conflict (nome) do nothing;

-- Cargos do projeto (Presidência, Diretorias, Professor(a)…), editáveis
-- pela organização. `ordem` controla a exibição (hierarquia).
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null default 99,
  criado_em timestamptz not null default now()
);
insert into public.cargos (nome, ordem) values
  ('Presidência', 1),
  ('Vice-Presidência', 2),
  ('Diretor(a) de Ensino', 3),
  ('Diretor(a) de RH', 4),
  ('Diretor(a) de Comunicação', 5),
  ('Diretor(a) de Recursos', 6),
  ('Professor(a)', 7),
  ('Monitor(a)', 8),
  ('Membro de RH', 9),
  ('Membro de Comunicação', 10),
  ('Membro de Recursos', 11)
on conflict (nome) do nothing;

-- Cargos de cada pessoa (uma pessoa pode acumular mais de um)
create table if not exists public.profile_cargos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cargo text not null,
  primary key (user_id, cargo)
);

-- Catálogo de distintivos personalizados: a organização cria (emoji +
-- título + descrição) e concede manualmente a quem quiser — não só a
-- quem venceu um desafio. Dá pra entregar a um aluno específico ou ao
-- topo do ranking de um desafio (top 1, top 3, top 5…), calculado no
-- app a partir de getRanking() e concedido em lote.
create table if not exists public.distintivos (
  id uuid primary key default gen_random_uuid(),
  emoji text not null,
  titulo text not null,
  descricao text not null default '',
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Quem recebeu cada distintivo (uma pessoa não recebe o mesmo duas vezes)
create table if not exists public.distintivos_concedidos (
  distintivo_id uuid not null references public.distintivos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  concedido_em timestamptz not null default now(),
  primary key (distintivo_id, user_id)
);

-- Assinaturas de push (Fase 4)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  criado_em timestamptz not null default now()
);

-- ---------- Funções e triggers ----------

-- Papel de organizador (usada nas policies)
create or replace function public.is_organizador()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from roles
    where user_id = auth.uid() and papel = 'organizador'
  );
$$;

-- Normaliza telefone: só dígitos, últimos 10 (cobre +55, DDD, traços…).
-- Serve para CALCULAR valores (e-mail sintético, chave de senha do
-- demo) — não para decidir se dois números são o mesmo telefone, que é
-- o que `telefones_batem` faz. Mesma regra do lib/phone.ts no app.
create or replace function public.normalizar_telefone(t text)
returns text
language sql immutable
as $$
  select case
    when t is null then ''
    when length(regexp_replace(t, '\D', '', 'g')) > 10
      then right(regexp_replace(t, '\D', '', 'g'), 10)
    else regexp_replace(t, '\D', '', 'g')
  end;
$$;

-- DDD (2 dígitos) do telefone, ou null se o número não tem DDD (formato
-- antigo, hoje não mais aceito no cadastro — ver telefoneValido).
create or replace function public.telefone_ddd(t text)
returns text
language sql immutable
as $$
  select case length(regexp_replace(coalesce(t, ''), '\D', '', 'g'))
    when 11 then left(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 2)
    when 10 then left(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 2)
    else null
  end;
$$;

-- Os 8 dígitos da linha, sem DDD e sem o 9º dígito do celular.
create or replace function public.telefone_linha(t text)
returns text
language sql immutable
as $$
  select case length(regexp_replace(coalesce(t, ''), '\D', '', 'g'))
    when 11 then substring(regexp_replace(coalesce(t, ''), '\D', '', 'g') from 4 for 8)
    when 10 then right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
    when 9 then right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
    when 8 then regexp_replace(coalesce(t, ''), '\D', '', 'g')
    else ''
  end;
$$;

-- Dois números são o mesmo telefone? A linha (8 dígitos, sem o 9º
-- dígito do celular) tem que bater sempre. O DDD também tem que bater
-- QUANDO os dois números o informam — o projeto recebe gente de fora de
-- Itajubá, então dois alunos com a mesma linha em cidades diferentes
-- não podem ser tratados como a mesma pessoa. Número antigo sem DDD
-- (antes de ele virar obrigatório) casa só pela linha. Ver migração 022
-- para o histórico completo.
create or replace function public.telefones_batem(a text, b text)
returns boolean
language sql immutable
as $$
  select
    public.telefone_linha(a) <> ''
    and public.telefone_linha(a) = public.telefone_linha(b)
    and (
      public.telefone_ddd(a) is null
      or public.telefone_ddd(b) is null
      or public.telefone_ddd(a) = public.telefone_ddd(b)
    );
$$;

-- A que noite de forró um instante pertence: das 05:00 às 04:59 do dia
-- seguinte, no fuso local. Converter ANTES de tirar a data é o que
-- impede o check-in das 21h locais virar "amanhã" em UTC; descontar as
-- 5h é o que mantém a madrugada na noite que começou ontem (mig. 018).
create or replace function public.noite_do_checkin(quando timestamptz)
returns date
language sql immutable
as $$
  select ((quando at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
$$;

-- Marca que dancei com alguém numa noite. Exige que OS DOIS tenham
-- check-in nela, e confirma a dupla sozinha quando o outro lado já
-- tinha marcado. Security definer porque duplas não tem policy de
-- insert — é isso que impede forjar a marcação sem co-presença.
create or replace function public.marcar_dupla(p_parceiro uuid, p_data date)
returns void
language plpgsql security definer
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
  if not exists (select 1 from checkins
                 where user_id = v_uid
                   and noite_do_checkin(criado_em) = p_data) then
    raise exception 'Você não fez check-in nessa noite';
  end if;
  if not exists (select 1 from checkins
                 where user_id = p_parceiro
                   and noite_do_checkin(criado_em) = p_data) then
    raise exception 'Essa pessoa não fez check-in nessa noite';
  end if;

  insert into public.duplas (data, de_user, para_user)
  values (p_data, v_uid, p_parceiro)
  on conflict (data, de_user, para_user) do nothing;

  if exists (select 1 from public.duplas
             where data = p_data and de_user = p_parceiro and para_user = v_uid) then
    update public.duplas set confirmada = true
    where data = p_data
      and ((de_user = v_uid and para_user = p_parceiro)
        or (de_user = p_parceiro and para_user = v_uid));
  end if;
end;
$$;
revoke all on function public.marcar_dupla(uuid, date) from public, anon;
grant execute on function public.marcar_dupla(uuid, date) to authenticated;

-- Consulta pré-cadastro (chamada ANTES do login, pelo papel anon):
-- o telefone está na lista de chamada? Já tem conta no app?
create or replace function public.telefone_na_lista(tel text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a record;
  tem_na_lista boolean;
  conta boolean;
begin
  if public.telefone_ddd(tel) is null then
    return jsonb_build_object('existe', false, 'nome', null, 'ja_tem_conta', false);
  end if;
  select nome into a from alunos_cadastrados
  where public.telefones_batem(telefone, tel)
  limit 1;
  tem_na_lista := found;
  select exists (
    select 1 from profiles
    where telefone is not null
      and public.telefones_batem(telefone, tel)
  ) into conta;
  return jsonb_build_object(
    'existe', tem_na_lista,
    'nome', a.nome,
    'ja_tem_conta', conta
  );
end;
$$;
grant execute on function public.telefone_na_lista(text) to anon, authenticated;

-- Cria perfil + papel no cadastro; nome e turma vêm da lista de chamada
-- (o e-mail é sintético, derivado do telefone — ver lib/phone.ts)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  tel text;
  nome_lista text;
begin
  tel := new.raw_user_meta_data ->> 'telefone';
  select nome into nome_lista from alunos_cadastrados
  where public.telefone_ddd(tel) is not null
    and public.telefones_batem(telefone, tel)
  limit 1;

  insert into profiles (id, nome, avatar_url, telefone)
  values (
    new.id,
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
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
  where public.telefone_ddd(tel) is not null
    and public.telefones_batem(a.telefone, tel)
  on conflict (user_id, turma) do nothing;

  insert into roles (user_id, papel) values (new.id, 'aluno')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Aluno não muda o próprio telefone (é o login). As turmas ficam em
-- profile_turmas, protegidas pela RLS daquela tabela.
create or replace function public.protege_telefone()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.telefone is distinct from old.telefone
     and not public.is_organizador() then
    raise exception 'Somente a organização pode alterar o telefone';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protege_turma on public.profiles;
drop trigger if exists profiles_protege_telefone on public.profiles;
create trigger profiles_protege_telefone
  before update on public.profiles
  for each row execute function public.protege_telefone();

-- Favoritar é a ÚNICA alteração permitida num check-in — por isso uma
-- função em vez de policy de update (que deixaria o dono trocar foto e
-- legenda depois de publicadas). O teto de 12 existe porque favorito
-- significa foto guardada pra sempre (ver LIMITE_FAVORITOS no app).
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

-- Keep-alive: chamada semanal via GitHub Actions evita a pausa por inatividade
create or replace function public.ping()
returns timestamptz
language sql security definer
as $$ select now(); $$;
grant execute on function public.ping() to anon;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.profile_turmas enable row level security;
alter table public.turma_professores enable row level security;
alter table public.roles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_janelas enable row level security;
alter table public.challenge_members enable row level security;
alter table public.checkins enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.events enable row level security;
alter table public.feriados enable row level security;
alter table public.aberturas_antecipadas enable row level security;
alter table public.confirmacoes_presenca enable row level security;
alter table public.duplas enable row level security;
alter table public.semestres enable row level security;
alter table public.alunos_cadastrados enable row level security;
alter table public.turmas enable row level security;
alter table public.cargos enable row level security;
alter table public.profile_cargos enable row level security;
alter table public.distintivos enable row level security;
alter table public.distintivos_concedidos enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: todos os logados leem; dono ou organizador editam
-- (o trigger protege_telefone impede o dono de trocar o próprio login)
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_organizador())
  with check (id = auth.uid() or public.is_organizador());

-- profile_turmas: todos leem (o feed mostra a turma); só organizador
-- escreve — é isso que impede o aluno de se colocar no Avançado
create policy "profile_turmas_select" on public.profile_turmas
  for select to authenticated using (true);
create policy "profile_turmas_write" on public.profile_turmas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- turma_professores: mesma regra — todos leem (não há nada sensível: o
-- feed já é visível para qualquer pessoa logada), só organizador
-- escreve, o que impede alguém de se declarar professor do Avançado
create policy "turma_professores_select" on public.turma_professores
  for select to authenticated using (true);
create policy "turma_professores_write" on public.turma_professores
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- roles: todos leem (para saber quem organiza); só organizador altera
create policy "roles_select" on public.roles
  for select to authenticated using (true);
create policy "roles_write" on public.roles
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- challenges: todos leem; organizador gerencia
create policy "challenges_select" on public.challenges
  for select to authenticated using (true);
create policy "challenges_write" on public.challenges
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- challenge_janelas: todos leem; organizador gerencia
create policy "challenge_janelas_select" on public.challenge_janelas
  for select to authenticated using (true);
create policy "challenge_janelas_write" on public.challenge_janelas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- challenge_members: todos leem; cada um entra/sai por si
create policy "members_select" on public.challenge_members
  for select to authenticated using (true);
create policy "members_insert" on public.challenge_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "members_delete" on public.challenge_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_organizador());

-- checkins: todos leem; cada um posta o próprio; dono ou organizador exclui
create policy "checkins_select" on public.checkins
  for select to authenticated using (true);
create policy "checkins_insert" on public.checkins
  for insert to authenticated with check (user_id = auth.uid());
create policy "checkins_delete" on public.checkins
  for delete to authenticated
  using (user_id = auth.uid() or public.is_organizador());

-- reactions: todos leem; cada um gerencia a própria
create policy "reactions_select" on public.reactions
  for select to authenticated using (true);
create policy "reactions_insert" on public.reactions
  for insert to authenticated with check (user_id = auth.uid());
create policy "reactions_update" on public.reactions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reactions_delete" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- comments: todos leem; autor comenta; autor ou organizador exclui
create policy "comments_select" on public.comments
  for select to authenticated using (true);
create policy "comments_insert" on public.comments
  for insert to authenticated with check (user_id = auth.uid());
create policy "comments_delete" on public.comments
  for delete to authenticated
  using (user_id = auth.uid() or public.is_organizador());

-- reports: qualquer aluno denuncia; só organizador vê e resolve
create policy "reports_insert" on public.reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "reports_select" on public.reports
  for select to authenticated using (public.is_organizador());
create policy "reports_update" on public.reports
  for update to authenticated
  using (public.is_organizador()) with check (public.is_organizador());

-- events (agenda): todos leem; organizador gerencia
create policy "events_select" on public.events
  for select to authenticated using (true);
create policy "events_write" on public.events
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- feriados (cancelamentos): todos leem; organizador gerencia
create policy "feriados_select" on public.feriados
  for select to authenticated using (true);
create policy "feriados_write" on public.feriados
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- aberturas antecipadas: mesma regra dos feriados
create policy "aberturas_antecipadas_select" on public.aberturas_antecipadas
  for select to authenticated using (true);
create policy "aberturas_antecipadas_write" on public.aberturas_antecipadas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- semestres: todos leem; só organizador registra um encerramento
create policy "semestres_select" on public.semestres
  for select to authenticated using (true);
create policy "semestres_insert" on public.semestres
  for insert to authenticated with check (public.is_organizador());

-- duplas: todos leem; ninguém insere direto (só marcar_dupla, que
-- exige co-presença); apaga quem marcou ou quem foi marcado
create policy "duplas_select" on public.duplas
  for select to authenticated using (true);
create policy "duplas_delete" on public.duplas
  for delete to authenticated
  using (de_user = auth.uid() or para_user = auth.uid());

-- confirmações "eu vou": todos leem (a graça é ver quem vai);
-- cada um escreve só a própria
create policy "confirmacoes_select" on public.confirmacoes_presenca
  for select to authenticated using (true);
create policy "confirmacoes_insert" on public.confirmacoes_presenca
  for insert to authenticated with check (user_id = auth.uid());
create policy "confirmacoes_delete" on public.confirmacoes_presenca
  for delete to authenticated using (user_id = auth.uid());

-- alunos_cadastrados (lista de chamada): só organizador
-- (o cadastro por telefone usa funções security definer)
create policy "alunos_all" on public.alunos_cadastrados
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- turmas do semestre: todos leem; organizador gerencia
create policy "turmas_select" on public.turmas
  for select to authenticated using (true);
create policy "turmas_write" on public.turmas
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- cargos: todos leem (aparecem nos perfis); organizador gerencia
create policy "cargos_select" on public.cargos
  for select to authenticated using (true);
create policy "cargos_write" on public.cargos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- profile_cargos: todos leem; só organizador atribui — é o que
-- impede alguém de se autodeclarar Presidência
create policy "profile_cargos_select" on public.profile_cargos
  for select to authenticated using (true);
create policy "profile_cargos_write" on public.profile_cargos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- distintivos: todos leem (aparecem no perfil de quem recebeu);
-- só organizador cria/edita/remove do catálogo
create policy "distintivos_select" on public.distintivos
  for select to authenticated using (true);
create policy "distintivos_write" on public.distintivos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- distintivos_concedidos: todos leem; só organizador concede/revoga —
-- é o que impede alguém de se autoconceder um distintivo
create policy "distintivos_concedidos_select" on public.distintivos_concedidos
  for select to authenticated using (true);
create policy "distintivos_concedidos_write" on public.distintivos_concedidos
  for all to authenticated
  using (public.is_organizador())
  with check (public.is_organizador());

-- push_subscriptions: cada um gerencia as próprias
create policy "push_select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_update" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Storage (bucket de fotos) ----------

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "fotos_leitura_publica" on storage.objects
  for select using (bucket_id = 'fotos');
create policy "fotos_upload_proprio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "fotos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_organizador()
    )
  );

-- ---------- Realtime (feed ao vivo) ----------

alter publication supabase_realtime add table public.checkins;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.reactions;

-- ============================================================
-- PASSOS PÓS-INSTALAÇÃO
--
-- 1. IMPORTANTE: desative a confirmação de e-mail (o login usa
--    telefone + senha com e-mail sintético que não recebe mensagens):
--    Authentication > Providers > Email > desligue "Confirm email".
--
-- 2. Adicione SEU telefone à lista de chamada para poder se cadastrar:
--
--   insert into public.alunos_cadastrados (nome, telefone, turma)
--   values ('Seu Nome', '11 91234-5678', 'Avançado');
--
-- 3. Crie sua conta no app (aba "Primeira vez") e torne-se organizador(a).
--    O e-mail da conta é sintético: a<10 últimos dígitos do telefone>@...
--
--   update public.roles set papel = 'organizador'
--   where user_id = (
--     select id from auth.users where email like 'a1191234567%'
--   );
--
-- 4. Importe a lista de chamada completa pelo painel do app (CSV) ou:
--    Um aluno em duas turmas = duas linhas com o mesmo telefone.
--
--   insert into public.alunos_cadastrados (nome, telefone, turma, papel_danca)
--   values
--     ('Fulana', '11 91234-5678', 'Iniciante 01', 'Conduzido(a)'),
--     ('Beltrano', '11 99876-5432', 'Avançado', 'Condutor(a)'),
--     ('Beltrano', '11 99876-5432', 'Intermediário', 'Conduzido(a)');
-- ============================================================
