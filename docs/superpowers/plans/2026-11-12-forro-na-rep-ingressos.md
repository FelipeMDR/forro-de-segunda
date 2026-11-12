# Forró na Rep: planilha de ingressos ligada ao desafio — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o "desafio de ingresso". A planilha do Google entra sozinha no desafio, com distintivo "Ingresso garantido", e o distintivo evolui para "Marquei presença" no check-in feito no horário da festa. A noite da festa também vale como presença geral e pontua no Espaço Livre.

**Architecture:**
- A regra da sincronização mora no banco: a função `sincronizar_planilha_ingresso`, testada com PGlite.
- Um Google Apps Script curto, gerado pelo painel, manda a grade crua da primeira aba e marca as caixinhas conforme a resposta.
- A "noite extra" entra em `janelaDoCheckin` (`src/lib/dates.ts`), por onde já passam ranking, presença e tela de check-in. Assim uma mudança só cobre as três coisas.
- O distintivo é derivado (participação mais presença) por uma função SQL lida no perfil.

**Tech Stack:** React 18 + TypeScript, Tailwind v4, Supabase (Postgres, RLS, PostgREST RPC), Vitest, PGlite nos testes de SQL, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-11-12-forro-na-rep-ingressos-design.md`

## Global Constraints

- Primeira edição: Forró na Rep 2026.2, **05/12/2026**, horário **18:00 → 04:00**. As fases 1 e 2 (Tasks 1–7) precisam estar em produção bem antes disso. A fase 3 (Tasks 8–9) pode vir depois.
- Casamento só por telefone, com as regras existentes `telefone_ddd`, `telefone_linha` e `telefones_batem` (migração 022). Telefone válido = DDD presente e linha de 8 dígitos.
- Textos padrão do distintivo: `🎟️` + `"<título do desafio> · Ingresso garantido"`, e `🎉` + `"<título do desafio> · Marquei presença"`.
- Trava de remoção: não remove ninguém se a lista válida vier vazia, ou se a remoção for **mais de 20%** de quem veio da planilha **e mais de 3 pessoas**.
- Congelamento: quando `noite_do_checkin(now()) > evento_data`, a sincronização não muda nada.
- Planilha: só a **primeira aba**. O cabeçalho é achado pelas colunas `NOME` e `CELULAR` (ou `TELEFONE`). A coluna marcada é a que começa com `ADICIONADO`.
- Telefone ambíguo (casa com mais de uma conta): ninguém entra por essa linha, e ela aparece como aviso.
- Migração nova: `supabase/migracoes/043-desafio-de-ingresso.sql`, idempotente, com cabeçalho no padrão das outras ("Rode no SQL Editor. Pode rodar mais de uma vez."). O app precisa funcionar sem ela (padrão `.catch(() => …)`).
- Consultas de tabela inteira no app passam por `todasAsLinhas` (limite de 1000 linhas do PostgREST).
- Textos em pt-BR, no tom do app. Commits **sem nenhuma atribuição ao Claude** (preferência do usuário: sem `Co-Authored-By`).
- O modo demo (`demoApi.ts`) continua funcionando.

## Desvio da spec (decisão do construtor)

A spec fala em "Edge Function nova". Este plano faz o Apps Script chamar **direto** a RPC `sincronizar_planilha_ingresso` pelo PostgREST, com a chave anon pública. A função valida o segredo do desafio (guardado só como hash sha256).

Motivos:
- some uma peça a mais para publicar e manter;
- a regra inteira fica em SQL, testável com PGlite;
- a chave anon já é pública no app, e quem protege é o segredo.

Também diferente da spec: o script manda a **grade crua** (`getDisplayValues`), e quem acha o cabeçalho é o banco. Assim o script fica fixo e burro, e a lógica fica testada.

## Review Focus

1. **Check-in de madrugada:** uma foto às 01:30 de 06/12 conta para a noite de 05/12, no ranking do Espaço Livre e no distintivo. Às 04:01 não conta mais. → Tasks 1 e 3.
2. **Planilha como ela é:** título na linha 1, faixa verde, linhas em branco, cabeçalho só na linha 7, linhas com QT. e sem nome/telefone no fim. → Task 2.
3. **Telefone com +55 copiado do formulário** (`+55 35 99999-8888`, 13 dígitos): `telefone_ddd` devolve null para 12/13 dígitos e a linha seria recusada. A sincronização tira o `55` inicial quando há 12 ou 13 dígitos antes de validar. → Task 2.
4. **Aba renomeada ou planilha esvaziada por engano:** ninguém perde o distintivo, e aparece aviso com "Confirmar remoção". → Task 2.
5. **Participante adicionado à mão no painel:** nunca sai pela sincronização. Mas, se o telefone dele estiver na planilha, passa a ser "da planilha". → Task 2.

---

## Fase 1 — banco

### Task 1: Migração 043, estrutura, segredo, origem e distintivo derivado

**Files:**
- Create: `supabase/migracoes/043-desafio-de-ingresso.sql`
- Modify: `supabase/schema.sql`: acrescentar o mesmo DDL no fim, como as outras migrações
- Modify: `supabase/conferir-migracoes.sql`: entrada `'043 — desafio de ingresso'`, que confere a coluna `challenges.evento_data`
- Modify: `tests/sql/banco.ts`
  - acrescentar `043-desafio-de-ingresso.sql` em `MIGRACOES`;
  - em `BASE`, acrescentar:
    - `profiles.telefone text`;
    - `challenges.entrada_restrita boolean not null default false`;
    - `challenge_members (challenge_id, user_id, entrou_em, pk)`;
    - `challenge_convidados` no formato da migração 010;
    - `alunos_cadastrados (telefone text, nome text, turma text, papel_danca text)`;
    - cópias de `normalizar_telefone` (schema.sql:327), `telefone_ddd`, `telefone_linha` e `telefones_batem` (migração 022).
  - novo helper: `desafioIngresso(db, opcoes)`, que insere um desafio de ingresso e devolve o id.
- Test: `tests/sql/ingresso.test.ts`

**Interfaces:**
- Produces (SQL):
  - `challenges`, colunas novas:
    - `evento_data date`, `evento_inicio time`, `evento_fim time`;
    - `noite_extra_para uuid[] not null default '{}'`;
    - `ingresso_emoji text`, `ingresso_titulo text`, `presenca_emoji text`, `presenca_titulo text`;
    - constraint `challenges_ingresso_completo`: com `evento_data` preenchida, exige `entrada_restrita` e os dois horários.
  - `challenge_members.origem` e `challenge_convidados.origem`: `text not null default 'manual' check (origem in ('manual','planilha'))`.
  - `ingresso_segredos (challenge_id uuid pk references challenges on delete cascade, segredo_hash text not null, criado_em timestamptz default now())`. RLS ligada e **nenhuma** policy.
  - `ingresso_sincronizacoes (challenge_id uuid pk references challenges on delete cascade, em timestamptz not null, resumo jsonb not null)`. Só `select` para `is_organizador()`.
  - `ingresso_presencas (challenge_id uuid references challenges on delete cascade, user_id uuid references profiles on delete cascade, esteve boolean not null, pk (challenge_id, user_id))`. Leitura e escrita só para `is_organizador()`.
  - `gerar_segredo_ingresso(p_desafio uuid) returns text`:
    - só organizador (`'Só a organização liga a planilha'`) e só desafio com `evento_data` (`'Este desafio não é de ingresso'`);
    - gera `replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')`;
    - grava `encode(sha256(convert_to(segredo,'UTF8')),'hex')` com upsert e devolve o segredo em texto.
  - `membro_por_convite(p_user uuid, p_tel text) returns void`, security definer:
    - insere em `challenge_members` os convites que batem, **copiando `origem`**;
    - apaga esses convites.
  - `handle_new_user()`: cópia exata da versão da migração 027, trocando o bloco de convites (linhas do `insert into challenge_members … delete from challenge_convidados`) por `perform public.membro_por_convite(new.id, tel);` com o mesmo `if` de guarda.
  - `ingressos_do_perfil(p_user uuid) returns table (desafio_id uuid, titulo text, estado text, emoji text, titulo_distintivo text, desde timestamptz)`:
    - security definer, `grant execute` para `authenticated`;
    - uma linha por desafio de ingresso em que `p_user` é membro;
    - `estado = 'presenca'` quando há correção `esteve = true`, ou quando não há correção `false` e existe check-in não anulado com `criado_em` dentro do horário da festa;
    - o horário da festa é `(evento_data + evento_inicio) at time zone 'America/Sao_Paulo'` até `(evento_data + (evento_fim < evento_inicio)::int + evento_fim) at time zone 'America/Sao_Paulo'`;
    - senão, `estado = 'garantido'`;
    - `emoji` e `titulo_distintivo` vêm do estado, com `coalesce` para os padrões das Global Constraints;
    - `desde`: no estado `presenca`, é o primeiro check-in que valeu; no estado `garantido`, é `entrou_em`.
  - `marcar_presenca_ingresso(p_desafio uuid, p_user uuid, p_esteve boolean) returns void`: só organizador. `p_esteve null` apaga a correção.

- [ ] **Step 1: Escrever os testes que falham** em `tests/sql/ingresso.test.ts`, no estilo de `tests/sql/caca.test.ts`. O desafio de ingresso tem `evento_data '2026-12-05'`, de `18:00` a `04:00`.
  - `gerar_segredo_ingresso`: aluno recebe erro `'Só a organização liga a planilha'`. Organizador recebe texto de 64 caracteres, e `ingresso_segredos.segredo_hash` = sha256 dele. Uma segunda chamada troca o hash.
  - `ingressos_do_perfil`: membro sem check-in → `estado 'garantido'`, `titulo_distintivo 'Forró na Rep 2026.2 · Ingresso garantido'`, `emoji '🎟️'`.
  - `ingressos_do_perfil`: check-in `'2026-12-05T18:00:00-03:00'` → `'presenca'`. Também `'2026-12-06T01:30:00-03:00'` → `'presenca'` (Review Focus 1). Já `'2026-12-06T04:01:00-03:00'` e `'2026-12-05T17:59:00-03:00'` → `'garantido'`. Check-in anulado no horário → `'garantido'`.
  - Correção: `marcar_presenca_ingresso(…, false)` com check-in válido → `'garantido'`. `true` sem check-in → `'presenca'`. `null` volta ao automático.
  - Quem não é membro não recebe linha.
  - `membro_por_convite`: convite `origem 'planilha'` com telefone `'35999998888'`, chamado com `'(35) 99999-8888'` → membro com `origem 'planilha'`, e o convite é apagado.
  - Constraint: inserir `evento_data` sem `entrada_restrita` falha.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/sql/ingresso.test.ts`. Esperado: FAIL (migração inexistente).
- [ ] **Step 3: Escrever a migração 043** com o cabeçalho explicando o porquê (planilha → desafio, origem, distintivo derivado). Todos os `alter` com `if not exists` e todas as policies com `drop policy if exists`.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run tests/sql`. Esperado: PASS em todos os arquivos (`caca`, `cargoDJ`, `pedidosMusica`, `trilha` continuam verdes com o `BASE` novo).
- [ ] **Step 5: Commit:** `git add supabase tests/sql && git commit -m "Desafio de ingresso: migracao 043 com origem, segredo e distintivo derivado"`

---

### Task 2: Sincronização da planilha (função SQL)

**Files:**
- Modify: `supabase/migracoes/043-desafio-de-ingresso.sql` (e o espelho em `schema.sql`)
- Test: `tests/sql/ingresso.test.ts`

**Interfaces:**
- Consumes: tabelas e colunas da Task 1.
- Produces (SQL):
  - `telefone_da_planilha(t text) returns text`, immutable. Tira tudo que não é dígito. Com 12 ou 13 dígitos começando por `55`, tira o `55`. Devolve os dígitos.
  - `sincronizar_planilha_ingresso(p_segredo text, p_grade jsonb) returns jsonb`. Security definer, `grant execute` para `anon, authenticated`.
    - `p_grade` é um array de linhas, e cada linha é um array de strings (a aba inteira).
    - Segredo inválido → `raise exception 'Segredo inválido'`.
    - Resposta:
      ```json
      { "status": "ok" | "congelado" | "sem_cabecalho",
        "coluna_marcar": 3 | null,
        "linhas": [{ "indice": 7, "situacao": "dentro" | "aguardando_conta" | "telefone_invalido" | "ambiguo" | "repetido" }],
        "removidos": 0, "remocoes_travadas": 0 }
      ```
      `indice` e `coluna_marcar` contam a partir de 0, como na grade.
    - Cabeçalho: a primeira linha em que alguma célula, depois de `upper(trim())` e sem acento (`translate`), é `NOME` e outra é `CELULAR` ou `TELEFONE`. `coluna_marcar` é a célula que começa com `ADICIONADO`.
    - Linhas abaixo do cabeçalho com nome **e** telefone vazios: ignoradas (não aparecem em `linhas`).
    - A chave de cada telefone é `telefone_ddd || telefone_linha` de `telefone_da_planilha(cel)`. Sem DDD ou sem linha de 8 dígitos → `telefone_invalido`. Chave já vista → `repetido`.
    - Perfis com `telefones_batem(profiles.telefone, tel)`:
      - 1 perfil → membro com `origem 'planilha'` (`on conflict` atualiza `origem` para `'planilha'`), situação `dentro`;
      - 0 perfis → convidado com `telefone = normalizar_telefone(tel)`, `telefone_exibicao` = valor da célula, `nome`, `origem 'planilha'`, situação `aguardando_conta`;
      - 2 ou mais → `ambiguo`, sem gravar nada.
    - Remoção: membros e convidados com `origem 'planilha'` cujo telefone não casou com nenhuma chave válida da grade. A trava das Global Constraints vale aqui. Travado → `remocoes_travadas = n` e ninguém sai.
    - `status 'congelado'`: calcula `linhas` lendo o estado atual, sem gravar nem remover.
    - Grava o upsert em `ingresso_sincronizacoes`. O `resumo` tem: `status`, `dentro`, `aguardando`, `invalidos` e `ambiguos` como `[{ "linha": indice+1, "nome": … }]`, `removidos`, `remocoes_travadas` e `chaves` (array das chaves válidas, usado pela próxima função).
  - `confirmar_remocoes_ingresso(p_desafio uuid) returns int`: só organizador. Remove quem é `origem 'planilha'` e está fora de `resumo->'chaves'` da última sincronização, zera `remocoes_travadas` no resumo e devolve quantos saíram.

- [ ] **Step 1: Escrever os testes que falham.** Grade de base (Review Focus 2): linha 0 `['LISTA DESAFIO FORRÓ NA REP','','','']`, linha 1 `['APP …','','','']`, linhas 2–5 vazias, linha 6 `['QT.','NOME','CELULAR','ADICIONADO NO DESAFIO']`, e daí em diante pessoas de teste com telefones fictícios. As duas últimas linhas são `['9','','','FALSE']`.
  - Cabeçalho na linha 6 → `coluna_marcar 3`. As linhas `['9','','','FALSE']` não aparecem.
  - Conta com `'35999998888'` e linha `'35 99999-8888'` → `dentro`, com membro `origem 'planilha'`.
  - `'+55 35 98888-7777'` sem conta → `aguardando_conta`, e o convidado tem `telefone_exibicao '+55 35 98888-7777'` (Review Focus 3).
  - `'99999-8888'` (sem DDD) → `telefone_invalido`. O resumo traz `invalidos [{linha: 9, nome: …}]`.
  - O mesmo telefone em duas grafias → a segunda é `repetido`.
  - Duas contas antigas sem DDD com a mesma linha → `ambiguo`, sem membro novo.
  - Membro manual com o telefone na planilha → vira `origem 'planilha'`. Membro manual fora da planilha continua depois de qualquer sincronização (Review Focus 5).
  - Remoção: com 10 da planilha, uma grade sem 1 deles → removido (`removidos 1`).
  - Trava: grade sem nenhuma linha válida → `remocoes_travadas 10`, todos ficam (Review Focus 4). Grade sem 4 de 10 → travada. `confirmar_remocoes_ingresso` como organizador → devolve 4 e eles saem.
  - Grade sem cabeçalho → `status 'sem_cabecalho'`, nada muda.
  - Congelado: com `now()` depois de 05/12, a função devolve `status 'congelado'` e não grava. Para controlar o "agora", ponha a comparação numa função `public.ingresso_agora() returns timestamptz` (`select now()`) que o teste substitui com `create or replace`.
  - Segredo errado → erro `'Segredo inválido'`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/sql/ingresso.test.ts`
- [ ] **Step 3: Implementar as três funções** na migração 043, com comentários sobre a trava e o congelamento ligados à spec.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run tests/sql`
- [ ] **Step 5: Commit:** `git commit -am "Desafio de ingresso: sincronizacao da planilha com trava e congelamento"`

---

## Fase 2 — app (essencial para 05/12)

### Task 3: Noite extra no cálculo de janela

**Files:**
- Create: `src/lib/ingresso.ts`
- Modify: `src/lib/types.ts` (tipos novos em `Challenge` e `ChallengeInput`)
- Modify: `src/lib/dates.ts` (`janelaDoCheckin`)
- Test: `tests/lib/ingresso.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface NoiteExtra { data: string; hora_inicio: string; hora_fim: string } // "AAAA-MM-DD", "HH:MM"
  export interface TextoDistintivo { emoji: string; titulo: string }
  export interface IngressoConfig {
    evento_data: string; evento_inicio: string; evento_fim: string
    noite_extra_para: string[]           // ids de desafios
    garantido: TextoDistintivo; presenca: TextoDistintivo
  }
  // Challenge ganha: ingresso: IngressoConfig | null; noites_extras: NoiteExtra[]
  // ChallengeInput ganha: ingresso: IngressoConfig | null
  export interface IngressoPerfil {
    desafio_id: string; titulo: string; estado: 'garantido' | 'presenca'
    emoji: string; titulo_distintivo: string; desde: string | null
  }
  // ingresso.ts
  export function textosPadraoIngresso(titulo: string): { garantido: TextoDistintivo; presenca: TextoDistintivo }
  export function noiteDoEvento(cfg: IngressoConfig): NoiteExtra
  export function aplicarNoitesExtras(desafios: Challenge[]): Challenge[]
  export function badgeDeIngresso(i: IngressoPerfil): Badge
  ```
- `aplicarNoitesExtras` devolve cópias. Cada desafio de ingresso recebe a própria noite em `noites_extras`, e cada id de `noite_extra_para` também recebe a noite. Ids que não existem são ignorados. A mesma noite não entra duas vezes.
- `badgeDeIngresso`:
  - `id: 'ingresso-<desafio_id>'` (o mesmo nos dois estados, para o destaque não se perder);
  - `emoji` e `titulo` vêm da linha;
  - `tipo 'Forró na Rep'`, ou seja, o título do desafio;
  - `descricao`: `'Garantiu o ingresso'` ou `'Marcou presença na festa'`;
  - `alcancadoEm: desde`;
  - `regra`: `'Entra quem está na lista de ingressos. Evolui com check-in no horário da festa.'`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/lib/ingresso.test.ts`:
  - `textosPadraoIngresso('Forró na Rep 2026.2')`: garantido `{emoji:'🎟️', titulo:'Forró na Rep 2026.2 · Ingresso garantido'}`, presença `{emoji:'🎉', titulo:'Forró na Rep 2026.2 · Marquei presença'}`.
  - `aplicarNoitesExtras` com um desafio Espaço Livre (janela de sábado 20:00–23:30, período 01/08–20/12) e um de ingresso (`noite_extra_para: [espacoLivre.id]`, 05/12 18:00–04:00): os dois ficam com `noites_extras` `[{data:'2026-12-05', hora_inicio:'18:00', hora_fim:'04:00'}]`. Rodar duas vezes não duplica.
  - `janelaDoCheckin` no Espaço Livre já com a noite extra: `2026-12-05T18:30-03:00` → `'2026-12-05'` (antes do horário normal); `2026-12-06T01:30-03:00` → `'2026-12-05'`; `2026-12-06T04:01-03:00` → `null`; sábado `2026-12-12T18:30` → `null` (a extensão vale só naquela data); `2026-12-12T21:00` → `'2026-12-12'` (a janela normal continua).
  - `janelaDoCheckin` no próprio desafio de ingresso, sem janelas: `2026-12-05T19:00-03:00` → `'2026-12-05'`.
  - Noite extra com o dia em `suspensos` continua valendo (o evento é marcado de propósito).
  - `badgeDeIngresso` nos dois estados: mesmo `id`, `emoji` e `titulo` diferentes.
  - Use datas construídas como nos testes que já existem (`new Date(2026, 11, 5, 18, 30)`, no fuso local do teste), sem depender do fuso da máquina.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/ingresso.test.ts`
- [ ] **Step 3: Implementar.** Em `janelaDoCheckin`, antes do laço de `c.janelas`, testar `c.noites_extras ?? []`. A noite que atravessa a meia-noite (`fim < inicio`) aceita a ponta da noite na própria data e a ponta da manhã na data seguinte até `fim`. A noite extra não depende de `data_inicio`/`data_fim` nem de `suspensos`. Comentário explicando o Forró na Rep.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run`. Esperado: PASS em tudo, inclusive os testes antigos que constroem `Challenge` (acrescente `ingresso: null, noites_extras: []` nos construtores de teste que o `tsc` apontar).
- [ ] **Step 5: Commit:** `git commit -am "Desafio de ingresso: noite extra no calculo de janela"`

---

### Task 4: API (Supabase e demo)

**Files:**
- Modify: `src/lib/api.ts` (interface)
- Modify: `src/lib/supabaseApi.ts` (`mapChallenge`, `listChallenges`, `saveChallenge`, `janelasValidasPorMembro`, métodos novos)
- Modify: `src/lib/demoApi.ts` (os mesmos métodos)
- Test: `tests/lib/demoIngresso.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (na interface `Api`):
  ```ts
  gerarSegredoIngresso(desafioId: string): Promise<string>
  statusSincronizacao(desafioId: string): Promise<StatusSincronizacao | null>
  confirmarRemocoesIngresso(desafioId: string): Promise<number>
  ingressosDoPerfil(userId: string): Promise<IngressoPerfil[]>
  marcarPresencaIngresso(desafioId: string, userId: string, esteve: boolean | null): Promise<void>
  // types.ts
  export interface StatusSincronizacao {
    em: string; status: 'ok' | 'congelado' | 'sem_cabecalho'
    dentro: number; aguardando: number
    invalidos: { linha: number; nome: string }[]; ambiguos: { linha: number; nome: string }[]
    removidos: number; remocoes_travadas: number
  }
  ```
- `mapChallenge`:
  - lê as colunas novas: `ingresso` vira `null` quando `evento_data` é nulo;
  - horários com `horaCurta`;
  - textos nulos caem em `textosPadraoIngresso(titulo)`.
- `listChallenges` devolve `aplicarNoitesExtras(...)`.
- `saveChallenge` grava as colunas novas. Desafio que não é de ingresso grava tudo nulo e `noite_extra_para '{}'`.
- `janelasValidasPorMembro`: o `fim` da consulta passa a ser o maior entre `data_fim T23:59:59` e o fim da última noite extra (a madrugada do dia seguinte).
- `ingressosDoPerfil` chama a RPC `ingressos_do_perfil` com `.catch(() => [])`, para funcionar sem a migração.
- `statusSincronizacao` lê `ingresso_sincronizacoes`. Sem linha → `null`.
- No demo:
  - `gerarSegredoIngresso` devolve `'demo-' + id`;
  - `statusSincronizacao` → `null`;
  - `ingressosDoPerfil` segue a mesma regra da Task 1, usando os check-ins e as correções do demo.

- [ ] **Step 1: Escrever os testes que falham** em `tests/lib/demoIngresso.test.ts`, no estilo de `demoCaca.test.ts`:
  - salvar um desafio de ingresso no demo e listar → volta com `ingresso` preenchido e `noites_extras` de 1 noite;
  - o Espaço Livre indicado em `noite_extra_para` também volta com a noite;
  - membro com check-in às 01:30 de 06/12 → `ingressosDoPerfil` dá `estado 'presenca'`;
  - `marcarPresencaIngresso(…, false)` → `'garantido'`;
  - ranking do Espaço Livre no demo dá 1 ponto ao check-in das 18:30 de 05/12.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/demoIngresso.test.ts`
- [ ] **Step 3: Implementar** nos dois `Api`.
- [ ] **Step 4: Rodar:** `npx vitest run && npx tsc -p tsconfig.json --noEmit`. Esperado: PASS, sem erro de tipo.
- [ ] **Step 5: Commit:** `git commit -am "Desafio de ingresso: API real e demo"`

---

### Task 5: Formulário e tela do desafio

**Files:**
- Modify: `src/components/ChallengeForm.tsx`
- Modify: `src/pages/ChallengeDetailPage.tsx`
- Modify: `src/pages/ChallengesPage.tsx` (rótulo do card)

**Interfaces:**
- Consumes: `IngressoConfig`, `textosPadraoIngresso`, `api.listChallenges` (para a lista de alvos da noite extra).

Comportamento:
- **Formulário:** uma caixa "Desafio de ingresso (clube, sem ranking)". Marcada, ela:
  - força `entrada_restrita = true`;
  - esconde janelas, modalidades e local;
  - mostra data do evento, início e fim (padrão `18:00` e `04:00`);
  - mostra os dois distintivos (emoji + título), pré-preenchidos com `textosPadraoIngresso(titulo)`, que se atualizam enquanto o título muda até o organizador editar;
  - mostra "A noite da festa também vale em:", uma lista de caixas com os outros desafios cujo período inclui a data do evento, pré-marcados.
- **Validação:** `evento_data` entre `data_inicio` e `data_fim`. Sem a exigência de janela quando é ingresso (hoje `form.janelas.length === 0` bloqueia, `ChallengeForm.tsx:159`).
- **Tela do desafio** (`ingresso` preenchido):
  - no lugar do ranking e das abas de modalidade: o distintivo da própria pessoa (via `api.ingressosDoPerfil(meuId)`, filtrado pelo desafio), "Festa em 05/12, das 18:00 às 04:00" e a lista de quem está no clube, com ✓ em quem já marcou presença;
  - essa lista vem de `getRanking(desafio, 'checkin')`: quem tem pontos > 0 marcou presença, porque o próprio desafio de ingresso só tem a noite extra como janela.
- **Card na lista:** "🎟️ Clube" em vez do contador de ranking.

- [ ] **Step 1: Implementar** formulário, tela e card.
- [ ] **Step 2: Verificar no navegador** (modo demo, `npm run dev`):
  - criar "Forró na Rep 2026.2" de ingresso com o Espaço Livre marcado;
  - abrir a tela: não aparece ranking, aparecem a data, o horário e o clube vazio;
  - editar e conferir que os campos voltam preenchidos.

  Tirar uma captura de tela.
- [ ] **Step 3: Rodar** `npx tsc -p tsconfig.json --noEmit && npx vitest run`. Esperado: PASS.
- [ ] **Step 4: Commit:** `git commit -am "Desafio de ingresso: formulario e tela de clube"`

---

### Task 6: Distintivo no perfil

**Files:**
- Modify: `src/lib/badges.ts` (`computeBadges` aceita `ingressos?: IngressoPerfil[]`)
- Modify: `src/lib/perfilStats.ts:124` e `src/pages/ProfilePage.tsx:86` (carregar `api.ingressosDoPerfil(userId)` e passar)
- Modify: `src/lib/destaques.ts` (`raridade`: `ingresso-` vale `2.5`, entre caça e especial)
- Test: `tests/lib/badges.test.ts`, `tests/lib/destaques.test.ts`

- [ ] **Step 1: Escrever os testes que falham:**
  - `computeBadges({ …, ingressos: [garantido2026_2, presenca2027_1] })` gera dois distintivos `ingresso-…`, logo depois dos personalizados, com os títulos das linhas;
  - em `destaques.test.ts`, um salvo `['ingresso-X']` continua escolhido depois de a linha passar de `garantido` para `presenca`;
  - sem escolha salva, ingresso vem antes de marco e depois de `custom-`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/badges.test.ts tests/lib/destaques.test.ts`
- [ ] **Step 3: Implementar** com `badgeDeIngresso` (Task 3).
- [ ] **Step 4: Rodar e ver passar** `npx vitest run`, e conferir no demo: o perfil do membro mostra 🎟️, e com um check-in na noite mostra 🎉.
- [ ] **Step 5: Commit:** `git commit -am "Desafio de ingresso: distintivo no perfil"`

---

### Task 7: Painel, ligar a planilha e acompanhar

**Files:**
- Create: `src/lib/scriptPlanilha.ts`
- Create: `src/components/SincronizacaoPlanilha.tsx`
- Modify: `src/pages/ChallengeDetailPage.tsx` (área do organizador, perto de `ParticipantesDesafio`, linha ~400, só quando `desafio.ingresso`)
- Test: `tests/lib/scriptPlanilha.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function idDaPlanilha(link: string): string | null
  export function montarScriptPlanilha(p: { supabaseUrl: string; anonKey: string; segredo: string; planilhaId: string }): string
  ```
- O script gerado (texto de Apps Script, ES5) tem duas funções:
  - `sincronizar()`:
    - lê `SpreadsheetApp.openById(ID).getSheets()[0].getDataRange().getDisplayValues()`;
    - faz POST em `<url>/rest/v1/rpc/sincronizar_planilha_ingresso` com os cabeçalhos `apikey` e `Authorization: Bearer <anon>` e o corpo `{ p_segredo, p_grade }`, usando `muteHttpExceptions: true`;
    - código diferente de 200 → `throw` com o corpo (o Google manda e-mail de falha ao dono);
    - com `coluna_marcar`, para cada linha da resposta grava `situacao === 'dentro'` na célula, **só se o valor mudou**, e um `try/catch` em volta da escrita para quem só tem leitura.
  - `instalar()`: apaga os gatilhos antigos de `sincronizar` e cria `ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create()`. Depois chama `sincronizar()` uma vez.

- [ ] **Step 1: Escrever os testes que falham:**
  - `idDaPlanilha('https://docs.google.com/spreadsheets/d/ABC_def-123/edit?usp=sharing')` → `'ABC_def-123'`;
  - `idDaPlanilha('qualquer coisa')` → `null`;
  - `montarScriptPlanilha(...)` contém o id, o segredo, a URL e `everyMinutes(5)`, e passa em `new Function(script)` (é JS válido).
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/scriptPlanilha.test.ts`
- [ ] **Step 3: Implementar `scriptPlanilha.ts`.**
- [ ] **Step 4: Implementar `SincronizacaoPlanilha.tsx`:**
  - Campo para o link da planilha e botão "Gerar script". Se já houve sincronização, confirmar antes, avisando que o script antigo para de funcionar. O botão chama `gerarSegredoIngresso` e mostra o script com botão "Copiar".
  - Passo a passo, em 5 itens:
    1. abrir script.google.com e criar um projeto;
    2. apagar o conteúdo e colar o script;
    3. salvar;
    4. escolher `instalar` e clicar em Executar;
    5. autorizar com a conta que tem acesso à planilha.
  - Situação, com `statusSincronizacao`:
    - "Última sincronização há N min", mais `dentro` e `aguardando conta`;
    - lista de linhas puladas ("Linha 9 — Fulano: telefone sem DDD"; "…: telefone bate com mais de uma conta, adicione à mão");
    - aviso de `remocoes_travadas` com o botão "Confirmar remoção" (`confirmarRemocoesIngresso`, com confirmação);
    - `congelado`: "A festa já passou: a sincronização parou. Pode desligar o gatilho no Apps Script."
  - Sem sincronização há mais de 30 min (depois de ter havido alguma): aviso em destaque.
- [ ] **Step 5: Verificar** com `tsc` e `vitest`. No navegador (demo): a seção aparece só no desafio de ingresso e para organizador, gera o script e copia. Captura de tela.
- [ ] **Step 6: Commit:** `git commit -am "Desafio de ingresso: painel para ligar a planilha"`
- [ ] **Step 7: Ensaio real (com o Felipe):**
  1. rodar a migração 043 no SQL Editor;
  2. "Reload schema cache";
  3. criar o desafio 2026.2;
  4. gerar o script e instalar com a conta dele;
  5. conferir no painel a contagem e as caixinhas marcadas na planilha;
  6. conferir que o distintivo aparece num perfil da lista.

  Este passo depende do Felipe. Registrar o resultado.

---

## Fase 3 — acabamento (pode entrar depois de a sincronização estar no ar)

### Task 8: Comemoração ao abrir o app

**Files:**
- Create: `src/components/FolhaIngresso.tsx` (usa `Folha` e `BotaoAcao` de `./ui`, como `FolhaFuncao.tsx`)
- Create: `src/lib/ingressoVisto.ts`
- Modify: `src/components/Layout.tsx` (monta a folha)
- Test: `tests/lib/ingressoVisto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function chaveVisto(i: IngressoPerfil): string   // `ingresso-visto:${desafio_id}:${estado}`
  export function proximaComemoracao(ingressos: IngressoPerfil[], vistos: (chave: string) => boolean): IngressoPerfil | null
  ```
- Prioridade: `presenca` não vista vem antes de `garantido` não visto. Ver a de `presenca` também marca a de `garantido` como vista.
- `localStorage` sempre dentro de `try/catch`. Sem armazenamento, não mostra nada (melhor que mostrar sempre).
- No Layout: carrega `ingressosDoPerfil(meuId)` ao montar e a cada mudança de `location.pathname`, no máximo uma vez por minuto.
- Textos:
  - garantido: "Seu ingresso pro {titulo} está confirmado! 🎟️", com "O distintivo já está no seu perfil.";
  - presença: "Você marcou presença no {titulo}! 🎉".
  - Botões: "Ver no perfil" e "Fechar".

- [ ] **Step 1: Testes que falham** para `proximaComemoracao`: nada novo → `null`; garantido não visto → ele; presença e garantido não vistos → presença; já vistos → `null`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/ingressoVisto.test.ts`
- [ ] **Step 3: Implementar** o módulo, a folha e o Layout.
- [ ] **Step 4: Verificar** com `vitest` e `tsc`. No demo: um membro novo vê a folha uma vez, e ela não volta ao recarregar. Captura de tela.
- [ ] **Step 5: Commit:** `git commit -am "Desafio de ingresso: comemoracao ao abrir o app"`

### Task 9: Correção manual de presença e conferência final

**Files:**
- Modify: `src/components/ParticipantesDesafio.tsx`. Quando `desafio.ingresso`, cada membro ganha um seletor de três estados: "Automático", "Esteve lá" e "Não esteve". O estado vem de `getRanking` e das correções, e a gravação usa `marcarPresencaIngresso`.
- Modify: `src/lib/api.ts`, `supabaseApi.ts`, `demoApi.ts`: `correcoesPresencaIngresso(desafioId): Promise<Map<string, boolean>>`, lendo `ingresso_presencas`.
- Modify: `README.md`: seção curta "Forró na Rep: ligar a planilha", com o que fazer a cada semestre.

- [ ] **Step 1: Teste no demo** (`tests/lib/demoIngresso.test.ts`): `correcoesPresencaIngresso` devolve o que `marcarPresencaIngresso` gravou, e `null` remove.
- [ ] **Step 2: Implementar** e rodar `npx vitest run && npm run build`. Esperado: PASS e build sem erro.
- [ ] **Step 3: Verificar no navegador** (demo): marcar "Não esteve" para quem tem check-in faz o distintivo voltar a 🎟️.
- [ ] **Step 4: Commit:** `git commit -am "Desafio de ingresso: correcao manual de presenca e instrucoes"`
