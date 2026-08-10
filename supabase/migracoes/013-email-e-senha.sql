-- ============================================================
-- MIGRAÇÃO 013 — E-mail de verdade e "esqueci minha senha"
--
-- POR QUE MEXER NO E-MAIL DA CONTA
-- O login sempre foi telefone + senha, e por baixo o Supabase usava um
-- e-mail sintético (a<10 dígitos>@alunos.forrodesegunda.app) que não
-- recebe mensagem nenhuma. O "esqueci minha senha" do Supabase manda o
-- link para o e-mail DA CONTA — então, do jeito antigo, o link ia para
-- o vazio. Não era questão de configurar: não havia endereço.
--
-- Agora quem se cadastra informa um e-mail real, e é ele que vira o
-- e-mail da conta. Como isso é justamente o campo que o app usava para
-- entrar, o login passa a aceitar telefone OU e-mail — e é para o caso
-- do telefone que existe a função email_de_login abaixo.
--
-- Contas antigas continuam com o e-mail sintético e entrando pelo
-- telefone, sem nenhuma quebra. Elas ganham recuperação de senha
-- quando a pessoa cadastrar um e-mail no perfil.
--
-- Rode no SQL Editor. Pode rodar mais de uma vez.
-- ============================================================

-- Cópia do e-mail no perfil. auth.users não é legível pelo app, e o
-- painel precisa saber quem já tem e-mail para cobrar quem falta.
-- A fonte da verdade para LOGIN continua sendo auth.users.email.
alter table public.profiles
  add column if not exists email text;

-- ------------------------------------------------------------
-- Cadastro: guarda também o e-mail informado
-- ------------------------------------------------------------
-- Igual à da migração 011 (nome da chamada, convite de desafio, turma
-- opcional), somando só a coluna de e-mail.
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
    and nome is not null
  limit 1;

  select nome into nome_convite from challenge_convidados
  where telefone = tel_norm and length(tel_norm) >= 8
  limit 1;

  insert into profiles (id, nome, avatar_url, telefone, email)
  values (
    new.id,
    coalesce(
      nome_lista,
      new.raw_user_meta_data ->> 'nome',
      nome_convite,
      'Dançarino(a)'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(trim(coalesce(tel, '')), ''),
    -- Só o e-mail de verdade; o sintético não serve para nada aqui
    case when new.email like '%@alunos.forrodesegunda.app' then null
         else new.email end
  )
  on conflict (id) do nothing;

  -- `a.turma is not null`: veterano sem turma entra sem vínculo nenhum
  insert into profile_turmas (user_id, turma, papel_danca)
  select new.id, a.turma, a.papel_danca
  from alunos_cadastrados a
  where normalizar_telefone(a.telefone) = tel_norm
    and length(tel_norm) >= 8
    and a.turma is not null
  on conflict (user_id, turma) do nothing;

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

-- ------------------------------------------------------------
-- Login por telefone
-- ------------------------------------------------------------
/**
 * E-mail com que aquele telefone entra no Supabase.
 *
 * É chamada ANTES do login (papel anon), porque quem vai entrar ainda
 * não tem sessão: o app recebe o endereço e o entrega ao GoTrue junto
 * com a senha. Sem isto, quem cadastrou um e-mail real não conseguiria
 * mais entrar digitando o telefone.
 *
 * O QUE ISSO EXPÕE: quem souber o telefone de alguém descobre o e-mail
 * de login dessa pessoa. É um passo a mais do que a telefone_na_lista
 * já fazia (ela devolve o NOME de qualquer telefone da lista). Se um
 * dia isso incomodar, o caminho é o login passar a ser só por e-mail —
 * aí esta função deixa de existir.
 */
create or replace function public.email_de_login(tel text)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  uid uuid;
  mail text;
begin
  if length(normalizar_telefone(tel)) < 8 then
    return null;
  end if;
  select id into uid from profiles
  where telefone is not null
    and normalizar_telefone(telefone) = normalizar_telefone(tel)
  limit 1;
  if uid is null then
    return null;
  end if;
  select email into mail from auth.users where id = uid;
  return mail;
end;
$$;

revoke all on function public.email_de_login(text) from public;
grant execute on function public.email_de_login(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Mantém profiles.email em dia quando a pessoa troca o e-mail
-- ------------------------------------------------------------
-- O app troca o e-mail pelo GoTrue (updateUser), que escreve em
-- auth.users. Sem este gatilho, a cópia do perfil ficaria velha.
create or replace function public.sincroniza_email()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update profiles
    set email = case when new.email like '%@alunos.forrodesegunda.app'
                     then null else new.email end
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sincroniza_email();

-- ============================================================
-- Depois de rodar: Project Settings > API > "Reload schema cache".
--
-- FALTA CONFIGURAR NO PAINEL DO SUPABASE (sem isso o link não chega):
--
-- 1. Authentication > URL Configuration
--    Site URL: https://<seu-app>.vercel.app
--    Redirect URLs: adicione https://<seu-app>.vercel.app/nova-senha
--
-- 2. Authentication > Emails: confira o template "Reset Password".
--
-- 3. IMPORTANTE — Project Settings > Authentication > SMTP Settings:
--    o servidor de e-mail embutido do Supabase é só para testes e tem
--    um limite baixíssimo por hora. Com 300 alunos ele vai barrar os
--    envios. Configure um SMTP próprio (Resend, Brevo e similares têm
--    plano gratuito que dá conta) ANTES de anunciar a novidade.
--
-- 4. Authentication > Providers > Email: "Confirm email" segue
--    DESLIGADO. Com ele ligado, cadastrar e-mail real passaria a
--    exigir confirmação e travaria o cadastro dos alunos.
-- ============================================================
