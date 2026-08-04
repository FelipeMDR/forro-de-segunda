# 🪗 Forró de Segunda — PWA

App de check-ins, desafios e ranking para as aulas de forró do **Espaço Livre**,
inspirado no GymRats. Projeto social, custo de infraestrutura **R$ 0**.
As aulas acontecem a semana toda — forró de segunda a segunda! 🎶

> Foi à aula → tira a foto na hora → interage com a turma → sobe no ranking. 💃🕺

## Funcionalidades (MVP)

- **Login só com telefone + senha** — o aluno se cadastra informando o
  celular; o cadastro **só é liberado se o telefone estiver na lista de
  chamada** importada pela organização, e nome + turma já vêm preenchidos
  (por baixo dos panos usa Supabase Auth com e-mail sintético derivado do
  telefone — nenhum e-mail é pedido ao aluno)
- **Lista de chamada por CSV** — a organização importa nome, telefone,
  turma e papel de uma vez pelo painel
  (colunas `nome;telefone;turma;papel`)
- **Turmas do semestre configuráveis** — o admin define as turmas de cada
  semestre (ex.: Iniciante 01, Iniciante 02, Inter, AV); elas alimentam
  todos os cadastros e a agenda
- **Várias turmas por aluno, com papel na dança** — o mesmo aluno pode ser
  *Condutor(a) Avançado* e *Conduzido(a) Intermediário* ao mesmo tempo; a
  agenda mostra as aulas de todas as turmas dele
- **Turmas controladas pela organização** — o aluno não escolhe nem muda as
  próprias turmas; a organização ajusta pelo painel
- **Cargos do projeto 👑** — Presidência, Diretorias, Professor(a),
  Monitor(a), Membros… aparecem em destaque no perfil como reconhecimento.
  A lista é editável no painel e só a organização atribui
- **Perfil público** — tocar em alguém no feed, nos comentários ou no
  ranking abre o perfil da pessoa (cargos, turmas, estatísticas e
  distintivos), sem expor o telefone
- **Distintivos 🎖️** — colecionáveis no perfil, todos derivados dos dados
  (nada é concedido à mão): cargos, função e turma, marcos de presença
  (1, 10, 25, 50, 100 dias), presença em eventos da agenda e campeão(ã) de
  desafios encerrados
- **Check-in só com foto na hora** — a câmera abre dentro do app (sem
  galeria, nada de foto antiga); a imagem é comprimida no celular
  (WebP ~120 KB) antes de subir
- **Feed da comunidade** — fotos, reações (❤️ 🔥 👏 💃) e comentários, em tempo real
- **Desafios = competição de presença** — cada check-in dentro da janela vale
  1 ponto e **quem somar mais pontos vence** (sem meta fixa); a organização
  define os dias e horários válidos **por desafio**, e cada dia da semana
  pode ter seu próprio horário (útil quando os espaços livres têm horários
  de início diferentes em dias diferentes)
- **Agenda** — a organização cadastra eventos (ex.: Forró na Rep) e as aulas
  semanais de cada turma; o aluno vê na tela inicial só o que é da turma dele
- **Feriados e cancelamentos** — a organização cancela a aula recorrente de
  uma data específica (feriado, professor ausente etc.) sem apagar o evento;
  o aluno vê "Cancelada" no lugar da aula, com o motivo e quando ela volta.
  Pode cancelar só uma turma ou todas de uma vez
- **Painel do organizador** — agenda, lista de chamada (telefone → turma),
  turmas dos alunos, frequência mensal com CSV, **resultado do desafio em
  CSV** e moderação de denúncias
- **PWA instalável** — ícone na tela inicial, funciona offline (app shell),
  notificações push (Fase 4)

## Rodando agora (modo demonstração)

Sem configurar nada, o app roda em **modo demo**: dados de exemplo no
localStorage, login fictício, tudo funciona (inclusive como organizador).
Dica: cadastre-se com o telefone `11 97777-1234` para ver o vínculo
automático de turma pela lista de chamada.

```bash
npm install
npm run dev        # http://localhost:5173
```

> A câmera exige HTTPS (ou localhost) e permissão do navegador.

## Colocando em produção (passo a passo)

### 1. Supabase (backend gratuito)

1. Crie um projeto em [supabase.com](https://supabase.com) (free tier).
2. Abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   e execute. Isso cria as tabelas, RLS, triggers (cadastro por telefone,
   turma automática), o bucket de fotos e o realtime.
3. **IMPORTANTE:** em **Authentication > Providers > Email**, desligue
   **"Confirm email"**. O login é telefone + senha e usa um e-mail sintético
   (`a<telefone>@alunos.forrodesegunda.app`) que não recebe mensagens — com a
   confirmação ligada, ninguém consegue entrar.
4. Copie a **URL** e a **anon key** (Project Settings > API) para o `.env`:

```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

5. Adicione seu próprio telefone à lista de chamada (SQL Editor):

```sql
insert into public.alunos_cadastrados (nome, telefone, turma, papel_danca)
values ('Seu Nome', '11 91234-5678', 'Avançado', 'Condutor(a)');
```

6. Crie sua conta no app (aba **Primeira vez**) e vire organizador(a) —
   o e-mail sintético começa com `a` + os 10 últimos dígitos do telefone:

```sql
update public.roles set papel = 'organizador'
where user_id = (
  select id from auth.users where email like 'a1191234567%'
);
```

7. Importe a lista de chamada completa pelo painel do app
   (**Painel > Turmas > Importar CSV**). Exemplo de arquivo — repita o
   telefone para colocar o aluno em mais de uma turma:

```csv
nome;telefone;turma;papel
Ana Xote;11 98888-0003;Avançado;Condutor
Ana Xote;11 98888-0003;Intermediário;Conduzido
Pedro Baião;11 98888-0004;Iniciante 02;Conduzido
```

> **Esqueci a senha:** sem e-mail real não há link de recuperação. Por
> enquanto, o organizador resolve pelo dashboard do Supabase
> (Authentication > Users > usuário > Reset password) ou apagando o usuário
> para o aluno se cadastrar de novo (isso apaga os check-ins dele). Uma tela
> de redefinição pelo painel está no roadmap.

### 2. Deploy na Vercel (grátis)

1. Suba o código para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Import Project** → selecione o repo
   (framework: Vite; o `vercel.json` já cuida das rotas do SPA).
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Cada push na branch principal publica automaticamente.

### 3. Keep-alive do Supabase

O free tier pausa o projeto após 7 dias sem atividade. O workflow
[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) faz um
ping semanal — basta criar os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY`
no repositório do GitHub (Settings > Secrets and variables > Actions).

### 4. Notificações push (Fase 4, opcional)

1. Gere as chaves VAPID: `npx web-push generate-vapid-keys`
2. Coloque a pública em `VITE_VAPID_PUBLIC_KEY` (no `.env` e na Vercel) —
   com ela definida, aparece o botão "Ativar lembretes" no perfil.
3. Publique a função [`supabase/functions/send-push`](supabase/functions/send-push/index.ts):

```bash
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
```

4. Agende o envio nos dias de aula (Dashboard > Integrations > Cron, ou um
   workflow do GitHub Actions chamando a URL da função).

> **iPhone:** push e câmera no iOS funcionam melhor com o PWA **instalado na
> tela inicial** (Compartilhar > Adicionar à Tela de Início). Mantenha o
> grupo do WhatsApp como canal paralelo de lembretes.

## Mantendo o custo em R$ 0 (limites do free tier)

| Limite | Estratégia já implementada |
|---|---|
| 1 GB de storage | Compressão no cliente (WebP ~1080px). ~8.000 fotos ≈ 2 anos. Depois, rode [`supabase/retencao.sql`](supabase/retencao.sql) (apaga fotos de +6 meses, mantém a presença) |
| 5 GB egress/mês | Fotos cacheadas no service worker (CacheFirst, 30 dias) |
| 500 MB de banco | Check-ins são linhas pequenas — irrelevante nessa escala |
| Pausa por inatividade | Workflow de keep-alive semanal |
| 50k usuários ativos | Folga enorme para 200–1.000 alunos |

## Estrutura

```
src/
  lib/            tipos, datas/streak/janelas, telefone, imagem, CSV
    badges.ts     distintivos (derivados dos dados)
    api.ts        interface única da camada de dados
    supabaseApi.ts  produção (auth, Postgres, storage, realtime)
    demoApi.ts    modo demonstração (localStorage, dados de exemplo)
  context/        AuthContext (sessão/perfil/papel), ToastContext
  components/     Layout, CameraCapture, CheckinCard, ChallengeForm…
  pages/          Login, Feed, Checkin, Desafios, Ranking, Perfil, Painel
  sw.ts           service worker (precache, cache de fotos, push)
supabase/
  schema.sql      esquema completo: tabelas + RLS + triggers + storage
  migracoes/      mudanças para bancos JÁ no ar (rodar em ordem)
  retencao.sql    limpeza de fotos antigas (rodar semestralmente)
  functions/send-push  edge function do lembrete
```

> **Banco já em produção?** Não rode o `schema.sql` de novo — ele recria
> políticas que já existem e dá erro. Use os arquivos de
> [`supabase/migracoes/`](supabase/migracoes) na ordem numérica.

### Decisões de modelagem

- **Check-in sem `challenge_id`:** um check-in vale automaticamente para
  *todos* os desafios em que o aluno está inscrito cuja janela (período +
  dia da semana + horário) bate com o momento da foto. Uma foto por aula,
  sem burocracia.
- **Janela por dia da semana:** cada desafio tem uma `challenge_janelas` —
  no máximo uma janela por dia (`dia_semana`, `hora_inicio`, `hora_fim`).
  O projeto funciona a semana toda, com espaços diferentes tendo horários
  de início diferentes, então segunda pode abrir às 18h e quarta às 20h
  dentro do mesmo desafio.
- **Ponto = presença; ranking = competição.** Sem meta fixa: vence quem
  somar mais presenças no período. O horário do check-in usado na conta é o
  do servidor (`criado_em`), o aluno não consegue burlar pelo relógio.
- **Turmas (N:N):** ficam em `profile_turmas` (aluno ↔ turma + papel na
  dança), porque um aluno pode fazer várias turmas com papéis diferentes.
  Só a organização escreve nessa tabela (RLS) — é isso que impede alguém de
  se colocar no Avançado. Na lista de chamada, o mesmo telefone aparece uma
  vez por turma. O vínculo usa o telefone normalizado (últimos 10 dígitos),
  então `+55 (11) 91234-5678` e `11912345678` casam.
- **Distintivos são derivados, não armazenados:** `src/lib/badges.ts`
  calcula tudo a partir de turmas, check-ins, eventos e rankings. Não há
  tabela de badges nem concessão manual — mudou o dado, mudou o distintivo.
- **Streak:** semanas-calendário consecutivas (seg–dom) com pelo menos um
  check-in; a semana atual em andamento não quebra a sequência.

## Scripts

| Comando | O quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção (gera o PWA em `dist/`) |
| `npm run preview` | serve o build localmente (para testar o service worker) |
| `npm run icons` | regenera os ícones do PWA a partir do logo |

## Roadmap (v2+)

Conquistas/medalhas, bônus por trazer amigo (validado pelo organizador),
importação da lista de chamada por CSV, galeria de vídeos de passos,
avisos do organizador, modo offline completo.
