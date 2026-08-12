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
-- e-mail da conta — que é também o identificador do login. Ou seja: a
-- partir daqui entra-se com E-MAIL + senha.
--
-- Contas antigas continuam com o e-mail sintético e por isso continuam
-- entrando pelo telefone, sem nenhuma quebra: aquele endereço é
-- calculado a partir do número, não consultado. Elas migram para o
-- e-mail quando a pessoa cadastrar um no perfil — e é só a partir daí
-- que ganham recuperação de senha.
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
-- Nada de traduzir telefone em e-mail
-- ------------------------------------------------------------
-- Uma versão desta migração criou email_de_login(tel), que devolvia o
-- e-mail de login de um telefone para o app poder entrar pelos dois.
-- Ela precisaria ser pública (quem vai entrar ainda não tem sessão), e
-- viraria uma forma de qualquer um transformar telefone em e-mail —
-- justo no app onde o telefone foi tirado dos perfis públicos.
--
-- O login passou a ser por e-mail, e a função deixou de existir. Contas
-- antigas continuam entrando pelo telefone porque o e-mail sintético é
-- CALCULADO a partir dele (a<dígitos>@alunos.forrodesegunda.app), sem
-- perguntar nada ao banco. Este drop é só para o caso de você ter
-- rodado a versão antiga.
drop function if exists public.email_de_login(text);

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
-- o passo a passo completo virou um arquivo próprio, porque não é
-- pouca coisa e nenhuma parte dele é SQL:
--
--     supabase/emails/README.md
--
-- Em resumo: SMTP do Gmail (o servidor embutido do Supabase entrega
-- para pouquíssima gente), Site URL e Redirect URLs, limite de envio
-- por hora, e os textos personalizados em Authentication > Emails.
--
-- NOTA — uma versão anterior deste arquivo mandava manter "Confirm
-- email" DESLIGADO, porque sem servidor de e-mail que entregasse a
-- confirmação o cadastro travaria de vez. Com o SMTP configurado isso
-- deixou de valer: agora a recomendação é LIGAR, e o app já mostra a
-- tela de "confira seu e-mail". Motivo e ressalvas no README acima.
-- ============================================================
