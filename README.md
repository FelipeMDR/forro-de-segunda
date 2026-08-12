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
- **Distintivos 🎖️** — colecionáveis no perfil. Uns são derivados dos dados
  (cargo, função e turma, marcos de presença — 1, 10, 25, 50, 100 dias —,
  presença em eventos da agenda); outros são **personalizados**: a
  organização cria um distintivo (emoji + título + descrição) e entrega pra
  quem quiser, por qualquer motivo — inclusive em lote pro topo do ranking
  de um desafio (top 1, top 3, top 5…)
- **Trava de local 📍** — um desafio pode exigir presença física: só conta
  ponto quem tirou a foto dentro do raio (o salão da aula, a casa da festa).
  A coordenada do aluno **nunca é guardada** — é avaliada no servidor no
  momento do check-in e só o veredito fica salvo
- **Favoritos ⭐** — o aluno marca os próprios check-ins que quer guardar
  (até 12). Eles viram uma galeria no perfil e ficam **de fora da política
  de retenção**, que arquiva as demais fotos depois de 4 meses
- **Check-in só com foto na hora** — a câmera abre dentro do app (sem
  galeria, nada de foto antiga); a imagem é comprimida no celular
  no celular com **teto de 90 KB** (WebP ~1080px) antes de subir
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
| 1 GB de storage | Compressão no cliente com **teto de bytes** — 90 KB por foto, 20 KB por avatar ([`src/lib/image.ts`](src/lib/image.ts)), o que dá ~12 mil fotos. Avatar antigo e foto de check-in excluído são apagados do bucket na hora. Limpeza **automática** toda semana (Edge Function `limpar-fotos` + pg_cron): arquiva fotos de +4 meses (mantém a presença, pula os favoritos) e recolhe órfãos. A 60 check-ins/dia isso segura o acervo em ~550 MB. Conferir: [`supabase/retencao.sql`](supabase/retencao.sql) |
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

- **Duplas contam por NOITE de forró, não por dia do calendário.**
  Uma noite vai das 05:00 às 04:59 do dia seguinte e pertence ao dia em
  que começou (`diaDaNoite`/`limitesDaNoite`, `HORA_VIRADA_NOITE`) — em
  espaço livre a galera fica de madrugada, e quem chegou às 23h e quem
  chegou à 1h estavam juntos. Com o corte na meia-noite eles caíam em
  datas diferentes e não podiam se marcar. No banco, `noite_do_checkin`
  faz o mesmo (migração 018), e converte para o fuso local ANTES de
  tirar a data: `criado_em::date` usava UTC, então em Itajubá qualquer
  check-in a partir das 21h locais já virava "amanhã" e a marcação
  falhava para quase toda a aula. Só as duplas usam essa regra — aula e
  agenda continuam em dia de calendário, e desafios já tinham a própria
  noção de janela que cruza a meia-noite.
- **Marcar dupla exige co-presença minha, não só da outra pessoa.**
  `parceirosPossiveis(data)` lista quem posso marcar num dia — e devolve
  lista vazia se EU não tiver check-in nesse dia, mesmo que a outra
  pessoa tenha. `marcarDupla`/`marcar_dupla` (SQL) já recusavam a
  gravação nesse caso, mas o botão continuava aparecendo em três lugares
  (grade pós-check-in, perfil, feed) — convidando para uma ação que
  ia falhar ao confirmar em vez de nunca ser oferecida. Um bug de UX, não
  de integridade: nenhuma dupla inválida chegava a ser gravada.
- **Check-in sem `challenge_id`:** um check-in vale automaticamente para
  *todos* os desafios em que o aluno está inscrito cuja janela (período +
  dia da semana + horário) bate com o momento da foto. Uma foto por aula,
  sem burocracia.
- **Janela por dia da semana:** cada desafio tem uma `challenge_janelas` —
  no máximo uma janela por dia (`dia_semana`, `hora_inicio`, `hora_fim`).
  O projeto funciona a semana toda, com espaços diferentes tendo horários
  de início diferentes, então segunda pode abrir às 18h e quarta às 20h
  dentro do mesmo desafio.
- **Login por e-mail; telefone só libera o cadastro.** O login era
  telefone + senha sobre um e-mail sintético
  (`a<10 dígitos>@alunos.forrodesegunda.app`) que não recebe mensagem —
  então o "esqueci minha senha" do Supabase, que envia para o e-mail *da
  conta*, não tinha para onde ir. Agora quem se cadastra informa um
  e-mail real, que vira o e-mail da conta e portanto o identificador do
  login. O telefone continua sendo a chave da lista de chamada (é ele
  que libera o cadastro e traz nome e turmas), só deixou de identificar
  o login.
  Contas anteriores seguem no e-mail sintético e por isso continuam
  entrando pelo número: aquele endereço é *calculado* a partir dele, sem
  consulta nenhuma. Essa é a razão de a rampa ser barata — e de não
  existir uma função `telefone → e-mail`, que teria de ser pública (quem
  vai entrar não tem sessão) e viraria um jeito de descobrir o e-mail de
  qualquer aluno pelo número.
- **Chamada libera o cadastro; matrícula move as turmas.** A
  `alunos_cadastrados` só é lida por `handle_new_user`, na criação da
  conta — daí a lista não controlar acesso e não fazer sentido guardar
  nela quem já entrou. A importação de CSV é a **matrícula do semestre**:
  para quem já tem conta ela troca `profile_turmas` direto (antes o CSV
  só escrevia na chamada, e re-importar um veterano não fazia nada); para
  quem não tem, troca a linha da chamada. As turmas do arquivo
  substituem as atuais pessoa a pessoa — quem não está no arquivo não é
  tocado, então dá para importar uma turma por vez.
- **Virar o semestre é explícito.** `encerrarSemestre()` esvazia
  `profile_turmas` de todo mundo; depois as planilhas repovoam. Sem esse
  passo, quem terminou o curso e não volta em planilha nenhuma ficaria
  na turma do semestre passado para sempre, já que a substituição é
  pessoa a pessoa. Ficar sem turma é um estado normal e suportado: o
  veterano continua com conta, pontos, check-ins e distintivos, só não
  pertence a uma turma.
- **Cancelar a aula fecha a janela:** um cancelamento marcado como
  `suspende_desafios` tira o dia da conta de *todos* os desafios — sem
  isso, bastava aparecer no local numa noite sem forró para marcar
  presença. Não é automático porque nem todo feriado fecha o espaço (pode
  ser justo a noite do Forró na Rep), e a decisão vive no cancelamento,
  não no desafio. Como a suspensão é checada sobre o dia em que a janela
  *abriu*, uma janela que vira a noite cai inteira.
- **Feed paginado, e o tempo real só recarrega o topo.** A página tem
  12 publicações (`PAGINA_FEED`), com cursor por `criado_em` — não por
  deslocamento, que repetiria ou pularia itens quando alguém postasse
  no meio. O gargalo não era o tamanho: era o realtime, que refazia a
  consulta inteira a cada curtida de qualquer pessoa, para todo mundo
  com o app aberto. Agora a atualização busca só a primeira página e
  funde com o que está na tela, o intervalo é de 3 s e nada é buscado
  com o app em segundo plano. As fotos já eram `loading="lazy"` e ficam
  em cache-first no service worker por 30 dias.
- **Rolagem infinita via `IntersectionObserver`, não botão.** Uma `<div>`
  vazia (`sentinela`) fica logo depois do último cartão só enquanto
  `temMais` é verdadeiro; quando ela entra na tela, `carregarMais()`
  busca a próxima página sozinho. `rootMargin: '600px'` busca ANTES de
  chegar no fim de verdade, para a página seguinte já estar pronta
  quando a rolagem chegar lá. O observer é recriado (`useEffect` com
  `[temMais, carregarMais]` nas dependências) sempre que `carregarMais`
  muda de identidade — ele é um `useCallback` que depende de `feed`,
  então cada nova página resulta num observer novo com o cursor certo.
- **Notificação de foto abre a publicação, não link aninhado.** Reação
  e comentário viram `<Link to="/publicacao/:id">` com miniatura — sem
  isso, "Fulana reagiu à sua foto" não dizia qual. A rota busca o
  check-in avulso (`getCheckin`, fora da paginação do feed) e reaproveita
  o `CheckinCard`. Como o corpo da notificação já usa um `<Link>` para
  a foto, o avatar por dentro NÃO é outro `<Link>` para o perfil — `<a>`
  dentro de `<a>` quebra o HTML; quem quiser o perfil clica no autor já
  dentro da publicação. "Dancei com" não referencia uma foto, então
  continua sem link, só a resposta de confirmar/recusar.
- **A galeria de favoritos abre na mesma tela.** `FavoritosGrid` também
  virou uma grade de `<Link to="/publicacao/:id">`, no lugar do
  visualizador escuro que reimplementava reações, comentários e "tirar
  dos favoritos" por conta própria (o `CheckinCard` já faz as três
  coisas — o botão de estrela só aparece quando `item.user_id` é quem
  está logado, então a leitura no perfil de outra pessoa continua sem
  ele). Como a página é remontada ao voltar para o perfil, o `onMudou`
  que recarregava a lista manualmente deixou de ter função — `favoritosDe`
  parou de buscar `reacoes`/`comentarios`, que também não tinham mais
  quem os lesse.
- **Entrar no desafio é escolha, e não zera o passado.** Competir é
  opcional, então quem entra no meio leva junto os check-ins que já fez
  no período — o ranking soma pelo período, nunca pela data de entrada.
  Isso já valia para desafio sem local; com trava de local não valia,
  porque o veredito só era gravado para quem já era membro e a
  coordenada não é guardada para reavaliar depois. Desde a migração 014
  o veredito é sobre o LUGAR, não sobre participação: vale para qualquer
  desafio ativo com local, e o ponto aparece sozinho quando a pessoa
  entra. Por isso a tela de check-in pede o GPS mesmo para desafios em
  que o aluno ainda não entrou.
- **Ponto = presença; ranking = competição.** Sem meta fixa: vence quem
  somar mais presenças no período. O horário do check-in usado na conta é o
  do servidor (`criado_em`), o aluno não consegue burlar pelo relógio.
- **Turmas (N:N):** ficam em `profile_turmas` (aluno ↔ turma + papel na
  dança), porque um aluno pode fazer várias turmas com papéis diferentes.
  Só a organização escreve nessa tabela (RLS) — é isso que impede alguém de
  se colocar no Avançado. Na lista de chamada, o mesmo telefone aparece uma
  vez por turma. O vínculo usa o telefone normalizado (últimos 10 dígitos),
  então `+55 (11) 91234-5678` e `11912345678` casam.
- **Distintivos são híbridos:** os automáticos (`src/lib/badges.ts`) são
  puramente derivados de turmas/check-ins/eventos, sem armazenar nada. Os
  **personalizados** são o oposto — um catálogo (`distintivos`) que a
  organização cria e concede manualmente (`distintivos_concedidos`), sem
  autoconcessão possível (RLS só deixa organizador escrever). Existiu um
  distintivo automático de "Campeão(ã) de desafio"; foi substituído pelo
  sistema personalizado, que dá mais controle (top 3, top 5, qualquer
  motivo) sem exigir 1º lugar exato.
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
