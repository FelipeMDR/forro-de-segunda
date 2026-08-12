# E-mails do app — configuração completa

Tudo que o Supabase precisa ter ligado para o **"esqueci minha senha"** e a
**confirmação de e-mail** funcionarem de verdade, com os textos do Forró de
Segunda em vez dos padrões em inglês.

Faça na ordem. O passo 1 é o que destrava todo o resto: **sem SMTP próprio,
o Supabase entrega e-mail para pouquíssima gente e nada abaixo importa.**

---

## Por que o servidor embutido não serve

O Supabase vem com um servidor de e-mail de brinquedo. Ele tem dois limites
que quebram o projeto:

- **~2 mensagens por hora**, no total do projeto. Com 300 alunos, a segunda
  pessoa da fila já não recebe.
- **Só entrega para membros da organização no Supabase.** O e-mail de um
  aluno qualquer é descartado em silêncio — nem erro aparece.

É por isso que "esqueci minha senha" parecia funcionar (a tela dizia
"enviado") e o e-mail nunca chegava. Não era bug do app.

---

## 1. Gmail como servidor de envio

Use a conta de Gmail nova do projeto. Ela dá conta: o limite do Gmail é de
cerca de **500 mensagens por dia**, e aqui um aluno recebe e-mail umas duas
vezes na vida (ao criar a conta e se esquecer a senha).

### 1.1 Ligar a verificação em duas etapas

Sem ela o Google **não deixa criar senha de app** — a opção simplesmente não
aparece, e é aqui que quase todo mundo trava.

1. Entre em <https://myaccount.google.com/security> com a conta do projeto.
2. **Verificação em duas etapas** → ative (ele vai pedir um telefone).

### 1.2 Criar a senha de app

1. Vá em <https://myaccount.google.com/apppasswords>.
2. Nome do app: `Supabase Forro de Segunda`.
3. O Google mostra **16 letras em 4 blocos** (ex.: `abcd efgh ijkl mnop`).
   Copie. Ele só mostra uma vez.

> Essa senha entra no Supabase, não no seu login. **Não use a senha normal do
> Gmail** — o Google recusa, e a mensagem de erro não explica o motivo.

### 1.3 Preencher no Supabase

**Project Settings → Authentication → SMTP Settings → Enable Custom SMTP**

| Campo         | Valor                                            |
| ------------- | ------------------------------------------------ |
| Sender email  | o endereço completo do Gmail do projeto          |
| Sender name   | `Forró de Segunda`                               |
| Host          | `smtp.gmail.com`                                 |
| Port          | `465`                                            |
| Username      | o mesmo endereço completo do Gmail               |
| Password      | a senha de app, **as 16 letras sem os espaços**  |

Duas armadilhas:

- **Sender email tem que ser o próprio Gmail.** O Gmail reescreve o
  remetente para a conta autenticada. Se você puser
  `contato@forrodesegunda.com` ali, o aluno recebe do Gmail assim mesmo — e
  alguns clientes marcam como suspeito.
- **Porta 25 não funciona**, o Supabase bloqueia. Use 465 (ou 587).

### 1.4 Soltar o limite de envio

**Authentication → Rate Limits → "Rate limit for sending emails"**

Com SMTP próprio o padrão vira 30 por hora. Numa segunda-feira de início de
semestre, com meia turma criando conta ao mesmo tempo, isso trava. Suba para
**150 por hora** — continua bem abaixo do teto diário do Gmail.

---

## 2. Para onde o link volta

**Authentication → URL Configuration**

Sem isto o link do e-mail cai em `localhost:3000` no celular do aluno.

- **Site URL:** `https://<seu-app>.vercel.app`
- **Redirect URLs:** adicione as quatro linhas

```
https://<seu-app>.vercel.app/nova-senha
https://<seu-app>.vercel.app/confirmado
http://localhost:5173/nova-senha
http://localhost:5173/confirmado
```

As de `localhost` são para você testar na sua máquina; podem ficar.

`/nova-senha` é a tela de escolher senha nova. `/confirmado` é a tela nova,
que recebe tanto a confirmação do cadastro quanto a troca de e-mail no
perfil. Endereço fora dessa lista o Supabase ignora e joga na Site URL — o
aluno cai no feed sem entender.

---

## 3. Os dois interruptores do e-mail

**Authentication → Providers → Email**

### "Confirm email" → **LIGADO**

Passa a exigir o clique no link antes de a conta valer.

**Por que ligar:** o e-mail é o único caminho de volta para quem esquece a
senha. Se a pessoa digita errado no cadastro (`gmial.com`, um dígito trocado)
e ninguém confirma, ela só descobre no dia em que precisar — e aí já não tem
como se recuperar sozinha. Confirmar transforma um problema silencioso em um
"não chegou nada, deixa eu conferir o endereço".

**O que custa:** o cadastro deixa de ser instantâneo. Quem cria conta na hora
da aula precisa abrir o e-mail antes de entrar. O app já lida com isso: mostra
a tela "Confira seu e-mail 📬" com um botão de reenviar.

**Antes de ligar, confira se ninguém fica trancado do lado de fora.** Contas
criadas com a chave desligada já nascem confirmadas, mas vale conferir. No SQL
Editor:

```sql
select count(*) from auth.users where email_confirmed_at is null;
```

Se der `0`, pode ligar sem medo. Se der mais que zero, essas contas existem e
nunca clicaram em nada — confirme todas de uma vez antes de virar a chave,
senão elas param de entrar:

```sql
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
```

### "Secure email change" → **DESLIGADO**

Quando está ligado, trocar o e-mail exige confirmar **nos dois endereços**, o
novo e o antigo.

**Isso quebra exatamente quem mais precisa da funcionalidade.** As contas
antigas do projeto têm um endereço interno inventado
(`a11999998888@alunos.forrodesegunda.app`) que não existe em servidor nenhum.
Elas nunca receberiam a confirmação no endereço antigo, então a troca jamais
completaria — e é justamente essa turma que ainda não tem e-mail de verdade
cadastrado.

Desligar tem um custo pequeno e aceitável aqui: quem pegar o celular
destravado de outra pessoa consegue trocar o e-mail da conta sem confirmar no
antigo. Como o app não guarda dinheiro nem dado sensível, e o alvo é
justamente destravar as contas antigas, vale a troca. É provavelmente também
a causa do erro de "domínio inválido" que aparecia ao salvar o e-mail no
perfil.

---

## 4. Colar os textos

**Authentication → Emails** → escolha o template → aba **Source** (ou
`</>`) → apague tudo → cole o arquivo inteiro → **Save**.

| Template no painel     | Arquivo aqui              | Assunto sugerido                          |
| ---------------------- | ------------------------- | ----------------------------------------- |
| Confirm signup         | `confirmar-cadastro.html` | `Confirme seu e-mail — Forró de Segunda 🪗` |
| Reset password         | `recuperar-senha.html`    | `Criar uma senha nova — Forró de Segunda 🔑` |
| Change Email Address   | `trocar-email.html`       | `Confirme seu novo e-mail — Forró de Segunda 📬` |

Os outros templates (Magic Link, Invite user, Reauthentication) o app não
usa — pode deixar como estão.

O `{{ .ConfirmationURL }}` no meio do HTML é o Supabase que troca pelo link
de verdade na hora do envio. **Não mexa nessas chaves.** O resto do texto é
livre.

---

## 5. Testar antes de anunciar

Faça na ordem, com um e-mail seu de fora do projeto (não o Gmail do projeto —
enviar para si mesmo esconde problemas de spam):

1. **Recuperar senha.** Login → "Esqueci minha senha" → seu e-mail. Deve
   chegar em menos de um minuto, com o visual laranja. Clique, defina uma
   senha nova, entre com ela.
2. **Cadastro.** Ponha um telefone de teste na lista de chamada, crie uma
   conta com outro e-mail seu. Deve aparecer "Confira seu e-mail 📬", chegar
   a mensagem, e o clique levar ao "E-mail confirmado! 🎉".
3. **Link vencido.** Clique de novo no mesmo link do passo 2. Deve aparecer
   "Link vencido 😕" com a opção de mandar outro — não uma tela em branco.
4. **Troca de e-mail.** Perfil → mude o e-mail → deve aparecer o aviso
   "Falta confirmar", e o login só muda depois do clique.
5. **Caixa de spam.** Confira onde caiu. Se foi para o spam, veja abaixo.

---

## 6. Quando der errado

| Sintoma | Causa provável |
| --- | --- |
| "Error sending confirmation email" ao salvar o SMTP | Senha de app errada, ou copiada com os espaços. Gere outra. |
| O Google não mostra "Senhas de app" | Verificação em duas etapas desligada (passo 1.1). |
| O link cai em `localhost:3000` | Site URL não configurada (passo 2). |
| O link abre o app mas some a tela de senha | O endereço não está em Redirect URLs (passo 2). |
| "Email link is invalid or has expired" | Link já usado ou vencido — o app agora oferece mandar outro. Se acontecer sempre, veja se algum antivírus de e-mail está "pré-clicando" os links. |
| Aluno diz que não chegou | Peça para olhar o spam. Confira o endereço em Authentication → Users. |
| Aluno **errou o e-mail** no cadastro e ficou preso | Ele não consegue se cadastrar de novo (o telefone já tem conta) nem entrar (falta confirmar). **Só a organização resolve:** Authentication → Users → ache pelo telefone → corrija o e-mail → peça para ele tentar entrar. Se preferir recomeçar, apagar o usuário libera o telefone — mas apaga os check-ins dele. |
| Muita gente reclamando ao mesmo tempo | Limite por hora (passo 1.4). |
| Cai no spam com frequência | Gmail comum não tem domínio próprio autenticado. Ao ter o domínio do forró, migre o SMTP para um serviço com DKIM (Resend, Brevo) — aí a entrega melhora de vez. |

---

## O que ainda não dá para resolver sem domínio

O e-mail sai de um `@gmail.com`, então não dá para assinar as mensagens com o
domínio do projeto (SPF/DKIM/DMARC próprios). Na prática funciona bem para o
volume daqui, mas parte das mensagens pode cair em promoções ou spam,
principalmente em caixas corporativas.

Se um dia o projeto tiver domínio próprio, a mudança é só trocar os dados de
SMTP nesta mesma tela — os textos, as URLs e o código do app continuam iguais.
