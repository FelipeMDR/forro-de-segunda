# Vídeo-aulas — design

Design visual aprovado: canvas "Vídeo-aulas Forró de Segunda" (https://claude.ai/artifact/PEnPHf9Y9BpHKFqkMuYcUG).

## O problema

Os alunos pedem um lugar para rever os passos ensinados em aula. Liberar tudo de uma vez faz o aluno "queimar a largada" e ir para passos mais difíceis do que já aprendeu. Ao mesmo tempo, quem mais frequenta merece poder adiantar o próximo passo.

## Decisões

1. **Vídeos ficam no YouTube**, como **não listados**, no canal do projeto. O app guarda só o ID do vídeo, o nome do passo, a ordem e uma dica curta. Uma trilha inteira são algumas dezenas de linhas, quase nada no plano free do Supabase. Nenhum arquivo de vídeo passa pelo Supabase Storage.
2. **A trava é de tela, não de cofre.** Quem tiver o link do YouTube assiste, como em qualquer vídeo não listado. A trava existe para guiar o aluno, não para proteger conteúdo. Por isso a regra de "quando abre" roda no app (TypeScript), igual a presença (`lib/presenca.ts`). O banco só confere o que dá vantagem a alguém: gastar chave.
3. **Trilha por nível, datas por turma.** Cada passo pertence a um nível (`iniciante`, `intermediario`, `avancado`) e tem uma ordem. Cada turma tem um nível e uma "primeira aula da trilha". A aula nº *n* da turma é o passo de ordem *n* do nível.
4. **As datas saem da Agenda.** As aulas da turma são os eventos semanais da agenda com `turma = T` (`events.dia_semana`) a partir de `trilha_inicio`.
   - Uma data com cancelamento (`feriados` com `turma = T` ou `null`) não conta como aula.
   - Uma **reposição** é um evento de data única da turma com `events.reposicao_de` preenchido, e conta como aula na data dela.
   - Sem reposição, os passos seguintes andam uma semana. Com reposição, o passo vai para o dia da reposição e o resto não muda.
5. **Quando um passo abre para o aluno:**
   - **aberto:** a data dele chegou em **alguma** turma do aluno daquele nível; ou foi liberado com chave; ou o nível é **menor** que o maior nível das turmas do aluno (revisão); ou a pessoa pode editar a trilha (professores e organização veem tudo);
   - **chave:** é o **primeiro** passo da fila de compra ainda não comprado, tem `pode_chave` e tem vídeo. Não há limite de dias. A fila é o resto do nível do aluno (o que a turma ainda não viu) seguido dos níveis acima;
   - **bloqueado:** todo o resto, com a data prevista quando houver.
6. **Chaves** (por semestre, desde o último "Encerrar semestre"):
   - **+1 presença:** cada noite de presença válida (`datasDePresenca`, a mesma regra do perfil);
   - **+1 parceria:** cada noite com pelo menos uma dupla confirmada (no máximo 1 por noite);
   - **+1 nova parceria:** cada pessoa com quem a primeira dupla confirmada caiu neste semestre.
   - **3 pontos = 1 chave** por padrão; a organização muda pelo painel (tabela `trilha_regras`, uma linha).
   - **Custo em dobro:** o 1º passo da fila custa 1 chave, o 2º custa 2, o 3º custa 4… contando a partir da turma (o preço não muda quando o aluno compra o anterior e cai quando a turma avança). Vale igual para iniciante, intermediário e avançado. A compra é sempre na ordem e, depois do último passo do nível, segue no nível seguinte.
   - Saldo = chaves ganhas − soma dos preços pagos no semestre (`trilha_liberacoes.custo`).
7. **Gastar chave** é uma função no banco (`liberar_passo_com_chave(passo, custo)`). O preço vem do app, que é onde mora o calendário; o banco confere que é 1, 2, 4… e que o aluno tem chaves para pagar. Ela recusa se o aluno não tem saldo. O saldo é contado por cima: noites com check-in não anulado em vez da presença por janela. Assim o banco nunca recusa uma chave que o app mostra, e ninguém ganha chaves forjando chamadas.
8. **Quem edita:** a gestão (passos, cronogramas e regras das chaves) fica só no Painel da organização, em `/organizador/videoaulas`, pelo celular. Professores e quem dá aula veem a trilha toda aberta, mas não editam pelo app.
9. **Cancelar aula na Agenda** ganha a escolha "Sem reposição" ou "Repor em outro dia" (data e hora), com o aviso do efeito na trilha. Só existe quando o cancelamento é de uma turma específica.

## Fora do escopo (YAGNI)

- Velocidade e "repetir trecho" próprios: o player do YouTube já tem.
- "Marcar como praticado": fica no aparelho (localStorage), sem banco.
