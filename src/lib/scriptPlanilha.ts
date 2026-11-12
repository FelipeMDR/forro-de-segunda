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
  for (var i = 0; i < linhas.length; i++) {
    var dentro = linhas[i].situacao === 'dentro';
    var celula = aba.getRange(linhas[i].indice + 1, r.coluna_marcar + 1);
    // So escreve se mudou; quem so tem leitura nao derruba a sincronizacao
    if (celula.getValue() !== dentro) {
      try {
        celula.setValue(dentro);
      } catch (e) {
        return;
      }
    }
  }
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
