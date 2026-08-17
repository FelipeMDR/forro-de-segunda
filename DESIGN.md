# Forró de Segunda — Diagnóstico e proposta de redesign

Documento completo para quem vai desenhar o app **sem conhecê-lo**.

- **Parte 1 — O que existe:** produto, usuários, cada tela, o sistema
  visual e um diagnóstico com números medidos.
- **Parte 2 — A proposta:** princípios, nova navegação, layout
  responsivo, modo escuro com tokens já validados, sistema de
  componentes, redesenho tela a tela e um roteiro priorizado.
- **Parte 3 — Restrições:** decisões que não podem ser desfeitas, e por
  quê.

Todos os números de contraste e de tamanho neste documento foram
**medidos no app rodando**, não estimados.

---

# PARTE 1 — O QUE EXISTE

## 1. O produto

PWA do **Forró de Segunda**, projeto de dança de forró do Espaço Livre em
Itajubá (Instagram: @fds.itajuba). Atende **mais de 300 alunos** em
turmas (Iniciante 01, Iniciante 02, Intermediário, Avançado) e uma
**diretoria de ~10 pessoas** que administra tudo.

O app faz três coisas, nesta ordem de importância:

1. **Registrar presença.** O aluno tira uma foto na aula e essa foto
   *é* a presença. Sem check-in, nada mais no app existe.
2. **Ser uma rede social pequena e fechada.** Feed de fotos, reações,
   comentários, marcação de duplas de dança, distintivos, ranking.
3. **Dar ferramenta para a organização.** Lista de chamada, turmas,
   agenda, desafios, frequência, distintivos, moderação.

O que o app mede é **quantas noites você foi dançar e com quanta gente
diferente você dançou**. Não é fitness, não é rede social genérica.

### Conceitos próprios do domínio

| Conceito | O que é |
| --- | --- |
| **Check-in** | Foto tirada na hora (sem galeria) que registra presença |
| **Noite de forró** | Das 05:00 às 04:59 do dia seguinte — a madrugada pertence à noite que começou |
| **Desafio** | Competição por período, com janelas de horário por dia da semana e opcionalmente trava por local (GPS) |
| **Janela** | Faixa de horário em que o check-in conta ponto naquele desafio |
| **Dupla** | Duas pessoas que dançaram juntas; só conta quando as duas se marcam |
| **Distintivo** | Conquista, automática (sequência, presenças) ou entregue à mão pela organização |
| **Turma** | Nível da aula. Uma pessoa pode estar em várias |
| **Papel de dança** | Condutor(a) ou Conduzido(a), por turma |
| **Cargo** | Função na diretoria (Presidência, Professor(a), Monitor(a)…) |
| **Semestre** | Ciclo; ao encerrar, libera a Retrospectiva |

## 2. Quem usa, e em que situação

### O aluno — a grande maioria

Estudante universitário, 18–30 anos, celular Android ou iPhone de faixa
variada, **plano de dados limitado**.

- Usa **durante ou logo após a aula**: em pé, uma mão só, suado, celular
  quase sem bateria.
- **Num salão escuro, à noite.** As aulas são à noite e o espaço livre
  vara a madrugada.
- **Em rajadas curtas.** Tira a foto, marca com quem dançou, vê quem
  reagiu. Raramente passa de dois minutos.
- Depois, **no ônibus de volta**, rola o feed com calma.

Perguntas que ele traz: *"registrei minha presença?"*, *"quem foi
hoje?"*, *"quem reagiu à minha foto?"*.

### A organização — ~10 pessoas

Diretoria com cargos. Usa o **painel do organizador** para importar
listas de chamada em CSV, conferir frequência, criar desafios, entregar
distintivos e moderar denúncias.

Trabalha **sentada, com tempo, em tela grande** — o oposto exato do
aluno. E hoje recebe exatamente a mesma interface que ele.

## 3. Navegação atual

### Shell

```
┌────────────────────────────────────────────┐
│ HEADER  (sticky, z-30, translúcido)        │
│ [Logo 38px]        [🛠️]?  [🔎]  [avatar]     │
├────────────────────────────────────────────┤
│                                            │
│ <main>  coluna única — max-w-md (448px)    │
│         px-4  pt-4  pb-28                  │
│                                            │
├────────────────────────────────────────────┤
│ NAV INFERIOR  (fixed, z-30)                │
│   🎉Feed   🏆Desafios   (📸)   👤Perfil   🔔Avisos │
│                        FAB elevado         │
└────────────────────────────────────────────┘
```

`🛠️` só para organizadores. `🔔` traz contador de não lidas. `📸` é um
botão flutuante laranja, elevado acima da barra.

### Rotas

| Rota | Tela | Como se chega |
| --- | --- | --- |
| `/login` | Entrar · primeira vez · esqueci a senha | sem sessão |
| `/nova-senha` | Definir senha nova | link de e-mail |
| `/confirmado` | Confirmação de e-mail | link de e-mail |
| `/` | **Feed** | nav inferior |
| `/checkin` | **Check-in** | FAB central |
| `/desafios` | Lista de desafios | nav inferior |
| `/desafios/:id` | Detalhe + ranking | cartão do desafio |
| `/buscar` | Buscar pessoas | **só pelo header** |
| `/notificacoes` | Avisos | nav inferior |
| `/publicacao/:id` | Publicação isolada | notificação, favorito |
| `/retrospectiva` | Retrospectiva do semestre | **só de dentro do perfil, e só com o semestre encerrado** |
| `/perfil` | Meu perfil | nav inferior **e** avatar do header |
| `/perfil/:id` | Perfil de outra pessoa | feed, busca, notificação |
| `/organizador` | Painel (5 abas) | **só pelo header** |

## 4. Inventário de telas

### 4.1 Feed (`/`)

De cima para baixo:

1. **Convite de instalação** (dispensável, só se ainda não instalou)
2. **Cartão de agenda** — até 4 próximos compromissos. Cada linha traz
   emoji (🎓 aula, 🎉 festa, 🚫 cancelada), título, chip de turma, data
   ou "Hoje" em destaque, horário, descrição, e o botão **"Eu vou"** com
   as caras de quem já confirmou (até 4 avatares sobrepostos + contagem)
3. **Seletor** "Todo mundo / Minha turma" (só se a pessoa tem turma).
   "Minha turma" reúne onde a pessoa **estuda** e onde ela **dá aula** —
   professor e monitor quase nunca estão matriculados na turma que
   conduzem, e são justamente quem mais quer acompanhar os alunos. A
   organização marca quem dá aula em quê no painel (Pessoas → "Dá aula
   em"); o mesmo conjunto vale para o cartão de agenda.
4. **Publicações**, rolagem infinita de 12 em 12

**Cartão de publicação** — o componente mais visto do app:

```
┌──────────────────────────────────────┐
│ (avatar 38) Nome [👑 Cargo]      ⋯   │
│             Turma · há 2 horas        │
├──────────────────────────────────────┤
│                                      │
│         FOTO  4:5                    │
│                                      │
├──────────────────────────────────────┤
│ Legenda                              │
├──────────────────────────────────────┤
│ ❤️ 1  🔥  👏 1  💃      💬 0    ☆     │
├──────────────────────────────────────┤
│ 💃 Marcar dupla                       │  ← condicional
└──────────────────────────────────────┘
```

São **até 8 alvos de toque** por cartão: perfil, menu, 4 reações,
comentários, favorito, dupla.

### 4.2 Check-in (`/checkin`)

Entrar na rota **abre a câmera em tela cheia automaticamente**.

**Câmera:** faixas na cor do app em cima e embaixo, quadro inteiro do
sensor no meio (sem zoom), moldura 4:5 marcando o que vira foto e
escurecendo o resto, aviso de status no alto, disparo (76px) e virar
câmera embaixo, ✕ no canto superior esquerdo.

**Fora da câmera:**
1. Grade **"Com quem você dançou hoje?"** — 12 rostos, busca quando
   passa disso, "Ver todos (N)", marcados na frente
2. **Um** aviso de status, escolhido por prioridade entre seis situações
   (valendo ponto → longe do local → já pontuou → aula cancelada →
   desafio que não participo → nada aberto)
3. Botão **"Abrir a câmera 📸"**
4. `<details>` fechado: "Como está cada desafio agora"

**Depois da foto:** prévia 4:5 → campo de legenda → "Publicar check-in"
→ "Tirar outra".

### 4.3 Desafios (`/desafios` e `/desafios/:id`)

Lista agrupada em **Rolando agora / Em breve / Encerrados**. Cada cartão:
título, chip "participando", período, resumo das janelas
(`seg·qua, 19:00–23:00`), contagem de participantes, e "🔥 N dias
restantes" ou "⏳ Começa em…".

Detalhe: regras, janelas por dia, local com raio, participantes,
**ranking** e entrada/saída do desafio.

### 4.4 Avisos (`/notificacoes`)

Lista única de reações, comentários e marcações de dupla, ordenada por
tempo, rolagem infinita de 15 em 15. Cada linha: avatar (40px), texto
("Fulana comentou: …"), tempo relativo e **miniatura 48px da foto**.
Marcações pendentes trazem **Confirmar / Não rolou**.

### 4.5 Perfil (`/perfil` e `/perfil/:id`)

Pilha de cartões:

1. **Identidade** — avatar 88px, nome, chips de cargo (laranja) e de
   turma (verde), quatro métricas em caixas: 🔥 semanas seguidas ·
   presenças · desafios · duplas. E, se o semestre estiver encerrado, o
   botão da Retrospectiva
2. **🎖️ Distintivos** — grade 2 colunas, emoji + título + descrição
3. **⭐ Favoritos** — grade 3 colunas de miniaturas quadradas
4. *(só no próprio)* **Meus dados e acesso** — nome, e-mail, senha
5. *(só no próprio)* Instalar o app · Lembretes push · Sair da conta

### 4.6 Painel do organizador (`/organizador`)

Cinco abas, dentro da **mesma coluna de 448px** do feed:

| Aba | Conteúdo |
| --- | --- |
| 👥 Pessoas | Cargos do projeto · turmas · importar CSV · matrícula do semestre · encerrar semestre · lista de 300+ alunos com busca |
| 📅 Agenda | Eventos recorrentes e pontuais · feriados e cancelamentos |
| 🎖️ Distintivos | Catálogo + entrega (por turma, por Top N de desafio, ou individual) |
| 📋 Frequência | Resumo do mês + **tabela** Data/Nome/Turma/Ponto |
| 🚩 Denúncias | Fila de moderação |

São ~2.300 linhas de tela. É, na prática, **um segundo app**.

### 4.7 Retrospectiva (`/retrospectiva`)

Balanço do semestre: números grandes em grade 2×2, mensagens específicas
sobre a jornada da pessoa, distintivos conquistados, convite para
compartilhar no @fds.itajuba.

### 4.8 Telas fora do shell

`/login` (abas Entrar / Primeira vez, recuperação de senha, tela
"Confira seu e-mail"), `/nova-senha`, `/confirmado`. Todas: logo grande
centralizado + um cartão, sem header nem nav.

## 5. Sistema visual atual

### Paleta oficial (da diretoria de comunicação)

| Papel | Token | Hex |
| --- | --- | --- |
| Azul — "SEGUNDA" | `azul-500` | `#0391D5` |
| Verde — "FORRÓ" | `verde-500` | `#9BC22D` |
| Laranja da bandana | `brasa-500` | `#DE5300` |
| Azul-marinho | `marinho-500` | `#024565` |
| Preto | `preto` | `#000507` |
| Fundo | `fundo` | `#F5F4F2` |
| Superfície | `papel` | `#FFFFFF` |

As variantes 300/400/600/700 existem só para hover e para dar contraste
sobre fundo claro. **A cor oficial é sempre a 500.**

### Escala "tinta" — o preto oficial em graus de ênfase

Contrastes **medidos** sobre `#F5F4F2` *e* sobre branco:

| Token | Hex | Contraste |
| --- | --- | --- |
| `tinta-900` | `#000507` | 19,9:1 |
| `tinta-700` | `#2C3134` | 12,0:1 |
| `tinta-600` | `#4A5155` | 7,4:1 |
| `tinta-500` | `#5C6367` | 5,6:1 |
| `tinta-400` | `#656C70` | 4,9:1 |

Nada mais claro que `tinta-400` passa no AA para texto normal.

### Tipografia

**Nunito Variable**, arredondada e informal — combina com a identidade do
projeto. Só dois pesos: `bold` (600) e `extrabold` (800).

| Uso | Classe |
| --- | --- |
| Título de tela | `text-xl font-extrabold` (20px) |
| Título de seção | `text-sm font-bold uppercase tracking-wide text-tinta-500` |
| Corpo | `text-sm` (14px) |
| Apoio | `text-xs` (12px) |
| Campos | **16px obrigatório** |

### Componentes de base

`.card` · `.btn-primary` (gradiente `brasa-600→700`, texto branco) ·
`.btn-ghost` · `.btn-danger` · `.input` · `.label`

### Padrões recorrentes

- **Sheets** subindo da borda inferior — comentários, formulário de
  desafio, convite de instalação
- **Toast** flutuante acima da nav
- **EmptyState** — emoji grande, título, texto, ação
- **Chips** arredondados para cargo, turma e estado
- **Emoji como ícone** em praticamente tudo

## 6. Diagnóstico

### 6.1 Navegação sem regra

**Perfil tem duas entradas** (avatar no header + 👤 no rodapé), enquanto
**Buscar e Organizador têm uma só, e ela fica no header** — o canto mais
difícil de alcançar com o polegar. Não existe critério que explique o que
mora em cima e o que mora embaixo.

**Três padrões de voltar:** "Voltar aos desafios", "Voltar ao feed",
"← Voltar" (`navigate(-1)`), e telas sem nada.

**A Retrospectiva é a tela mais escondida do app** — o momento mais
celebrativo, disponível apenas como botão dentro do perfil, condicionado
ao semestre estar encerrado.

**O FAB não tem estado.** O botão de check-in é idêntico tendo você
postado ou não naquela noite. A pergunta nº 1 do aluno — *"eu já
registrei minha presença?"* — não é respondida por nenhum pixel do shell.

### 6.2 Alvos de toque abaixo do mínimo (medidos)

Mínimo recomendado: **44×44px**.

| Elemento | Medido | Situação |
| --- | --- | --- |
| Botão de reação (❤️ 🔥 👏 💃) | **39×32** | ✗ |
| Botão de comentários | **56×32** | ✗ (altura) |
| Ícones do header (🛠️ 🔎) | **36×36** | ✗ |
| Avatar do header | **32×32** | ✗ |
| Item da nav inferior | 68×51 | ✓ |
| FAB de check-in | 56×56 | ✓ |

Os alvos que falham são justamente os mais usados: reagir a uma foto.

### 6.3 Dispositivos: o maior débito

Todo o app está preso em **`max-w-md` (448px), centralizado**. Existem
apenas **6 usos de breakpoint** (`sm:`) em toda a base de código, e
nenhum deles muda o layout de uma página.

| Dispositivo | Situação |
| --- | --- |
| Celular 360–430px | Bem servido. É o alvo real |
| Celular grande / dobrável | Coluna estreita, faixas vazias |
| Tablet | 448px no meio de 1024px+ |
| Desktop | Idem — e é onde a diretoria trabalha |

**O caso mais grave é o painel do organizador:** uma tabela de frequência
com 4 colunas em `text-xs`, dentro de uma rolagem interna de 288px,
dentro da coluna de 448px, para conferir a presença de 300 alunos.

### 6.4 Sem modo escuro

O app é usado **à noite, num salão escuro**, e é branco `#F5F4F2` a 100%.

### 6.5 Densidade

- O cartão de publicação acumula 8 alvos de toque sem hierarquia entre
  "reagir" (frequente) e "administrar" (raro).
- O perfil é uma pilha de 4 a 7 cartões: para chegar em "sair da conta"
  rola-se a tela inteira.
- O feed empilha convite de instalação + agenda + filtro; num celular
  pequeno a primeira foto começa abaixo da dobra.

### 6.6 Consistência

- Três raios (`xl` botões, `2xl` cartões, `3xl` sheets) sem regra escrita.
- Chips com variações sutis: cargo (`brasa/20` + anel), turma
  (`verde/15`), estado (`brasa/15`).
- Emoji semântico em toda parte: fiel à identidade, mas sem sistema e
  sem equivalente textual em vários pontos.

### 6.7 Acessibilidade

| Item | Situação |
| --- | --- |
| Contraste de texto | ✓ Medido e tratado com rigor |
| Alvos de toque | ✗ Ver 6.2 |
| Foco de teclado | ✗ Só o anel do `.input`; botões não têm |
| `aria-label` / `aria-pressed` | ~ Em boa parte, não em todos |
| Zoom por gesto | ✗ Desativado globalmente |
| Modo escuro | ✗ Inexistente |

---

# PARTE 2 — A PROPOSTA

## 7. Princípios

1. **A presença vem primeiro.** Em qualquer tela, responder "já registrei
   hoje?" tem prioridade sobre qualquer outra informação.
2. **Uma mão, no escuro, com pressa.** Tudo que se usa durante a aula
   fica na metade de baixo da tela.
3. **A alegria é do produto, não do enfeite.** Emoji, laranja e a voz
   informal são a identidade — enxugar não é apagar.
4. **Aluno e diretoria são dois produtos.** Contextos opostos merecem
   layouts opostos.
5. **Nada de contraste no olho.** Toda cor nova entra medida.

## 8. Nova arquitetura de navegação

### A regra

> **Rodapé = destinos** (lugares onde você fica).
> **Header = ações e contexto** (coisas que você faz e volta).

### Rodapé — 5 destinos, sem duplicata

```
🎉 Feed    🏆 Desafios    (📸)    🔔 Avisos    👤 Perfil
```

**O avatar sai do header.** Perfil já é um destino do rodapé; ter as duas
entradas é o que hoje quebra a regra.

### O FAB ganha estado

| Situação | Aparência |
| --- | --- |
| Ainda não postou nesta noite | Laranja cheio, `📸` — como hoje |
| Já postou nesta noite | Contorno laranja com `✓`, e o rótulo vira "Check-in feito" |
| Nada aberto e nenhuma foto | Laranja apagado (ainda clicável — a foto entra no feed) |

Resolve a pergunta nº 1 do aluno sem ele abrir nada.

### Header

```
[Logo]                                    [🔎]  [🛠️]?
```

Em telas de detalhe, o logo dá lugar ao retorno:

```
[←  Título da tela]                       [ações da tela]
```

### Um único padrão de voltar

Componente `CabecalhoDetalhe` com seta + título, usado por
`/publicacao/:id`, `/perfil/:id`, `/desafios/:id` e `/retrospectiva`.
Aposenta os três padrões atuais.

### A Retrospectiva sai do esconderijo

Quando o semestre encerra:
1. Vira **uma notificação** no topo dos Avisos ("Sua retrospectiva do
   semestre chegou ✨")
2. Vira **um cartão destacado no topo do feed**, dispensável
3. Continua acessível pelo perfil

É o modelo do Spotify Wrapped: um evento que chega até a pessoa.

## 9. Layout responsivo

Três faixas, não uma.

### `< 640px` — celular (alvo principal)

Como hoje: header + coluna única + nav inferior. Padding `px-4`.

### `640–1023px` — tablet retrato e celular grande

Coluna sobe para **560px**, padding `px-6`. Nav inferior permanece.
Grades ganham uma coluna: favoritos 3→4, distintivos 2→3, duplas 4→6.

### `≥ 1024px` — tablet paisagem e desktop

**A nav inferior vira uma barra lateral fixa à esquerda** (padrão web de
rede social), com ícone + rótulo por extenso e o check-in como botão
primário destacado:

```
┌──────────────┬───────────────────────┬──────────────┐
│  [Logo]      │                       │  Agenda      │
│              │   Conteúdo            │  ────────    │
│  🎉 Feed      │   600px               │  Quem vai    │
│  🏆 Desafios  │                       │  hoje        │
│  🔔 Avisos    │                       │              │
│  👤 Perfil    │                       │  (coluna     │
│  🔎 Buscar    │                       │   opcional)  │
│  🛠️ Painel    │                       │              │
│              │                       │              │
│ [📸 Check-in] │                       │              │
└──────────────┴───────────────────────┴──────────────┘
     240px              600px               300px
```

A terceira coluna só aparece a partir de **1280px** e recebe o que hoje
empurra o feed para baixo: **a agenda**. No celular ela continua no topo.

### O painel do organizador foge da coluna

É o único lugar que usa a largura toda (até **1440px**), com as 5 abas
virando uma **navegação lateral secundária**:

```
┌──────────┬────────────┬────────────────────────────┐
│ nav app  │ 👥 Pessoas  │                            │
│ (240px)  │ 📅 Agenda   │   Conteúdo largo           │
│          │ 🎖️ Distint. │   Tabelas de verdade       │
│          │ 📋 Frequên. │   Formulários em 2 colunas │
│          │ 🚩 Denúncias│                            │
└──────────┴────────────┴────────────────────────────┘
```

A tabela de frequência passa a ter largura real, cabeçalho fixo, filtro
por turma e por período, e `text-sm` em vez de `text-xs`. No celular o
painel continua com abas horizontais e cartões empilhados.

## 10. Modo escuro

Prioridade alta: o app é usado à noite, num salão escuro.

### Superfícies

Cinza-azulado, **não preto puro** — preto puro no OLED provoca rastro ao
rolar e aumenta o ofuscamento.

| Papel | Claro | Escuro |
| --- | --- | --- |
| Fundo da página | `#F5F4F2` | `#0E1113` |
| Superfície (cartão) | `#FFFFFF` | `#171B1E` |
| Superfície elevada (sheet, menu) | `#FFFFFF` | `#1F2427` |

No escuro a separação entre fundo e cartão é de apenas 1,09:1 — de
propósito. **Hierarquia no escuro se faz com elevação e borda
(`branco/8`), não com contraste de superfície.**

### Texto (contrastes medidos sobre `#171B1E`)

| Token | Claro | Escuro | Contraste |
| --- | --- | --- | --- |
| `tinta-900` | `#000507` | `#F2F4F5` | 15,7:1 |
| `tinta-700` | `#2C3134` | `#C9CFD3` | 11,0:1 |
| `tinta-600` | `#4A5155` | `#A7AFB4` | 7,8:1 |
| `tinta-500` | `#5C6367` | `#929A9F` | 6,1:1 |
| `tinta-400` | `#656C70` | `#848C91` | 5,1:1 |

Todos passam no AA.

### A regra da marca: **claro usa 700/800, escuro usa 300/400**

As variantes escuras da marca são ilegíveis no escuro. Medido sobre
`#171B1E`:

| Cor | Variante do claro | Variante do escuro |
| --- | --- | --- |
| Laranja | `brasa-700` — **2,2:1 ✗** | `brasa-400` `#F97316` — **6,2:1 ✓** |
| Azul | `azul-700` — **2,3:1 ✗** | `azul-300` `#7CC6EE` — **9,2:1 ✓** |
| Verde | `verde-800` — **2,4:1 ✗** | `verde-400` `#B0D24A` — **10,0:1 ✓** |

Trocar só as superfícies e manter os acentos quebraria a leitura em todos
os avisos coloridos do app.

### Implementação sugerida

Tokens em `@theme` respondendo a `prefers-color-scheme`, com um seletor
de tema (Claro / Escuro / Automático) no perfil. `theme_color` do
manifest e a cor da barra de status acompanham.

**Exceção:** a câmera. Ela já tem faixas claras por decisão recente; no
escuro elas devem acompanhar o tema — mas a moldura 4:5 e o escurecido de
fora permanecem idênticos.

## 11. Sistema de componentes

### Escala de raio — com regra escrita

| Raio | Valor | Usa em |
| --- | --- | --- |
| `rounded-xl` | 12px | Controles: botões, campos, chips grandes |
| `rounded-2xl` | 16px | Superfícies: cartões, avisos |
| `rounded-3xl` | 24px | Folhas que sobem da borda |
| `rounded-full` | — | Avatares, chips pequenos, FAB |

### Chip único, quatro tons

Substitui as variações atuais de opacidade e anel:

| Tom | Usa para | Claro | Escuro |
| --- | --- | --- | --- |
| `marca` | Cargo | `brasa/20` + anel, texto `brasa-700` | `brasa/15`, texto `brasa-400` |
| `apoio` | Turma, papel de dança | `verde/15`, texto `verde-800` | `verde/15`, texto `verde-400` |
| `info` | Estado neutro | `azul/10`, texto `azul-700` | `azul/15`, texto `azul-300` |
| `alerta` | Aviso, pendência | `amber/10`, texto `amber-800` | `amber/15`, texto `amber-300` |

### Alvos de toque: mínimo 44×44

Regra: **a área tocável pode ser maior que o desenho.** Um chip de reação
continua com 32px de altura visual, mas ganha padding invisível até 44px.
Corrige os 39×32 medidos sem inchar o cartão.

### Emoji continua — mas vira sistema

Trocar emoji por um conjunto de ícones custaria a personalidade do app.
A proposta é documentá-lo:

| Emoji | Significado fixo |
| --- | --- |
| 📸 | Check-in |
| 🔥 | Sequência de semanas |
| 💃 | Dupla de dança |
| 🏆 | Desafio |
| 🎖️ | Distintivo |
| ⭐ / ☆ | Favorito |
| 📍 | Local / GPS |
| 🔔 | Aviso |
| 🛠️ | Painel do organizador |
| 🎓 / 🎉 / 🚫 | Aula / festa / cancelada |

Regra de acessibilidade: emoji **decorativo** ao lado de texto recebe
`aria-hidden`; emoji **sozinho** carregando significado recebe
`aria-label`.

### Foco de teclado

Anel visível em todo controle: 2px `azul-500` com 2px de deslocamento.
Hoje só os campos têm.

## 12. Redesenho tela a tela

### 12.1 Cartão de publicação — de 8 para 5 alvos

O problema é a fileira de 4 reações competindo com comentário, favorito e
dupla, todos com o mesmo peso.

```
┌──────────────────────────────────────┐
│ (avatar) Nome [👑 Cargo]         ⋯   │
│          Turma · há 2 horas           │
├──────────────────────────────────────┤
│          FOTO  4:5                   │
├──────────────────────────────────────┤
│ ❤️🔥👏 8       Legenda da foto         │   ← resumo das reações
├──────────────────────────────────────┤
│  ❤️ Reagir      💬 3      ☆      💃   │
└──────────────────────────────────────┘
```

- As 4 reações viram **um botão "Reagir"**; tocar abre um seletor
  flutuante com os quatro emojis em tamanho confortável. Tocar de novo
  repete a última reação.
- Acima, um **resumo** ("❤️🔥👏 8") mostra o que já foi reagido — hoje
  essa informação está espalhada nos quatro contadores.
- Os alvos caem de 8 para 5, e todos passam de 44px.

### 12.2 Feed — a agenda para de empurrar a foto

- Em **≥1280px** a agenda vai para a coluna da direita.
- No **celular**, quando não há nada hoje, ela colapsa numa faixa de uma
  linha ("Próxima aula: quarta, 19h") que expande ao toque. Cheia só
  quando é hoje ou quando há confirmação pendente.
- O seletor "Todo mundo / Minha turma" fica **fixo abaixo do header** ao
  rolar, em vez de sumir.

### 12.3 Check-in — o registro vira um momento

Hoje a grade de duplas divide a tela com a câmera. Proposta: transformar
a sequência num fluxo de três passos.

```
1. CÂMERA (tela cheia)   →   2. REVISAR   →   3. PRONTO
   aviso + moldura           foto + legenda    ✓ Check-in registrado
   + disparo                 + publicar        "Com quem você dançou?"
                                               [grade de rostos]
                                               [Ir para o feed]
```

O passo 3 é o lugar natural para marcar duplas: acabou de acontecer, a
memória está fresca, e a tela não disputa espaço com a câmera. Quem
voltar a `/checkin` já tendo postado cai direto no passo 3.

### 12.4 Perfil — separar identidade de configuração

O perfil hoje mistura "quem eu sou no projeto" com "minhas configurações".

- **`/perfil`** fica só com identidade e conquistas: cartão de
  identidade, métricas, distintivos, favoritos.
- **`/perfil/conta`** recebe dados e acesso, notificações, instalar o
  app e sair — acessível por um `⚙️` no cartão de identidade.

Encurta a rolagem e dá um destino claro para "onde troco minha senha".

### 12.5 Avisos — agrupar por dia

Com rolagem infinita já implementada, falta ritmo: separadores de
**Hoje / Ontem / Esta semana / Antes**, e as **pendências de dupla no
topo**, destacadas — são as únicas linhas que pedem ação.

### 12.6 Painel do organizador — o layout largo

Ver §9. Além do layout:

- **Frequência:** filtros por turma e período, cabeçalho fixo, exportar
  CSV, e um resumo em cartões (presenças no mês, média por aula, faltas
  seguidas) acima da tabela.
- **Pessoas:** a lista de 300 alunos vira tabela em telas largas, com
  ordenação por nome/turma/último check-in.
- **Formulários** (desafio, evento, distintivo) em duas colunas a partir
  de 1024px, em vez de sheet.

### 12.7 Telas de autenticação

Mantêm o formato (logo grande + cartão) e ganham o modo escuro. Em
≥1024px, cartão centralizado com no máximo 420px — não devem crescer.

## 13. Acessibilidade — metas

| Item | Meta |
| --- | --- |
| Contraste de texto | AA (4,5:1) em ambos os temas, **medido** |
| Contraste de controle | 3:1 para bordas e ícones funcionais |
| Alvo de toque | 44×44 mínimo, com área maior que o desenho |
| Foco | Anel visível em todo controle |
| Leitor de tela | Emoji semântico rotulado; decorativo escondido |
| Zoom | Devolver a pinça **na tela de publicação** (`/publicacao/:id`), mantendo a trava no resto do app — resolve ver a foto de perto sem trazer de volta os toques acidentais |
| Movimento | Respeitar `prefers-reduced-motion` nas transições `active:scale-95` |

## 14. Roteiro sugerido

Ordenado por impacto sobre esforço.

### Fase 1 — Navegação e estado (esforço baixo, impacto alto)
1. Avatar sai do header; a regra header/rodapé passa a valer
2. FAB com estado de "já fiz check-in hoje"
3. `CabecalhoDetalhe` único para as telas de detalhe
4. Alvos de toque para 44px

### Fase 2 — Modo escuro (esforço médio, impacto alto)
5. Tokens de superfície e texto
6. Regra da marca 700/800 ↔ 300/400
7. Seletor Claro / Escuro / Automático no perfil

### Fase 3 — Densidade (esforço médio)
8. Cartão de publicação de 8 para 5 alvos
9. Perfil dividido em identidade e conta
10. Agenda colapsável no feed
11. Avisos agrupados por dia

### Fase 4 — Telas grandes (esforço alto, impacto alto para a diretoria)
12. Barra lateral em ≥1024px
13. Painel do organizador em layout largo com tabelas de verdade
14. Terceira coluna com a agenda em ≥1280px

### Fase 5 — Acabamento
15. Sistema de chips e escala de raio aplicados
16. Foco de teclado
17. Zoom na tela de publicação
18. Retrospectiva como evento (aviso + cartão no feed)

---

# PARTE 3 — RESTRIÇÕES

## 15. Decisões que não podem ser desfeitas

Cada uma resolveu um problema real. Um redesign que as desfaça
reintroduz o problema.

| Decisão | Por quê |
| --- | --- |
| Paleta oficial, cor 500 intocada | É a identidade da diretoria de comunicação |
| Escala "tinta" com contraste medido | Cinza escolhido a olho falha no AA |
| `font-size: 16px` em todo campo | Abaixo disso o iOS dá zoom sozinho ao focar |
| Safe areas em 15 pontos | O app roda sob a barra de status do iPhone |
| **Um** aviso na tela de check-in | Eram até cinco, e empurravam a câmera para fora da tela |
| Câmera em tela cheia sem `object-cover` | Preencher a tela cortava as laterais e virava zoom de 1,6× |
| Moldura 4:5 marcando o que o feed mostra | Sem ela, o rosto enquadrado na borda sumia na publicação |
| Foto só tirada na hora, sem galeria | A foto *é* a prova de presença |
| Duplas: marcados na frente da grade | Marcar alguém pela busca e limpar o campo fazia a pessoa sumir |
| Grade de duplas limitada a 12 + busca | Com 50 presentes a grade passava de 1.300px |
| Feed e avisos paginados (12 / 15) | Dados móveis: carregar tudo custava megabytes por pessoa |
| "Noite de forró" das 05:00 às 04:59 | O espaço livre vara a madrugada; meia-noite partia a noite em duas |
| Telefone fora dos perfis públicos | Privacidade: 300 pessoas veem a mesma tela |
| Zoom por gesto desativado no feed | Toques acidentais com a tela usada de pé, com uma mão |
| Dupla só conta com as duas partes | Impede alguém alegar ter dançado com quem não dançou |

## 16. Ficha técnica

- **Stack:** React 18 · Vite 6 · TypeScript 5.6 · Tailwind CSS v4
  (`@theme`, tokens em `src/index.css`)
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime), com um modo
  demonstração completo em `localStorage`
- **PWA:** vite-plugin-pwa (injectManifest), Workbox `CacheFirst` para
  fotos (150 entradas, 30 dias), `display: standalone`,
  `orientation: portrait`
- **Hospedagem:** Vercel, deploy automático da branch `main`
- **Tamanho:** ~15.000 linhas em `src/` — 14 páginas, 15 componentes

### Arquivos-chave para o redesign

| Arquivo | O que é |
| --- | --- |
| `src/index.css` | Todos os tokens, os componentes de base |
| `src/components/Layout.tsx` | Shell: header e nav inferior |
| `src/components/CheckinCard.tsx` | O cartão mais visto do app |
| `src/components/CameraCapture.tsx` | A câmera em tela cheia |
| `src/pages/FeedPage.tsx` | Feed, agenda, rolagem infinita |
| `src/pages/CheckinPage.tsx` | Fluxo de check-in |
| `src/pages/AdminPage.tsx` | O painel que precisa de layout próprio |
| `src/lib/types.ts` | Tipos do domínio, cargos, turmas |
