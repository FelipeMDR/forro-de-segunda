# Caça aos professores — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o emblema automático "Caça aos professores", que mostra o progresso ao vivo durante o semestre e fica congelado no "Encerrar semestre". Junto vêm a função principal no perfil (com aviso e distintivo de função) e a marcação do papel dos professores no painel.

**Architecture:** A regra fica num módulo puro, `src/lib/caca.ts`. Ele é usado no perfil, para o progresso ao vivo, e no encerramento, para congelar. O banco só guarda: a coluna `profiles.papel_principal`, as tabelas de congelamento e uma função que grava o resultado. Quem calcula o resultado congelado é o app da organização, no "Encerrar semestre", com a mesma função do perfil. Assim a regra existe num lugar só (ver "Desvio da spec").

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Supabase (Postgres + RLS), Vitest e PGlite nos testes de SQL.

**Spec:** `docs/superpowers/specs/2026-10-24-caca-aos-professores-design.md`. Mockup: https://claude.ai/artifact/CMgmqazeBKmxaMR2WCkpc1

## Global Constraints

- Conta só a dupla com `duplas.confirmada = true`, dentro do semestre.
- Caçado é quem tem cargo que contém "professor" (sem diferenciar maiúscula, como `pesoCargo`) **e** `papel_principal` preenchido.
- Escada: 🎯 Primeiro professor (1) · 🌗 Meia equipe (⌈meta/2⌉) · 🏅 Caça completa (meta) · 🏆 Equipe inteira (toda a equipe menos a própria pessoa). O nível 4 é secreto.
- `meta` = professores do papel oposto ao da pessoa, sem contar ela mesma.
- Papel de quem tem turma: o `papel_danca` da turma de nível mais alto que tenha papel. Sem turma: `papel_principal`. Com turma, mas sem nenhum papel: fora da caça.
- A escolha de função (aviso, folha e seletor na conta) só aparece para quem está **sem turma**.
- O tipo do emblema é "Caça aos professores · {rotuloDoSemestre(inicio)}".
- Não há selo "Novo" nos cartões.
- A caça começa no semestre atual. Não há carga retroativa.
- Textos em pt-BR, no mesmo tom do app. Commits sem atribuição ao Claude (preferência do usuário).
- A migração nova é a `041-caca-aos-professores.sql`. Tudo o que depende dela precisa continuar funcionando sem ela (padrão `.catch(() => …)` do projeto).

## Desvio da spec (decisão do construtor, avisada ao Felipe)

A spec item 11 diz que `encerrarSemestre` "chama uma função nova no banco" e que a regra se repete em SQL. Este plano calcula o congelamento **no app da organização**, com `caca.ts`, e manda o resultado pronto para a função `guardar_caca_do_semestre(jsonb)`, que só aceita organizador.

Motivos:
- a regra fica num lugar só, sem uma cópia em plpgsql que possa divergir da do perfil;
- a organização já é de confiança: ela já concede distintivos à mão.

A função continua sendo chamada antes de apagar as matrículas, como pede a spec.

## Review Focus

1. **Meta zero:** nenhum professor do lado oposto tem papel marcado. Nesse caso não há emblema nem cartão de nível 0. Não pode aparecer barra dividida por zero. → Task 1.
2. **Meta pequena:** com meta 1, os mínimos 1/1/1 colapsam. A trilha mostra só os níveis com mínimo diferente, e o maior alcançado é "Caça completa". → Task 1.
3. **Professor caçando:** ele nunca conta a si mesmo, nem na meta nem no total. O professor sem `papel_principal` não é caçado. → Task 1.
4. **Dupla com quem deixou de ser professor no meio do semestre:** o ao vivo usa a equipe atual, e o congelado usa a equipe no momento do encerramento. Uma dupla com ex-professor não conta. → Task 1.
5. **Encerrar semestre sem a migração 041:** o encerramento segue normalmente, sem congelar e sem erro para a organização. → Task 6.

---

### Task 1: Regra da caça (módulo puro)

**Files:**
- Create: `src/lib/caca.ts`
- Modify: `src/lib/forrodex.ts`: exportar `pesoTurma` (hoje é `function pesoTurma`)
- Test: `tests/lib/caca.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProfessorCaca { user_id: string; nome: string; avatar_url: string | null; papel: PapelDanca }
  export interface ProgressoCaca {
    meta: ProfessorCaca[]        // lado oposto, sem eu
    pegos: ProfessorCaca[]       // da meta, com dupla confirmada
    faltam: ProfessorCaca[]      // da meta, sem dupla
    totalEquipe: number          // equipe inteira sem eu
    pegosEquipe: number          // da equipe inteira, com dupla
    nivel: 0 | 1 | 2 | 3 | 4
  }
  export function papelEfetivo(turmas: TurmaMembro[], papelPrincipal: PapelDanca | null, turmasCadastradas: Turma[]): PapelDanca | null
  export function equipeDaCaca(perfis: Pick<PerfilPublico, 'id' | 'nome' | 'avatar_url' | 'cargos' | 'papel_principal'>[]): ProfessorCaca[]
  export function progressoCaca(meuId: string, meuPapel: PapelDanca, equipe: ProfessorCaca[], parceiros: Set<string>): ProgressoCaca
  export interface MarcoCaca { minimo: number; emoji: string; titulo: string }
  export function marcosDaCaca(meta: number, totalEquipe: number, incluirSecreto: boolean): MarcoCaca[]
  export const EMOJI_CACA = { primeiro: '🎯', meia: '🌗', completa: '🏅', equipe: '🏆' } as const
  ```
- Consumes: `PapelDanca`, `TurmaMembro`, `Turma`, `PerfilPublico` de `types.ts` (Task 2 acrescenta `papel_principal` a `Profile`; nesta task, declare o campo direto em `types.ts` como `papel_principal?: PapelDanca | null` para compilar).

- [ ] **Step 1: Escrever os testes que falham** em `tests/lib/caca.test.ts`:
  - `papelEfetivo` — sem turma usa o papel principal: `([], 'Conduzido(a)', [])` → `'Conduzido(a)'`; `([], null, [])` → `null`.
  - `papelEfetivo` — o nível mais alto vence: turmas `[{turma:'Avançado',papel_danca:'Conduzido(a)'},{turma:'Intermediário',papel_danca:'Condutor(a)'}]` com `turmasCadastradas` `nivel` avancado/intermediario → `'Conduzido(a)'`. Também vale sem `nivel` cadastrado (cai em `pesoTurma`).
  - `papelEfetivo` — turma sem papel não conta: `[{turma:'Avançado',papel_danca:null},{turma:'Iniciante',papel_danca:'Condutor(a)'}]` → `'Condutor(a)'`. Só turmas sem papel, mesmo com `papelPrincipal` preenchido, → `null`.
  - `equipeDaCaca` — entra só quem tem cargo com "professor" **e** `papel_principal`. "Professor(a)" e "professora" entram. "Monitor(a)" não. Professor com `papel_principal: null` não entra.
  - `progressoCaca` — com 14 professores (7/7), eu `Conduzido(a)` e parceiros com 4 condutores mais 1 conduzido: `meta.length 7`, `pegos.length 4`, `faltam.length 3`, `nivel 2`, `totalEquipe 14`, `pegosEquipe 5`.
  - `progressoCaca` — nível 3 com 7/7 condutores e nível 4 só com os 14.
  - `progressoCaca` — professor caçando (Review Focus 3): eu na equipe como `Condutor(a)`, com `meuPapel` `Condutor(a)`. Então `meta` = 7 conduzidos, `totalEquipe 13`, e a dupla consigo mesmo é ignorada.
  - `progressoCaca` — meta zero (Review Focus 1): equipe só de condutores, eu condutor → `nivel 0`, `meta.length 0`.
  - `progressoCaca` — ex-professor (Review Focus 4): parceiro fora de `equipe` não conta.
  - `marcosDaCaca(7, 14, false)` → mínimos `[1, 4, 7]`. `(7, 14, true)` → `[1, 4, 7, 14]`. `(1, 2, false)` → um marco só, `{minimo:1, titulo:'Caça completa'}` (Review Focus 2). `(2, 4, false)` → `[1, 2]` com títulos `Primeiro professor` e `Caça completa`.

- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/caca.test.ts`. Esperado: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `src/lib/caca.ts`.**
  - Nível da turma: `avancado 3 > intermediario 2 > iniciante 1`, por `turmasCadastradas.find(t => t.nome === turma)?.nivel`. Sem `nivel`, desempate por `pesoTurma` (menor = mais alto).
  - `nivel` 1 a 3 vem de `marcosDaCaca(meta.length, totalEquipe, false)` aplicado a `pegos.length`. Para o 4, exige `totalEquipe > 0 && pegosEquipe === totalEquipe`.
  - Em `marcosDaCaca`, quando dois marcos têm o mesmo mínimo, fica o de título mais alto.
  - Comentário no topo explicando a regra, no estilo de `lib/badges.ts`.

- [ ] **Step 4: Rodar e ver passar:** `npx vitest run tests/lib/caca.test.ts`. Esperado: PASS.

- [ ] **Step 5: Commit:** `git add src/lib/caca.ts src/lib/forrodex.ts src/lib/types.ts tests/lib/caca.test.ts && git commit -m "Caca aos professores: regra de nivel e meta"`

---

### Task 2: Migração 041

**Files:**
- Create: `supabase/migracoes/041-caca-aos-professores.sql`
- Modify: `supabase/schema.sql`: acrescentar o mesmo DDL no fim, como as outras migrações
- Modify: `supabase/conferir-migracoes.sql`: entrada `'041 — caça aos professores'`, que confere `pg_proc` de `guardar_caca_do_semestre`
- Modify: `tests/sql/banco.ts`: acrescentar `041-caca-aos-professores.sql` em `MIGRACOES` e criar `profile_turmas (user_id uuid, turma text, papel_danca text, primary key (user_id, turma))` em `BASE`
- Test: `tests/sql/caca.test.ts`

**Interfaces:**
- Produces (SQL):
  - `profiles.papel_principal text check (papel_principal in ('Condutor(a)','Conduzido(a)'))`, que pode ser nulo;
  - `caca_semestres (id uuid pk default gen_random_uuid(), inicio timestamptz null, fim timestamptz not null default now())`;
  - `caca_equipe (semestre_id uuid references caca_semestres on delete cascade, user_id uuid references profiles on delete cascade, papel text not null, primary key (semestre_id, user_id))`;
  - `caca_resultados (semestre_id uuid references caca_semestres on delete cascade, user_id uuid references profiles on delete cascade, nivel int not null check (nivel between 1 and 4), pegos int not null, meta int not null, total_equipe int not null, primary key (semestre_id, user_id))`;
  - `guardar_caca_do_semestre(p jsonb) returns uuid`: security definer, recusa quem não é organizador com `'Só a organização encerra o semestre'`. O formato de `p` é `{"inicio": iso|null, "equipe": [{"user_id","papel"}], "resultados": [{"user_id","nivel","pegos","meta","total_equipe"}]}`. Grava tudo numa transação e devolve o id do semestre.
  - RLS: as três tabelas têm `select` para `authenticated` (aparecem em perfil) e nenhuma policy de escrita (só a função escreve).

- [ ] **Step 1: Escrever os testes que falham** em `tests/sql/caca.test.ts`, seguindo `cargoDJ.test.ts`:
  - organizador grava: depois da chamada, `caca_resultados` tem as linhas enviadas e `caca_semestres.inicio` igual ao enviado;
  - aluno chamando → erro `'Só a organização encerra o semestre'`;
  - `papel_principal = 'Outro'` é recusado pelo check; `null` é aceito;
  - `nivel 0` em resultados é recusado pelo check (só o nível ≥ 1 é gravado).
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/sql/caca.test.ts`. Esperado: FAIL, a migração não existe.
- [ ] **Step 3: Escrever a migração**, idempotente (`if not exists`, `drop policy if exists`), com cabeçalho no formato da 040 explicando o que é e por que o app calcula.
- [ ] **Step 4: Rodar:** `npx vitest run tests/sql`. Esperado: tudo PASS, inclusive os testes antigos.
- [ ] **Step 5: Commit:** `git commit -m "Migracao 041: papel principal e congelamento da caca"`, com os arquivos acima.

---

### Task 3: API (tipos, Supabase e demo)

**Files:**
- Modify: `src/lib/types.ts`: `Profile.papel_principal: PapelDanca | null` (o campo deixa de ser opcional) e `CacaCongelada`
- Modify: `src/lib/api.ts`, `src/lib/supabaseApi.ts`, `src/lib/demoApi.ts`
- Test: `tests/lib/demoCaca.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CacaCongelada { inicio: string | null; fim: string; nivel: 1|2|3|4; pegos: number; meta: number; total_equipe: number }
  // ForroApi
  definirPapelPrincipal(userId: string, papel: PapelDanca | null): Promise<void>
  duplasConfirmadasEntre(desde: string | null, ate: string): Promise<{ de_user: string; para_user: string }[]>
  cacaCongeladaDe(userId: string): Promise<CacaCongelada[]>   // mais recente primeiro
  guardarCacaDoSemestre(p: { inicio: string | null; equipe: { user_id: string; papel: PapelDanca }[]; resultados: { user_id: string; nivel: number; pegos: number; meta: number; total_equipe: number }[] }): Promise<void>
  ```
- Supabase:
  - `papel_principal` entra em `PROFILE_SELECT_PUBLICO` e em `mapProfile`, com `?? null`. Sem a 041, a coluna não existe: o select público quebraria. Por isso, siga o mesmo plano B do `turmas_ensino`: busque `papel_principal` numa consulta separada, que tolera erro (`papelPrincipalPorUsuario(): Map`), em vez de pôr no select.
  - `duplasConfirmadasEntre` usa `todasAsLinhas` (teto de 1000 do PostgREST) com `confirmada = true`, `gte('data', desde.slice(0,10))` quando houver `desde`, e `lte('data', ate.slice(0,10))`.
  - `cacaCongeladaDe` faz `caca_resultados` com embed de `caca_semestres(inicio, fim)` e devolve `[]` se der erro.
- Demo: `db.cacaSemestres`, `db.cacaResultados` e `papel_principal` nos perfis. Comece com `null` e marque os professores de exemplo do seed com um papel.

- [ ] **Step 1: Testes que falham** em `tests/lib/demoCaca.test.ts`, seguindo `demoTrilha.test.ts`:
  - `definirPapelPrincipal` grava e `getProfile` devolve o valor;
  - um aluno definindo o papel de **outra** pessoa → erro `'Só a organização define a função de outra pessoa'`;
  - `guardarCacaDoSemestre` seguido de `cacaCongeladaDe` devolve a linha;
  - `duplasConfirmadasEntre` ignora as não confirmadas e as fora do período.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/demoCaca.test.ts`.
- [ ] **Step 3: Implementar nas duas APIs.** No Supabase, `definirPapelPrincipal` é um `update profiles set papel_principal where id`: a policy `profiles_update` já cobre o dono e o organizador.
- [ ] **Step 4: Rodar:** `npx tsc -b && npx vitest run tests/lib`. Esperado: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Caca aos professores: API de papel principal e congelamento"`

---

### Task 4: Distintivos (função e caça)

**Files:**
- Modify: `src/lib/badges.ts`, `src/lib/types.ts` (`Badge.caca`)
- Test: `tests/lib/badges.test.ts`

**Interfaces:**
- Consumes: `ProgressoCaca` e `marcosDaCaca` (Task 1), `CacaCongelada` (Task 3), `rotuloDoSemestre` (`lib/retrospectiva.ts`).
- Produces: novos campos opcionais em `computeBadges(input)`:
  ```ts
  papelPrincipal?: PapelDanca | null
  cacaAtual?: { progresso: ProgressoCaca | null; inicio: string | null; proprio: boolean; semPapel: boolean }
  cacasCongeladas?: CacaCongelada[]
  ```
  `Badge.caca?: { pegos: ProfessorCaca[]; faltam: ProfessorCaca[]; abrirFuncao?: boolean }`
- Ids: `funcao`, `caca-atual` e `caca-<inicio ?? 'inicio'>`.

- [ ] **Step 1: Testes que falham**, novos `describe` em `badges.test.ts`:
  - **função:**
    - `turmas: []`, `papelPrincipal: 'Conduzido(a)'` → distintivo `{emoji:'💃', titulo:'Conduzido(a)', descricao:'Função principal na dança', tipo:'Função'}`, logo depois dos cargos e distintivos especiais;
    - com turma → não aparece;
    - sem papel → não aparece.
  - **caça ao vivo:**
    - nível 2 → `{emoji:'🌗', titulo:'Meia equipe', descricao:'4 de 7 professores', tipo:'Caça aos professores · 2º semestre de 2026'}` para `inicio = '2026-07-20T22:00:00Z'`;
    - `progresso.rotulo` é `'faltam 3 para 🏅 Caça completa'`;
    - a `trilha.marcos` tem 3 níveis.
  - **easter egg:**
    - nível 3 → sem `progresso`, trilha de 3, e nenhum texto do badge (`regra`, `descricao`, `progresso`) contém "Equipe inteira";
    - nível 4 → `🏆 Equipe inteira`, trilha de 4.
  - **nível 0:**
    - `proprio: true` com meta > 0 → cartão `🎯 Caça aos professores` com descrição `'0 de 7 professores'`;
    - `proprio: false` → nada;
    - `semPapel: true` e `proprio: true` → descrição `'Escolha sua função para entrar'` e `caca.abrirFuncao: true`;
    - meta zero → nada.
  - **congelados:** uma `CacaCongelada` com `inicio '2026-07-20T22:00:00Z'`, nível 3 → `🏅 Caça completa`, `descricao '7 de 7 professores'`, tipo com "2º semestre de 2026", sem `progresso`.- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/badges.test.ts`.
- [ ] **Step 3: Implementar.**
  - A `regra` da caça é exatamente: `'Conta professores diferentes do papel oposto ao seu, com dupla confirmada pelos dois lados. Vale o semestre todo.'`
  - A ordem no array é: cargos, especiais, função/turma, caça atual, caças congeladas (mais recente primeiro), presença, rodízio, DJ.
- [ ] **Step 4: Rodar:** `npx vitest run tests/lib/badges.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Distintivos de funcao e da caca aos professores"`

---

### Task 5: Perfil (dados, detalhe, aviso e escolha de função)

**Files:**
- Modify: `src/lib/perfilStats.ts`, `src/pages/ProfilePage.tsx`, `src/pages/UserProfilePage.tsx`, `src/components/PerfilResumo.tsx`, `src/pages/ContaPage.tsx`
- Create: `src/components/FolhaFuncao.tsx`

**Interfaces:**
- `carregarPerfilStats(api, userId, turmas, cargos, opcoes?: { papelPrincipal?: PapelDanca | null; proprio?: boolean })`. Em paralelo com o que já busca, também carrega:
  - `listPerfisPublicos()`;
  - `listTurmas()`;
  - `inicioSemestreAtual()`;
  - `parceirosDe(userId, inicio ?? criado_em)`, um segundo pedido recortado no semestre;
  - `cacaCongeladaDe(userId)`.

  Todos com `.catch` para o valor vazio. Com isso monta `cacaAtual` via `papelEfetivo`, `equipeDaCaca` e `progressoCaca`.
- `FolhaFuncao({ aberta, onFechar, atual, onSalvar }: { aberta: boolean; onFechar: () => void; atual: PapelDanca | null; onSalvar: (p: PapelDanca) => Promise<void> })` usa a `Folha` de `ui.tsx`. O texto segue o mockup "Escolher a função":
  - título "Qual a sua função na dança?";
  - subtítulo "Vira um distintivo no seu perfil, igual ao de quem está numa turma.";
  - botões "🕺 Condutor(a)" / "💃 Conduzido(a)";
  - "Salvar";
  - "Dá pra trocar quando quiser no perfil."

Não há teste de unidade para a tela. A verificação é a Task 7.

- [ ] **Step 1: `carregarPerfilStats`** passa os campos novos para `computeBadges`. `ProfilePage` passa `{ papelPrincipal: profile.papel_principal, proprio: true }`, e `UserProfilePage` passa `{ papelPrincipal: p.papel_principal }`.
- [ ] **Step 2: Detalhe:** em `DetalheDistintivo` (`PerfilResumo.tsx`), quando `b.caca` existir, mostrar depois da trilha:
  - "Já dançou com": avatares com `Avatar` e o primeiro nome;
  - "Faltam": avatares em contorno tracejado.

  Tocar num avatar leva a `/perfil/:id`. Esse bloco não aparece no nível 4. Depois disso a lista de "Faltam" do lado oposto fica vazia de qualquer jeito.
- [ ] **Step 3: Aviso e folha no `ProfilePage`:**
  - o cartão do mockup "Perfil · aviso de função" fica entre o cabeçalho e os distintivos e só aparece com `profile.turmas.length === 0 && !profile.papel_principal`;
  - tocar abre `FolhaFuncao`;
  - salvar chama `api.definirPapelPrincipal(userId, p)`, depois `refreshProfile()` e o toast `'Função salva!'`;
  - o cartão de caça com `abrirFuncao` abre a mesma folha. Para isso, `BadgeGrid` ganha a prop `onAbrirFuncao?: () => void` e a chama em vez de abrir o detalhe.
- [ ] **Step 4: `ContaPage`:** uma `LinhaConta` "Função na dança", só para quem está sem turma, que abre a `FolhaFuncao`.
- [ ] **Step 5: Rodar:** `npx tsc -b && npx vitest run`. Esperado: PASS.
- [ ] **Step 6: Commit:** `git commit -m "Perfil: funcao principal, aviso e detalhe da caca"`

---

### Task 6: Painel e congelamento no encerramento

**Files:**
- Modify: `src/pages/painel/TurmasCargosPage.tsx` (`CargosPage`), `src/lib/caca.ts`, `src/lib/supabaseApi.ts`, `src/lib/demoApi.ts`
- Test: `tests/lib/caca.test.ts` (novo `describe`) e `tests/lib/demoCaca.test.ts`

**Interfaces:**
- Produces, em `caca.ts`:
  ```ts
  export function resultadosDaCaca(perfis: PerfilPublico[], turmas: Turma[], duplas: { de_user: string; para_user: string }[]): { equipe: { user_id: string; papel: PapelDanca }[]; resultados: { user_id: string; nivel: number; pegos: number; meta: number; total_equipe: number }[] }
  ```
  Só entram resultados com `nivel ≥ 1`. Professores entram como caçadores também.

- [ ] **Step 1: Testes que falham:**
  - `resultadosDaCaca` com 4 professores (2/2) e 3 alunos. O aluno com 2 condutores fica em `nivel 3`. O sem papel não aparece. O professor que dançou com os outros 3 fica em `nivel 4`.
  - No demo, `encerrarSemestre` deixa uma linha em `cacaCongeladaDe` para quem tinha nível ≥ 1, e isso acontece **antes** de zerar as turmas: o papel veio da turma.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run tests/lib/caca.test.ts tests/lib/demoCaca.test.ts`.
- [ ] **Step 3: Implementar.**
  - `encerrarSemestre`, nas duas APIs, roda logo depois de `guardar_niveis_do_semestre` e antes de apagar as matrículas. Ele busca:
    - `inicioSemestreAtual()`;
    - `listPerfisPublicos()` (já com `papel_principal`);
    - `listTurmas()`;
    - `duplasConfirmadasEntre(inicio, agora)`.

    Depois roda `resultadosDaCaca` e `guardarCacaDoSemestre`.
  - No Supabase, se o erro for a função inexistente (`/guardar_caca_do_semestre/`), siga sem congelar, com o mesmo padrão da 040 (Review Focus 5). Qualquer outro erro interrompe.
- [ ] **Step 4: Painel:** seção "Caça aos professores" no fim de `CargosPage`, igual ao mockup "Painel · papel dos professores":
  - lista quem tem cargo com "professor", com um seletor de dois botões "🕺 Conduz" / "💃 Conduzido(a)" que chama `api.definirPapelPrincipal(p.id, papel)` e depois `recarregar.pessoas()`;
  - mostra o aviso `'{n} professor(es) sem papel — eles ainda não contam na caça de ninguém.'` quando `n > 0`.
- [ ] **Step 5: Rodar:** `npx tsc -b && npx vitest run`. Esperado: PASS.
- [ ] **Step 6: Commit:** `git commit -m "Caca aos professores: painel e congelamento no encerramento"`

---

### Task 7: Verificação no app (modo demo)

- [ ] **Step 1:** `preview_start` com `{name: "demo"}`, entrar como organizador demo e marcar o papel de dois professores no painel.
- [ ] **Step 2:** Entrar como um aluno sem turma e ver o aviso no perfil. Escolher a função e conferir:
  - o distintivo de função aparece;
  - o aviso some;
  - o cartão da caça mostra "0 de N".
- [ ] **Step 3:** Marcar dupla com um professor do lado oposto, com os dois lados confirmando, e conferir 🎯. Abrir o detalhe: "Já dançou com" e "Faltam", trilha de 3 níveis, sem selo "Novo".
- [ ] **Step 4:** Como organizador, "Encerrar semestre". De volta ao aluno, o emblema aparece fixo com "Caça aos professores · {semestre}" e sem barra.
- [ ] **Step 5:** Tirar screenshot de cada estado para mostrar ao Felipe.
