# Forró na Rep: planilha de ingressos ligada ao desafio — design

Data: 2026-11-12 · Status: rascunho para aprovação

## Por quê

Todo semestre tem o Forró na Rep. A área de vendas anota numa planilha do
Google (nome + celular) quem comprou ingresso e teve o pagamento confirmado
pelo financeiro. Essa planilha já é a "parte 2": só entra quem está com
tudo certo.

Hoje o app já tem o desafio de **entrada restrita** (migração 010), feito
para este evento, mas a lista entra por **importação manual de CSV** no
painel. Com a planilha recebendo gente várias vezes por dia, importar à mão
"daria muito problema" — e o pior efeito é humano: quem pagou, viu o
financeiro confirmar e **não vê nada no app pode achar que a compra não deu
certo**.

O que se quer:

1. Quem entra na planilha entra no desafio da edição **sozinho, em poucos
   minutos**, e ganha um distintivo **"Ingresso garantido"**.
2. Quem fizer check-in **na noite da festa** vê o distintivo **evoluir na
   hora** para **"Marquei presença"**.
3. Cada edição (2026.2, 2027.1, …) tem o **seu** distintivo; eles se
   acumulam no perfil.

## Objetivos

- Sincronização automática planilha → desafio, sem ninguém importar nada
  depois de configurado.
- A planilha continua **restrita** (dados de telefone de gente de fora do
  projeto).
- Casamento **só por telefone** (o nome na planilha pode diferir do nome no
  app; a pessoa pode ter trocado o nome).
- Distintivo de dois estados por edição, que evolui na hora do check-in.
- Retorno visível para a área de vendas: a coluna "ADICIONADO NO DESAFIO"
  da planilha é marcada sozinha.
- Funciona igual a cada semestre: recurso genérico de "desafio de
  ingresso", não código específico de 2026.2.

## Fora do escopo

- Notificação push. O app tem, mas na prática não chega a ninguém (provável
  limitação de web app / instalação). Fica para uma investigação separada.
- Trava de local no check-in (sempre dá problema; não será usada aqui).
- Integração com pagamento/financeiro. A planilha é a fonte da verdade.
- Mudar o formato da planilha ou o fluxo da área de vendas.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Um erro de leitura (planilha vazia, aba renomeada, falha do Google)
  **tirar o distintivo de todo mundo** de uma vez.
- Telefone de comprador ficar visível para alunos, ou a planilha precisar
  ficar pública para a integração funcionar.
- A pessoa casar com a conta **de outra pessoa** por causa de um telefone
  mal escrito.
- A área de vendas precisar mudar o jeito que preenche a planilha.

## Formato da planilha (como está hoje)

- Linhas de título no topo ("LISTA DESAFIO FORRÓ NA REP", e uma faixa verde
  abaixo), linhas em branco, e só depois o **cabeçalho**:
  `QT. | NOME | CELULAR | ADICIONADO NO DESAFIO`.
- `CELULAR` vem copiado de formulário, sem padrão: `35999998888`,
  `19 9 9561-7574` etc.
- `ADICIONADO NO DESAFIO` é uma caixa de seleção.
- Pode haver linhas numeradas (QT.) sem nome/telefone no fim.

Regras de leitura:

- Achar a linha de cabeçalho procurando as colunas `NOME` e `CELULAR`
  (sem diferenciar maiúsculas/acentos; aceitar também "TELEFONE"), não
  assumir linha 1. `ADICIONADO NO DESAFIO` é opcional.
- Ignorar `QT.` e linhas sem telefone.
- Telefone que não passa em `telefoneValido` (sem DDD, curto): linha
  **pulada** e listada como aviso no painel (número da linha + nome), para
  alguém corrigir na planilha.
- Telefone repetido: conta uma vez.

## Como a planilha chega ao app (decidido)

**Google Apps Script na conta Google do organizador**, com gatilho de tempo
a cada ~5 minutos. Como roda com o login de quem configurou, a planilha
fica restrita: basta essa conta ter acesso a ela.

1. O script lê a aba, monta a lista `{ linha, nome, telefone }` e faz
   `POST` para uma **Edge Function** nova do Supabase, com um **segredo por
   desafio** no cabeçalho.
2. A função valida o segredo, identifica o desafio e aplica a lista
   (ver "Sincronização" abaixo).
3. A resposta diz, para cada linha da planilha, se a pessoa **já tem conta
   e está dentro do desafio**. O script marca a caixa
   `ADICIONADO NO DESAFIO` dessas linhas e desmarca as outras.
   - Marcar exige **acesso de edição** na planilha. A conta do dono do
     projeto tem edição. Mesmo assim, se a conta que configurar só tiver
     leitura, o script segue sincronizando e só não marca a coluna (sem
     quebrar).

Alternativas descartadas: link de CSV publicado (deixaria os dados
públicos); conta de serviço do Google Cloud (exige o dono da planilha
compartilhar com um e-mail estranho e mais configuração).

## Sincronização (regras)

A cada envio, a lista recebida é **a lista completa** da edição. O servidor
compara com o estado atual do desafio:

- **Telefone novo com conta** (`telefonesIguais` / `telefones_batem` com
  `profiles.telefone`): entra em `challenge_members`.
- **Telefone novo sem conta**: vai para `challenge_convidados` (mecanismo
  existente: entra sozinho no desafio ao criar a conta com esse telefone).
- **Saiu da planilha**: sai do desafio (ou dos convidados) e, por
  consequência, perde o distintivo. Não existe reembolso; remoção é rara e
  o dono do projeto aceitou que seja automática.
- **Só remove quem veio da planilha.** Quem o organizador adicionou à mão
  no painel não é removido pela sincronização. Isso exige guardar a origem
  de cada participante/convidado (planilha × manual) — hoje não existe;
  `handle_new_user` apaga o convite ao virar conta, então a origem precisa
  sobreviver a essa passagem.
- **Telefone ambíguo (decisão do Claude):** se um telefone da planilha casar
  com **mais de uma** conta (possível com contas antigas sem DDD, que
  casam pela linha sozinha), **ninguém é adicionado** por essa linha e ela
  aparece como aviso no painel, para o organizador resolver adicionando a
  pessoa certa à mão. Casamento único continua valendo, mesmo com conta
  antiga sem DDD (mesma regra do resto do app).
- **Origem dos dados que já existem (decisão do Claude):** participantes e
  convidados que já estavam no desafio antes da primeira sincronização
  contam como **manuais** (nunca removidos pela sincronização), exceto
  quando o telefone deles está na planilha: aí passam a ser **da
  planilha**. Importação por CSV no painel continua existindo e conta como
  manual.
- **Congelamento depois do evento (decisão do Claude):** a partir do dia
  seguinte à data do evento, o servidor responde aos envios sem mudar
  nada (nem entra, nem sai ninguém). Assim, se a planilha for limpa ou
  reaproveitada no semestre seguinte, a edição anterior não perde os
  distintivos. O painel sugere desligar o gatilho do script. O script lê a
  **primeira aba** da planilha.
- **Trava de segurança contra remoção em massa:** se a lista recebida vier
  vazia, ou se ela removeria uma fatia grande de quem já está (proposta: mais
  de 20% e mais de 3 pessoas num único envio), **não remove ninguém**,
  aplica só as entradas e registra um aviso no painel. O organizador pode
  confirmar a remoção pelo painel se for intencional.

## Distintivo da edição

- Um por desafio de ingresso, com **dois estados**, e o perfil mostra só o
  estado atual (mesma ideia dos marcos que evoluem em `badges.ts`):
  - **Ingresso garantido** — padrão `🎟️ <título do desafio> · Ingresso garantido`
  - **Marquei presença** — padrão `🎉 <título do desafio> · Marquei presença`
- Emoji e título dos dois estados vêm preenchidos a partir do nome do
  desafio e são editáveis na criação/edição do desafio.
- **Derivado, não concedido:** quem é membro do desafio tem o distintivo;
  quem tem presença na noite do evento tem o estado evoluído. Assim entrar,
  sair e evoluir acontecem sozinhos, sem tabela de concessão para manter em
  dia.
- Chave de destaque estável entre os dois estados (como as de marco em
  `lib/destaques.ts`), para quem escolheu destacar não perder o destaque ao
  evoluir.
- Edições anteriores continuam no perfil depois que o desafio termina.

## Formato do desafio: clube, não competição (decidido)

- **Primeira edição:** Forró na Rep 2026.2, em **sábado, 05/12/2026**. Na
  data desta conversa (12/11) faltam ~3 semanas, então o plano deve
  entregar primeiro o essencial (sincronização + distintivo + evolução no
  check-in) e depois o acessório (comemorações, correção manual, tela de
  acompanhamento caprichada), de modo que o essencial esteja no ar com
  folga antes da festa.
- É um **clube de quem tem ingresso**, sem ranking e sem pontos. No
  Forroloween o dono do projeto improvisou isso com um desafio de presença
  com janela só no dia da festa; aqui vira um **tipo próprio de desafio**
  ("desafio de ingresso"): entrada restrita, data do evento, distintivo de
  dois estados, **sem janelas de check-in e sem ranking**.
- A tela do desafio mostra o distintivo da pessoa (estado atual), a data
  do evento e quem está no clube (e quem já marcou presença), no lugar do
  ranking.
- O check-in da festa **conta** como presença geral do perfil (marcos
  👣🥉🥈🥇, retrospectiva, planilha de frequência), como qualquer noite
  organizada pelo projeto: é um jeito de a pessoa conhecer gente e dançar
  pela primeira vez.
- O check-in da festa também **pontua no ranking do Espaço Livre**
  (decidido pelo dono do projeto).
- O desafio de ingresso tem **horário da festa** além da data: em 2026.2,
  **18:00 → 04:00** (atravessa a meia-noite). É bem mais longo que a
  janela normal do Espaço Livre de sábado, e esse é o ponto.
- Mecanismo (as duas regras acima saem da mesma coisa): a **noite do
  evento** vira uma **noite extra** — uma janela só naquela data, no
  horário da festa — para os desafios escolhidos no desafio de ingresso.
  Se o desafio que recebe já tem janela nesse dia da semana (o Espaço
  Livre tem sábado), naquela data vale a **união** das duas: o horário da
  festa estende a janela de sempre, sem encurtá-la. Check-in entre 00:00
  e 04:00 conta para a noite de 05/12, como já acontece com janelas que
  atravessam a meia-noite. Hoje presença e ranking
  vêm ambos de `janelaDoCheckin` / `lib/presenca.ts`, então a noite extra
  precisa entrar ali, e não em um cálculo paralelo.
- **Decisão do Claude:** no formulário do desafio de ingresso, o
  organizador marca quais desafios recebem a noite extra; vem pré-marcado
  com os desafios ativos naquela data. Para 2026.2, é o desafio do Espaço
  Livre. A noite extra vale para todas as modalidades do desafio que a
  recebe (presença e rodízio), como uma janela comum.
- O desafio de ingresso em si continua sem ranking. A revisão de
  presenças (migração 026) continua podendo anular uma foto.

## Presença na noite do evento

- O desafio de ingresso tem uma **data do evento**.
- Conta presença: membro do desafio com check-in **dentro do horário da
  festa** na data do evento. Check-ins não têm
  `challenge_id`; como na noite da festa não tem Espaço Livre, qualquer
  check-in naquela noite é da festa. Sem trava de local.
- A evolução aparece **na hora** do check-in.
- **Correção manual** no painel: o organizador pode marcar "esteve lá" para
  quem não fez check-in e "não esteve" para quem fez sem estar. A correção
  vence o check-in.

## O que a pessoa vê

- **Ao entrar** (pela planilha ou ao criar a conta depois): na próxima vez
  que abrir o app, um aviso de comemoração uma única vez — "Seu ingresso pro
  <título> está confirmado! 🎟️" — com o distintivo. É isso que responde o
  "será que deu certo?" sem depender de push.
- **No check-in da noite do evento:** comemoração da evolução
  ("Marquei presença 🎉").
- O desafio aparece na lista de desafios dela, como já acontece com entrada
  restrita.

## O que o organizador faz a cada edição

1. Cria o desafio com entrada restrita, data do evento e os dois estados do
   distintivo (padrões já preenchidos).
2. Liga à planilha: o painel mostra o **script pronto** (com o segredo e o
   endereço já embutidos) e um passo a passo curto — abrir
   script.google.com, colar, informar o link da planilha, autorizar e ativar
   o gatilho. Uma vez por edição.
3. Acompanha no painel: **última sincronização** (hora), quantos com conta,
   quantos aguardando conta, linhas puladas (com motivo), avisos da trava de
   remoção. Pode **gerar um novo segredo** (invalida o antigo) se o script
   vazar.

## Privacidade

- Planilha fica restrita; nenhum link público.
- Telefones só ficam em tabelas que apenas organizadores leem
  (`challenge_convidados` já é assim). Alunos nunca veem telefone de
  ninguém.
- O segredo de cada desafio só aparece para organizadores no painel. A
  função rejeita envio sem segredo válido e para desafio que não seja de
  entrada restrita.
- O script vive na conta Google do organizador; o único destino dos dados é
  a função do próprio app.

## Restrições do projeto

- Migração nova numerada (a última é a 042), idempotente, no padrão das
  existentes ("Rode no SQL Editor. Pode rodar mais de uma vez.").
- Consultas de tabela inteira (ex.: todos os perfis para casar telefone)
  passam por paginação (`todasAsLinhas` no app; no SQL, sem limite de 1000
  linhas do PostgREST).
- Usar as regras de telefone existentes (`telefonesIguais` /
  `telefones_batem`, DDD obrigatório para cadastrar); não criar uma terceira.
- Modo demo (`demoApi.ts`) precisa continuar funcionando com o recurso.

## Deixado para quem for construir

- Estrutura exata das tabelas/colunas (segredo, origem, data do evento,
  textos do distintivo, correções de presença, registro de sincronização).
- Se a aplicação da lista roda numa função SQL `security definer` chamada
  pela Edge Function ou na própria Edge Function.
- Como guardar "já viu a comemoração" (no aparelho é aceitável; ver duas
  vezes em dois aparelhos não é problema).
- O texto do passo a passo e do script de Apps Script.
- Onde exatamente ficam no painel a configuração e o acompanhamento.
