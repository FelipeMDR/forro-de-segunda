# Caça aos professores — design

Design visual: canvas "Caça aos Professores" (https://claude.ai/artifact/CMgmqazeBKmxaMR2WCkpc1), com cinco telas: o perfil com o emblema, o detalhe do emblema, o aviso de função no perfil, a escolha de função e o painel.

## O problema

Os alunos têm receio de chamar os professores para dançar, por medo de errar. O emblema dá um motivo e uma desculpa para chamar ("tô caçando o emblema!"): quanto mais professores diferentes o aluno pegar, mais ele sobe.

O emblema é permanente, mas cada um é de um semestre, porque a equipe muda de um semestre para o outro. "🏅 Caça completa · 2º semestre de 2026" fala da equipe daquele semestre.

**Começa a valer no 2º semestre de 2026** (o atual). O 1º semestre de 2026 não usava o app, então não há nada retroativo.

## Decisões

1. **Gatilho: a dupla confirmada que já existe.** Conta a dupla marcada pelos dois lados (`duplas.confirmada`, migração 016), a mesma regra do Rodízio e da Forródex. O app não ganha nenhum fluxo novo para registrar a dança.
2. **Quem é caçado: quem tem o cargo Professor(a).** Monitores e diretoria não são caçados: o objetivo é perder a vergonha de chamar professor. A equipe é identificada pelo **cargo** (`profile_cargos`, reconhecido por palavra como em `pesoCargo`, `includes('professor')`), não por `turma_professores`, que também inclui monitores. Pessoas são contadas uma vez cada, mesmo dando aula em duas turmas (hoje Felipe e Larissa).
3. **A meta é o papel oposto ao do aluno.** Quem conduz caça os professores conduzidos, e quem é conduzido caça os professores condutores. Assim dá para completar sem trocar de papel. Hoje são 14 professores, 7 de cada lado.
4. **Escada de níveis** (só o maior alcançado aparece, como os outros marcos — `marcoAlcancado` em `lib/badges.ts`):

   | Nível | Emoji | Título | Mínimo |
   | --- | --- | --- | --- |
   | 1 | 🎯 | Primeiro professor | 1 professor do lado oposto |
   | 2 | 🌗 | Meia equipe | ⌈meta ÷ 2⌉ do lado oposto (hoje 4) |
   | 3 | 🏅 | Caça completa | todos do lado oposto (hoje 7) |
   | 4 (secreto) | 🏆 | Equipe inteira | todos os professores, dos dois papéis (hoje 14, ou 13 para quem é professor) |

   Os mínimos saem do tamanho da equipe, não são números fixos. Nos níveis 1 a 3 só contam professores do lado oposto. Os nomes foram escolhidos pelo Felipe. Os emojis são escolha minha e podem mudar (👑 e 🪗 já são de cargos, 🪩 e 🌟 são do Rodízio).
4a. **Equipe inteira é um easter egg.** Ninguém deve saber que ele existe até ganhar:
    - a trilha do detalhe mostra **3 níveis**;
    - a regra escrita não fala dele;
    - em Caça completa, o emblema não mostra barra nem "faltam" (parece o topo);
    - só quem alcança vê o 🏆, e aí a trilha passa a mostrar 4 níveis, com o último como surpresa;
    - nada no código do cliente precisa esconder o nível, porque o app é aberto e quem ler o código descobre. O segredo é só de tela.
5. **Papel de quem tem turma: o que já está no perfil.** Vale o `papel_danca` da turma. Se a pessoa estiver em turmas com papéis diferentes, vale o papel da turma de **nível mais alto**. Por exemplo, quem é Conduzido(a) no Avançado e Condutor(a) no Intermediário caça como Conduzido(a). O nível vem de `turmas.nivel` (migração 036). Para turma sem nível, vale a ordem de `pesoTurma` (`lib/forrodex.ts`). Turma com `papel_danca` vazio não conta. A regra fica numa função só no TS e é repetida igual no SQL do congelamento.
5a. **Papel de quem não tem turma: a função principal**, escolhida pela própria pessoa **no perfil**, não dentro da caça (itens 6 a 8). **Só quem está sem turma vê essa escolha.** Isso inclui veteranos, professores e todo mundo logo depois do "Encerrar semestre". Sem papel nenhum, a pessoa fica fora da caça até escolher. *Minha escolha:* quem tem turma, mas todas com `papel_danca` vazio, também fica fora, até a organização preencher.
5b. **Todo mundo caça, professores inclusive** (pedido do Felipe). O professor caça os outros professores do lado oposto e nunca conta a si mesmo, nem na meta nem na Equipe inteira. Monitores e diretoria caçam como qualquer aluno.
6. **Papel principal (novo):** coluna `profiles.papel_principal` (`'Condutor(a)' | 'Conduzido(a)' | null`, o mesmo `PapelDanca`). A pessoa edita o próprio, e a organização edita o de qualquer um. A policy `profiles_update` já permite isso. É o mesmo campo para alunos e professores: o papel do professor na caça é o `papel_principal` dele, marcado pela organização no painel ou por ele mesmo.
7. **Função principal é uma coisa do perfil, separada da caça** (pedido do Felipe). Ela serve para duas coisas: dar à pessoa o **distintivo de função** (item 8) e, de quebra, definir quem ela caça.
   - **Aviso** (tela "Perfil · aviso de função"): quem está sem turma e sem `papel_principal` vê no topo do próprio perfil o cartão "Qual a sua função na dança? Escolha pra ganhar o seu distintivo de função". Ele some quando a pessoa escolhe. *Minha escolha:* o aviso fica só no próprio perfil, sem notificação ou aviso em outras telas.
   - **Escolha** (tela "Escolher a função"): uma folha simples com dois botões grandes ("🕺 Condutor(a)" / "💃 Conduzido(a)"), o botão "Salvar" e "Dá pra trocar quando quiser no perfil". A folha não fala da caça.
   - **Trocar depois:** pela tela de conta (`ContaPage`), num seletor que só aparece para quem está sem turma.
7a. **Onde a caça aparece no próprio perfil** *(minha escolha)*: diferente dos outros marcos, o emblema do semestre atual aparece **também no nível 0**, só no perfil da própria pessoa:
    - sem turma e sem função: um cartão "🎯 Caça aos professores · Escolha sua função para entrar". Tocar abre a mesma folha de função do item 7;
    - com papel: um cartão "0 de 7 professores", com barra.

    No perfil dos outros, ele só aparece a partir do nível 1.
7b. **Sem selo "Novo"** nos cartões de distintivo (pedido do Felipe).
8. **Distintivo de função** (novo, automático): para quem está sem turma e tem `papel_principal`, aparece um distintivo "🕺 Condutor(a)" ou "💃 Conduzido(a)", com descrição "Função principal na dança" e tipo "Função". Ele fica na mesma posição do distintivo de turma, que é onde quem tem turma já vê a sua função ("💃 Conduzido(a) Avançado"). Quem tem turma não ganha o distintivo de função: o de turma já mostra a mesma coisa.
9. **Ao vivo durante o semestre:** o emblema do semestre atual é calculado no app, igual aos outros marcos. Ele usa as duplas confirmadas desde `inicioSemestreAtual()` (sempre o semestre, mesmo quando a Forródex está presa a um desafio) e a equipe atual (cargo + `papel_principal`). Tem barra de progresso ("faltam 3 para 🏅 Caça completa") e trilha de 3 níveis no detalhe (ver 4a).
10. **Detalhe do emblema** (tela "Detalhe do emblema"): reaproveita `DetalheDistintivo` e acrescenta "Já dançou com" (avatares) e "Faltam" (avatares tracejados) com os professores do lado oposto. Rótulo do tipo: "Caça aos professores · 2º semestre de 2026".
11. **Congelado no "Encerrar semestre":** antes de apagar as matrículas, `encerrarSemestre` chama uma função nova no banco (`guardar_caca_do_semestre()`, mesmo padrão de `guardar_niveis_do_semestre`, migração 040). Ela grava:
    - a **equipe** do semestre: professor, papel;
    - o **resultado** de cada aluno que chegou ao nível 1: nível, quantos pegou, meta, tamanho da equipe;
    - o **período**: `inicio` (último encerramento ou nulo) e `fim` (agora).

    O rótulo vem de `rotuloDoSemestre(inicio)` (`lib/retrospectiva.ts`), a mesma lógica da retrospectiva, como o Felipe pediu. Por isso o emblema acompanha o semestre do projeto, mesmo que o 1º semestre termine em julho. O semestre costuma ser encerrado em dezembro. Por isso, desde a correção de 24/10, um semestre que começa em novembro ou dezembro conta como o 1º do ano seguinte (`semestreDe`). Na mesma correção, a retrospectiva passou a contar do penúltimo ao último encerramento (`inicioDoSemestreEncerrado`). O congelamento usa o mesmo período. Depois de congelado, o emblema não muda mais: mudar a equipe ou o papel de alguém não reescreve o passado.
12. **Um emblema por semestre.** O perfil mostra o emblema do semestre atual (ao vivo) e um emblema fixo para cada semestre encerrado em que a pessoa chegou ao nível 1, com o semestre no rótulo.
13. **Painel** (tela "Painel · papel dos professores"): em Turmas e cargos, uma seção "Caça aos professores" lista quem tem o cargo Professor(a), com um seletor Conduz / Conduzido(a) por pessoa e um aviso quando falta o papel de alguém ("2 professores sem papel — eles ainda não contam na caça de ninguém"). Professor sem papel não entra na meta nem na equipe.

## Fora do escopo

- Monitores e diretoria como caçados. Dá para acrescentar depois como extra.
- Emblema retroativo do 1º semestre de 2026.
- Notificação ao subir de nível.
- Ranking ou desafio de caça.
- Filtro "Professores" na Forródex.

## Para o construtor decidir

- A forma exata das tabelas de congelamento, os nomes e o RLS. O padrão do projeto é: todos leem o que aparece em perfil, e só a organização ou funções `security definer` escrevem.
- Como manter o modo demo (`demoApi.ts`) igual ao banco, como nas outras funções.
- Os testes, seguindo `tests/lib/badges.test.ts` e `tests/sql/`.
- A entrada da migração em `supabase/conferir-migracoes.sql`. A próxima migração é a 041.
