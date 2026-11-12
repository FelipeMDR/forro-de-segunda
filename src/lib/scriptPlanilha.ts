/**
 * Gerador do Apps Script que liga a planilha de ingressos ao banco.
 * O script roda na conta Google da organização, a cada 5 minutos, e chama
 * a função `sincronizar_planilha_ingresso` direto no PostgREST.
 */

/** Extrai o id de uma planilha a partir do link do Google Sheets. */
export function idDaPlanilha(link: string): string | null {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(link)
  return m ? m[1] : null
}

/** Literal de string JS seguro para embutir no script. */
const lit = (s: string) => JSON.stringify(s)

export function montarScriptPlanilha(p: {
  supabaseUrl: string
  anonKey: string
  segredo: string
  planilhaId: string
}): string {
  const url = `${p.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/sincronizar_planilha_ingresso`
  return `// Forro de Segunda: sincroniza a planilha de ingressos com o app.
// Gerado pelo painel do desafio. Nao compartilhe: o segredo abaixo
// autoriza a sincronizacao. Gerar um script novo invalida este.
var PLANILHA_ID = ${lit(p.planilhaId)};
var URL_RPC = ${lit(url)};
var CHAVE = ${lit(p.anonKey)};
var SEGREDO = ${lit(p.segredo)};

function sincronizar() {
  var aba = SpreadsheetApp.openById(PLANILHA_ID).getSheets()[0];
  var grade = aba.getDataRange().getDisplayValues();
  var resposta = UrlFetchApp.fetch(URL_RPC, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE },
    payload: JSON.stringify({ p_segredo: SEGREDO, p_grade: grade }),
    muteHttpExceptions: true
  });
  if (resposta.getResponseCode() !== 200) {
    throw new Error('Sincronizacao falhou: ' + resposta.getContentText());
  }
  var r = JSON.parse(resposta.getContentText());
  if (r.coluna_marcar === null || r.coluna_marcar === undefined) return;
  var linhas = r.linhas || [];
  if (linhas.length === 0 || grade.length === 0) return;

  // Uma leitura so da coluna das caixas. O gatilho roda 288 vezes por
  // dia: ler e escrever celula por celula estoura a cota do Google.
  // getValues traz booleanos (a tela mostra VERDADEIRO/FALSO numa
  // planilha em portugues, por isso nada de comparar o texto exibido).
  var col = r.coluna_marcar;
  var atuais = aba.getRange(1, col + 1, grade.length, 1).getValues();
  var marcar = [];
  var desmarcar = [];
  for (var i = 0; i < linhas.length; i++) {
    var k = linhas[i].indice;
    if (k < 0 || k >= atuais.length) continue;
    var dentro = linhas[i].situacao === 'dentro';
    // So o que mudou; linha fora da resposta nem entra na lista
    if (atuais[k][0] !== dentro) {
      (dentro ? marcar : desmarcar).push(celulaA1(k, col));
    }
  }
  // No maximo duas escritas, so nas celulas que mudaram: formulas e
  // edicoes feitas a mao no resto da coluna ficam como estao.
  // Quem so tem leitura nao derruba a sincronizacao.
  try {
    if (marcar.length > 0) aba.getRangeList(marcar).setValue(true);
    if (desmarcar.length > 0) aba.getRangeList(desmarcar).setValue(false);
  } catch (e) {
    return;
  }
}

// Linha e coluna 0-based para A1 (coluna 0 = A, 26 = AA)
function celulaA1(linha, coluna) {
  var letras = '';
  var n = coluna + 1;
  while (n > 0) {
    var resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras + (linha + 1);
}

function instalar() {
  var gatilhos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < gatilhos.length; i++) {
    if (gatilhos[i].getHandlerFunction() === 'sincronizar') {
      ScriptApp.deleteTrigger(gatilhos[i]);
    }
  }
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create();
  sincronizar();
}
`
}
