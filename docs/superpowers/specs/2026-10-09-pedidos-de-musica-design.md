# Pedidos de música no Espaço Livre — design

**Data:** 2026-10-09
**Situação:** aprovado em conversa, aguardando revisão desta especificação
**Viabilidade:** confirmada por teste descartável com a conta Spotify Premium
do Felipe (login no modo de desenvolvimento, pedido toca depois da música
atual e a playlist segue, e a API informa o que está tocando e o que está
na fila).

---

## 1. O problema

O Espaço Livre acontece no fim de toda aula, de segunda a sábado. O
professor põe uma playlist padrão no Spotify do próprio celular e abre a
**Jam** para os alunos pedirem músicas. A Jam já impede pular e pausar,
mas **não impede uma pessoa de enfileirar várias músicas seguidas**:
quem pede muito monopoliza o som, e quem pede uma música às vezes nunca
é ouvido.

O Spotify não oferece API para a Jam, então não dá para corrigir a ordem
dela. A solução substitui a Jam por pedidos feitos **dentro do app**,
numa fila justa que o próprio app alimenta no Spotify do professor.

## 2. Objetivo e critério de sucesso

Numa noite de Espaço Livre, o professor liga o Modo DJ, dá play na
playlist dele e **não precisa mais mexer no Spotify**. Os alunos pedem
pelo app, e as músicas tocam em rodízio: ninguém toca duas antes de
quem está esperando tocar uma. Quando não há pedidos, a playlist segue
normalmente.

Bônus: um distintivo **"DJ do Espaço Livre"** para quem teve mais músicas
tocadas.

## 3. Decisões tomadas (e o porquê)

| Decisão | Escolha | Por quê |
|---|---|---|
| Quem é o DJ | O próprio professor, com o **Spotify Premium dele** | O projeto não quer pagar uma conta |
| Limite de DJs | **Até 5 contas** (limite do modo de desenvolvimento do Spotify) | Não existe API para gerenciar a lista, e automatizar o painel violaria os termos do Spotify. Com Espaço Livre de segunda a sábado, 5 pessoas cobrem a escala. Se não bastar, a funcionalidade será abandonada |
| Onde roda o loop | **No servidor** (pg_cron + Edge Function, a cada minuto) | No iPhone, um app em segundo plano para de rodar. O professor precisa poder bloquear o celular |
| Quando a fila existe | **Enquanto um professor está com o Modo DJ ligado** | Sem DJ não há quem toque os pedidos |
| Quem pede | **Quem fez check-in nesta noite**, sem presença anulada | Garante que quem pede está no salão |
| Ordem | **Rodízio por rodadas, desempate por quem chegou primeiro** | Escolha do Felipe (ver §5) |
| Limite de pedidos | **Nenhum** | Pode pedir quantas quiser; o rodízio impede de monopolizar |
| Métrica | **Só um distintivo que evolui**, sem ranking | Reaproveita o sistema de distintivos existente |

**Fora do escopo, de propósito:** pular música, votação para pular,
mexer na playlist, modo DJ manual (sem API) e conta Spotify do projeto.
O app só **acrescenta** pedidos à fila do Spotify; o controle do player
continua com o professor.

## 4. Dados — migração 029

### 4.1 `dj_conexoes` — a conexão Spotify de cada professor

| Coluna | Tipo | Nota |
|---|---|---|
| `user_id` | uuid PK → profiles | |
| `spotify_id` | text | id da conta Spotify |
| `spotify_nome` | text | nome de exibição, para a tela de Conta |
| `plano` | text | `premium`, `free`… (escopo `user-read-private`) |
| `access_token` | text | dura 1 hora |
| `refresh_token` | text | |
| `expira_em` | timestamptz | |
| `conectado_em` | timestamptz default now() | |

RLS ligado **sem nenhuma policy para `authenticated`**: só a service
role (as Edge Functions) lê e escreve. As chaves nunca chegam a nenhum
celular. A tela lê a situação pela função `minha_conexao_dj()` (security
definer), que devolve `{ conectado, spotify_nome, plano }` sem as chaves.
Desconectar é feito pela função `desconectar_spotify()`, que apaga a
linha do próprio usuário.

### 4.2 `dj_sessoes` — quem está de DJ

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `dj_user_id` | uuid → profiles | |
| `noite` | date | `noite_do_checkin(aberta_em)` (vira às 5h, fuso de São Paulo) |
| `aberta_em` | timestamptz default now() | |
| `fechada_em` | timestamptz null | null = aberta |
| `motivo_fechamento` | text null | `desligou`, `assumida`, `virada`, `conexao_perdida` |
| `aviso` | text null | `sem_aparelho`, `sem_premium`; null = tudo certo |
| `tocando_uri`, `tocando_titulo`, `tocando_artista`, `tocando_capa` | text null | gravados pelo loop |
| `tocando_pedido_id` | uuid null → pedidos_musica | quando o que toca é um pedido |
| `atualizado_em` | timestamptz null | última passada do loop |

Índice único parcial em `((true)) where fechada_em is null`: **no máximo
uma sessão aberta** no projeto. Leitura liberada para `authenticated`;
escrita só pelas funções abaixo e pelo loop.

### 4.3 `pedidos_musica`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `noite` | date | a noite do pedido; **a fila é da noite, não da sessão** |
| `user_id` | uuid → profiles | quem pediu |
| `track_uri` | text | `spotify:track:…` |
| `titulo`, `artista`, `capa_url` | text | copiados da busca, para a tela não depender do Spotify |
| `duracao_ms` | int | para a estimativa de espera |
| `pedido_em` | timestamptz default now() | |
| `status` | text | `esperando` → `enviado` → `tocou`, ou `cancelado` |
| `enviado_em`, `tocou_em` | timestamptz null | |
| `cancelado_por` | uuid null | |

- Índice único parcial `(noite, track_uri) where status <> 'cancelado'`:
  **a mesma música não pode ser pedida duas vezes na mesma noite**, por
  ninguém.
- Índice `(noite, status)`.
- Leitura liberada para `authenticated` (a fila é pública: é isso que
  deixa a justiça visível). Escrita só pelas funções.

### 4.4 Funções no banco

- **`fila_da_noite(p_noite date)`** devolve os pedidos `esperando` na
  ordem do rodízio, com `rodada` e `posicao`. É a **única** definição da
  ordem (ver §5).
- **`proximo_pedido(p_noite date)`** devolve a primeira linha de
  `fila_da_noite`.
- **`pedir_musica(uri, titulo, artista, capa, duracao)`** (security
  definer). O pedido entra na `noite` da **sessão aberta** — nunca numa
  noite calculada pelo relógio, para um pedido feito às 5h01 com a
  sessão ainda aberta não cair numa fila que ninguém vai tocar. Recusa
  com mensagem clara se:
  - não houver sessão aberta ("O Modo DJ não está ligado agora");
  - a pessoa não tiver check-in na noite da sessão
    (`noite_do_checkin(criado_em) = noite`), ou só tiver check-in com
    presença anulada ("Faça seu check-in para pedir música");
  - a música já tiver sido pedida na noite ("Essa música já foi pedida
    hoje").
- **`cancelar_pedido(id)`**: só pedidos `esperando`, e só pelo autor do
  pedido, pelo DJ da sessão aberta ou por organizador.
- **`ligar_modo_dj(p_assumir boolean)`**:
  - exige cargo `Professor(a)` ou `Diretor(a) de Ensino`, ou papel
    organizador, e uma linha em `dj_conexoes`;
  - se já houver sessão de outra pessoa e `p_assumir` for falso, devolve
    erro `ocupado` com o nome do DJ atual;
  - com `p_assumir`, fecha a outra sessão com `assumida` e abre a nova;
  - ligar de novo o próprio Modo DJ não faz nada.
- **`desligar_modo_dj()`**: fecha a sessão aberta do próprio usuário com
  `desligou`. Organizador pode desligar a de qualquer um.

## 5. A regra do rodízio

Para cada pedido `esperando` da pessoa *u* na noite:

- **`rodada`** = (quantos pedidos de *u* já estão `enviado` ou `tocou`
  nesta noite) + (posição deste pedido entre os `esperando` de *u*,
  ordenados por `pedido_em`, começando em 1);
- **`chegada`** = o `pedido_em` mais antigo de *u* nesta noite, contando
  todos os status exceto `cancelado`.

Ordem: **`rodada` crescente, depois `chegada` crescente, depois
`pedido_em` crescente**.

Exemplos que os testes precisam cobrir:

1. A pede 20 e toca A1. B chega e pede 1. A próxima de A é da rodada 2;
   B1 é da rodada 1. **Toca B1, depois A2.**
2. C chega quando A já tocou 15. C1 (rodada 1) passa na frente de A16
   (rodada 16).
3. A e B na mesma rodada: vai quem fez o primeiro pedido da noite antes.
4. Cancelar um pedido esperando reorganiza a posição dos outros pedidos
   daquela pessoa.
5. Uma pessoa que já tocou 1 e pede outra mais tarde entra na rodada 2,
   na frente de quem está na rodada 3 ou mais.

## 6. Conexão do professor (Edge Function `spotify-conectar`)

**Quem pode ser DJ** (função `podeSerDJ` em `lib/`): cargo
`Professor(a)` ou `Diretor(a) de Ensino`, ou papel `organizador`.

Fluxo:

1. Na tela **Conta**, quem pode ser DJ vê o botão "Conectar meu Spotify".
2. O app gera um `state` aleatório, guarda em `sessionStorage` e manda a
   pessoa para `https://accounts.spotify.com/authorize`, com:
   - `response_type=code`;
   - `redirect_uri` = `${origin}/spotify/conectado`;
   - escopos `user-read-playback-state user-modify-playback-state
     user-read-currently-playing user-read-private`.
3. A rota `/spotify/conectado` confere o `state` e manda o `code` para
   `spotify-conectar` (com o JWT do usuário).
4. A função:
   - confere se a pessoa pode ser DJ;
   - troca o código pelas chaves com o **Client Secret** (segredo da
     função, nunca no app);
   - chama `/me` para guardar o id, o nome e o plano;
   - grava em `dj_conexoes` (upsert).
5. Respostas que a tela trata:
   - `nao_liberado`: o Spotify devolveu 403 em `/me`, ou seja, a conta
     não está entre os 5 do painel. Mensagem: "Sua conta Spotify ainda
     não foi liberada. Peça à organização para incluir você.";
   - `sem_premium`: conecta mesmo assim, mas avisa "O Modo DJ precisa de
     Spotify Premium.";
   - `ok`.
6. "Desconectar" chama `desconectar_spotify()`.

Redirect URIs já cadastrados no painel:
`https://forro-de-segunda.vercel.app/spotify/conectado` e
`http://127.0.0.1:5173/spotify/conectado`. O segundo serve para testar
localmente: o Spotify não aceita `localhost`, e o servidor local
precisará escutar em `127.0.0.1`.

## 7. Tela Modo DJ (`/dj`)

Visível para quem tem conexão; o acesso fica na tela de Conta e, com a
sessão aberta, no cartão do feed.

- **Ligar Modo DJ** chama `ligar_modo_dj(false)`. Se a resposta for
  `ocupado`: "Fulano está de DJ agora. Assumir?" → `ligar_modo_dj(true)`.
  Depois de ligar, o app chama `dj-loop` uma vez, para o primeiro pedido
  não esperar o minuto virar.
- Com o Modo DJ ligado, a tela mostra:
  - **Tocando agora** (da sessão) e **Próxima** (`proximo_pedido`), com
    quem pediu;
  - a **fila completa** (`fila_da_noite`), com botão de cancelar em cada
    pedido;
  - os **avisos** da sessão: `sem_aparelho` → "Dê play na playlist no
    Spotify"; `sem_premium` → "Sua conta não é Premium";
  - **Desligar Modo DJ**.
- A tela se atualiza a cada 30 s **enquanto está aberta e visível**. O
  professor **não precisa** deixá-la aberta: quem envia as músicas é o
  servidor.

## 8. O loop (Edge Function `dj-loop` + pg_cron)

**Agendamento**, no mesmo padrão da limpeza de fotos (migração 006):

```sql
select cron.schedule('dj-loop', '* * * * *', $cron$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/dj-loop',
    headers := '{"Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb
  )
  where exists (select 1 from public.dj_sessoes where fechada_em is null);
$cron$);
```

Sem sessão aberta, o banco só avalia o `exists`: nenhuma chamada HTTP e
nenhum log de API.

**A cada passada** (há no máximo uma sessão aberta):

1. Se já passou das 5h do dia seguinte à `noite` da sessão, fecha a
   sessão com `virada` e para.
2. Carrega a conexão do DJ. Se a chave vence em menos de 1 minuto,
   renova com o `refresh_token` e grava a nova (e o novo
   `refresh_token`, se vier).
3. **Uma chamada:** `GET /me/player/queue`.
   - Se não houver `currently_playing`, grava o aviso `sem_aparelho` e
     para;
   - senão limpa o aviso e grava `tocando_*` e `atualizado_em`.
4. Se o que está tocando é um pedido `enviado` desta noite (mesma
   `track_uri`), marca esse pedido como `tocou` com `tocou_em` e grava
   `tocando_pedido_id`.
5. Procura o pedido `enviado` (ainda não `tocou`) desta noite:
   - se a `track_uri` dele **está em `queue`**, ele ainda vai tocar: **não
     manda nada** e para. É isso que mantém no máximo um pedido nosso
     dentro da fila do Spotify;
   - se ele não está nem tocando nem na fila, foi pulado ou removido no
     Spotify. Fica como `enviado` (não conta para o distintivo) e o loop
     segue.
6. Pega `proximo_pedido(noite)`. Se existir, `POST
   /me/player/queue?uri=…` e marca o pedido como `enviado` com
   `enviado_em`. A resposta do enfileirar **não é JSON**; no teste, a
   primeira versão tentou ler como JSON e quebrou.

Com uma passada por minuto e músicas de ~3 minutos, o próximo pedido
entra na fila do Spotify bem antes de a música atual acabar. Um pedido
pulado em menos de um minuto pode não ser visto tocando e não conta para
o distintivo: é o comportamento desejado ("de fato tocou").

**Quem pode chamar `dj-loop`:**
- o cron, com a service role;
- o app, com o JWT de quem acabou de ligar o Modo DJ. Neste caso a função
  só age se o chamador for o DJ da sessão aberta.

**Erros:**

| Situação | Reação |
|---|---|
| 401 do Spotify | Renova a chave e tenta de novo, uma vez |
| Renovação recusada (acesso revogado) | Fecha a sessão com `conexao_perdida` |
| 429 | Encerra esta passada; o próximo minuto tenta de novo |
| 403 no player (sem Premium) | Grava o aviso `sem_premium` |
| 404 / nenhum aparelho ativo | Grava o aviso `sem_aparelho` |
| Qualquer outro | Registra no log da função e segue no próximo minuto |

## 9. O que o aluno vê

**Cartão no feed**, quando há sessão aberta:
> 🎶 **Pedidos de música abertos** — DJ: Fulano · [Pedir música]

A sessão é consultada **uma vez na abertura do feed** e de novo quando
a pessoa volta para o app depois de mais de 2 minutos (mesmo gatilho que
já existe em `FeedPage`). **Não usa tempo real**: o corte da cota de logs
(migração 028) continua valendo.

**Tela `/musica`:**
- **Busca** pela Edge Function `spotify-buscar`, disparada ao tocar em
  Buscar ou dar Enter, nunca a cada tecla. A função usa a chave do
  próprio app (client credentials, guardada em memória enquanto vale),
  então **não depende das 5 contas** e o aluno não loga no Spotify.
  Devolve até 5 faixas (`market=BR`) com uri, título, artistas, capa e
  duração.
- Faixa já pedida na noite aparece como "Já pedida hoje", sem botão.
- **Tocando agora** (da sessão, nunca do Spotify direto) e **Próximas**
  (as 5 primeiras de `fila_da_noite`, com quem pediu).
- **Meus pedidos**: os `esperando`, cada um com a posição na fila geral
  ("toca daqui a ~N músicas") e botão Cancelar.
- Sem check-in na noite: a busca aparece, mas o botão vira "Faça seu
  check-in para pedir", com link para o check-in.
- Atualiza ao abrir e a cada 30 s **enquanto visível**; em segundo plano
  não busca nada.

## 10. Distintivo "DJ do Espaço Livre"

Em `lib/badges.ts`, no mesmo molde de `MARCOS_RODIZIO` e mostrando só o
maior nível alcançado:

| Músicas tocadas | Emoji | Nome |
|---|---|---|
| 1 | 🎵 | Primeira música tocada |
| 10 | 🎶 | 10 músicas tocadas |
| 25 | 🎧 | 25 músicas tocadas |
| 50 | 🔊 | 50 músicas tocadas |

(🪩 já é usado pelo distintivo de rodízio.)

Conta os pedidos com `status = 'tocou'`, por uma contagem
(`count: 'exact', head: true`), passada como `musicasTocadas` para
`computeBadges` nas telas de perfil que já chamam essa função.

## 11. Modo demonstração

`DemoApi` implementa os mesmos métodos:
- busca num catálogo fixo de ~20 músicas de forró;
- um Spotify de mentira que avança a música a cada ~20 s e aplica a
  mesma regra do loop (§8), para as telas poderem ser testadas sem
  Spotify.

Conectar o Spotify no demo só marca a conexão como feita; não há
redirecionamento.

## 12. Mudanças no código (visão geral)

- `supabase/migracoes/029-pedidos-de-musica.sql` (§4, §5) e a linha
  correspondente em `conferir-migracoes.sql`;
- `supabase/functions/spotify-conectar`, `spotify-buscar` e `dj-loop`;
- `src/lib/api.ts`: métodos novos no `ForroApi`:
  - conexão: `minhaConexaoDJ`, `conectarSpotify(code, redirectUri)`,
    `desconectarSpotify`;
  - sessão: `sessaoDJAberta`, `ligarModoDJ(assumir)`, `desligarModoDJ`,
    `cutucarLoopDJ`;
  - pedidos: `buscarMusicas(q)`, `pedirMusica(faixa)`,
    `cancelarPedido(id)`, `filaDaNoite()`, `meusPedidosDaNoite()`,
    `pedidosDaNoite()` (para o "já pedida hoje");
  - distintivo: `musicasTocadasDe(userId)`;
- implementações em `supabaseApi.ts` e `demoApi.ts`;
- `src/lib/dj.ts`: `podeSerDJ`, URL de autorização, `state`;
- telas: `DJPage` (`/dj`), `MusicaPage` (`/musica`), `SpotifyConectadoPage`
  (`/spotify/conectado`), cartão `PedidosAbertos` no feed e bloco Spotify
  em `ContaPage`;
- `lib/badges.ts`: `MARCOS_DJ`;
- `DESIGN.md`: conceitos novos (Modo DJ, Pedido de música, Rodízio da
  fila).

## 13. Testes

1. **Regra do rodízio e regras de pedido**, no Postgres local (PGlite),
   rodando a migração 029 de verdade: os 5 exemplos do §5, a recusa sem
   sessão, a recusa sem check-in e com presença anulada, a música
   repetida, os cancelamentos (autor, DJ e outro aluno, que deve ser
   recusado), `ligar_modo_dj` ocupado e assumindo.
2. **Lógica do loop** separada das chamadas HTTP (função pura que recebe
   o estado do player e os pedidos e devolve a ação), testada com os
   casos do §8: sem aparelho, pedido ainda na fila, pedido tocando,
   pedido pulado, sem pedidos, virada das 5h.
3. **Telas no demo**, no navegador: cartão do feed, busca, pedir,
   cancelar, a fila andando, Modo DJ ligar/assumir/desligar, distintivo.
4. **Ponta a ponta com o Spotify real**, com a conta do Felipe:
   - conectar e ligar o Modo DJ;
   - pedir de duas contas do app (A pede 3, depois B pede 1);
   - conferir que a ordem no Spotify é A1, B1, A2, A3 e que o distintivo
     aparece.

## 14. Implantação (passos do Felipe)

1. Rodar a migração 029 e conferir com `conferir-migracoes.sql`.
2. Cadastrar os segredos das funções: `SPOTIFY_CLIENT_ID` e
   `SPOTIFY_CLIENT_SECRET` (o Client Secret vai direto para o Supabase,
   nunca para o chat nem para o repositório).
3. Publicar as três Edge Functions.
4. Ligar o agendamento do §8.
5. Cadastrar no painel do Spotify (User Management) os professores que
   vão ser DJ, até 5.

Cada passo vai ficar escrito, com os comandos, no topo da migração 029.

## 15. Limitações conhecidas

- **Máximo de 5 DJs** cadastrados ao mesmo tempo, trocados à mão no
  painel do Spotify.
- **Cada DJ precisa de Premium.**
- **Música adicionada direto no Spotify** do professor fura o rodízio.
- **Spotify parado por muito tempo** deixa de ser aparelho ativo; o loop
  avisa e espera o professor dar play.
- **Atraso de até ~1 minuto** entre um pedido e a ida dele para a fila
  do Spotify; na prática ele toca no fim da música atual ou da seguinte.
- Uma sessão por vez: o projeto tem um Espaço Livre só.
