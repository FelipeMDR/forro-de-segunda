# 🚀 Colocar o app no ar (piloto com a equipe)

Guia do zero até o app rodando no celular da galera. **Tempo estimado:
30–40 min.** Custo: R$ 0.

Você vai precisar criar 3 contas (GitHub, Supabase, Vercel) — só você pode
fazer isso, por isso o passo a passo abaixo é bem mastigado.

---

## Passo 1 — Supabase (o banco de dados)

1. Entre em [supabase.com](https://supabase.com) → **Start your project** →
   entre com o GitHub ou e-mail.
2. **New project**:
   - *Name:* `forro-de-segunda`
   - *Database Password:* gere uma e **guarde** (não vai precisar no dia a
     dia, mas não dá para recuperar)
   - *Region:* **South America (São Paulo)**
   - **Create new project** e espere ~2 min.
3. Menu lateral → **SQL Editor** → **New query**. Abra o arquivo
   [`supabase/schema.sql`](supabase/schema.sql) deste projeto, copie **tudo**,
   cole e clique em **Run**. Deve aparecer *Success*.
4. ⚠️ **Passo que não pode ser pulado:** menu lateral → **Authentication** →
   **Sign In / Providers** → **Email** → **desligue "Confirm email"** →
   **Save**.
   *Por quê:* o login é por telefone + senha e usa um e-mail interno que não
   recebe mensagem. Com essa opção ligada, ninguém consegue entrar.
5. Menu lateral → **Project Settings** (engrenagem) → **API**. Deixe essa
   aba aberta, você vai copiar dois valores no Passo 3:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** key (um texto bem comprido)

---

## Passo 2 — GitHub (guardar o código)

1. Crie a conta em [github.com](https://github.com) (se ainda não tiver).
2. [github.com/new](https://github.com/new) → *Repository name:*
   `forro-de-segunda` → pode deixar **Public** → **Create repository**
   (não marque nenhuma opção de README/gitignore).
3. Na pasta do projeto, rode os comandos que o GitHub mostrar. Serão estes
   (troque `SEU-USUARIO`):

```bash
git remote add origin https://github.com/SEU-USUARIO/forro-de-segunda.git
git branch -M main
git push -u origin main
```

> O repositório local já está criado e com o primeiro commit feito. O
> arquivo `.env` está no `.gitignore`, então suas chaves **não** vão para o
> GitHub.

---

## Passo 3 — Vercel (publicar o site)

1. Entre em [vercel.com](https://vercel.com) → **Sign up** → **Continue with
   GitHub**.
2. **Add New… → Project** → selecione o repositório `forro-de-segunda` →
   **Import**.
3. Em **Environment Variables**, adicione as duas (copiadas do Passo 1.5):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | a *Project URL* |
   | `VITE_SUPABASE_ANON_KEY` | a *anon public* key |

4. **Deploy**. Em ~1 min você recebe o endereço, algo como
   `https://forro-de-segunda.vercel.app`. **Esse é o link do app.**

---

## Passo 4 — Você vira organizador(a)

1. No Supabase → **SQL Editor**, rode isto trocando pelo **seu** nome e
   telefone (o telefone precisa estar na lista para você conseguir criar
   conta):

```sql
insert into public.alunos_cadastrados (nome, telefone, turma, papel_danca)
values ('Seu Nome', '35 99999-9999', 'Avançado', 'Condutor(a)');
```

2. Abra o link do app no celular → aba **Primeira vez** → digite o telefone
   → crie sua senha. Sua conta está criada. 🎉
3. Volte ao **SQL Editor** e se promova a organizador(a):

```sql
update public.roles set papel = 'organizador'
where user_id = (
  select id from auth.users
  where email like 'a' || right(regexp_replace('35 99999-9999', '\D', '', 'g'), 10) || '%'
);
```

> Troque `35 99999-9999` pelo mesmo telefone que você usou. Recarregue o
> app: a aba **Painel 🛠️** vai aparecer no menu de baixo.

---

## Passo 5 — Preparar o piloto (agora tudo pelo app)

Entre no **Painel 🛠️** e faça, nesta ordem:

1. **Turmas do semestre** — cadastre as turmas atuais (ex.: `Iniciante 01`,
   `Iniciante 02`, `Intermediário`, `Avançado`).
2. **Lista de chamada** — clique em **⬆️ Importar CSV** e mande a lista dos
   participantes do piloto. Formato:

```csv
nome;telefone;turma;papel
Ana Silva;35 98888-1111;Avançado;Condutor
Ana Silva;35 98888-1111;Intermediário;Conduzido
Bruno Costa;35 98888-2222;Iniciante 01;Conduzido
```

   > Regras: uma linha por turma (repita o telefone se a pessoa faz mais de
   > uma), a coluna `papel` é opcional. **Quem não estiver nessa lista não
   > consegue criar conta** — é a trava de segurança do app.

3. **Agenda** — cadastre as aulas semanais de cada turma e os eventos do
   mês (ex.: *Forró na Rep*).
4. **Desafios** (aba 🏆 → **+ Novo**) — crie o desafio de estreia. Marque os
   **dias da semana** que têm aula e o **horário** em que o check-in vale
   ponto (ex.: seg a sex, das 18h às 23h).
   > 💡 Sem desafio ativo, os check-ins não pontuam e o app fica sem graça.

---

## Passo 6 — Chamar a galera

Mande no grupo algo assim:

> 🎶 *Tá no ar o app do Forró de Segunda!*
> 1. Abra: `https://forro-de-segunda.vercel.app`
> 2. Toque em **Primeira vez**, digite seu celular e crie uma senha
> 3. **Instale na tela inicial** (o app avisa como) — no iPhone é
>    Compartilhar → Adicionar à Tela de Início
> 4. Na aula, tire a foto pelo app e faça seu check-in 📸

---

## Perguntas que vão aparecer

**"Não consigo criar conta / diz que meu telefone não está na lista"**
O telefone não foi importado, ou foi com outro número. Confira no
**Painel → Lista de chamada**. Pode adicionar na hora pelo botão
**+ Adicionar**.

**"A câmera não abre"**
Precisa autorizar a câmera no navegador (aparece um aviso na primeira vez).
Se aparecer a mensagem de "conexão segura", é porque abriram por um link
errado — tem que ser o endereço `https://...vercel.app`.

**"Esqueci minha senha"**
Ainda não há recuperação automática (não pedimos e-mail). Você resolve em
Supabase → **Authentication → Users** → clique no usuário → **Reset
password**.

**"Posso mudar minha turma?"**
Não — turma e papel são definidos pela organização, no Painel.

---

## Depois do piloto: atualizar o app

Fez uma mudança no código? `git push` e pronto: a Vercel publica sozinha e
**os alunos recebem a atualização automaticamente** ao abrir o app. Ninguém
precisa desinstalar nem reinstalar nada.

Se a mudança mexer no banco, rode o SQL no Supabase **antes** do push.

## Dois cuidados de manutenção

- **Keep-alive:** o Supabase gratuito pausa o projeto após 7 dias sem
  acesso. Já existe um workflow pronto em
  [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) — no
  GitHub, vá em **Settings → Secrets and variables → Actions** e crie
  `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os mesmos valores do Passo 3.
- **Fotos:** cabem ~11.600 no 1 GB gratuito (teto de 90 KB por foto). A
  limpeza é **automática**: a Edge Function `limpar-fotos` roda toda semana
  pelo pg_cron, arquiva as fotos com mais de 4 meses **mantendo** as
  presenças e o ranking, poupa os favoritos e recolhe órfãos. Para ligar
  (uma vez só), siga os passos 2 e 3 de
  [`supabase/migracoes/006-limpeza-automatica.sql`](supabase/migracoes/006-limpeza-automatica.sql).
  Para conferir se está funcionando, use
  [`supabase/retencao.sql`](supabase/retencao.sql).
