import { describe, expect, it } from 'vitest'
import { idDaPlanilha, montarScriptPlanilha } from '../../src/lib/scriptPlanilha'

describe('idDaPlanilha', () => {
  it('extrai o id do link', () => {
    expect(
      idDaPlanilha('https://docs.google.com/spreadsheets/d/ABC_def-123/edit?usp=sharing'),
    ).toBe('ABC_def-123')
  })
  it('devolve null para texto sem link de planilha', () => {
    expect(idDaPlanilha('qualquer coisa')).toBeNull()
  })
})

describe('montarScriptPlanilha', () => {
  const script = montarScriptPlanilha({
    supabaseUrl: 'https://abc.supabase.co',
    anonKey: 'anon-key-1',
    segredo: 'segredo-xyz',
    planilhaId: 'ABC_def-123',
  })

  it('embute id, segredo, url e gatilho de 5 minutos', () => {
    expect(script).toContain('ABC_def-123')
    expect(script).toContain('segredo-xyz')
    expect(script).toContain('https://abc.supabase.co/rest/v1/rpc/sincronizar_planilha_ingresso')
    expect(script).toContain('everyMinutes(5)')
    expect(script).toContain('function sincronizar()')
    expect(script).toContain('function instalar()')
  })

  it('é JS válido', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('escapa aspas nos valores embutidos', () => {
    const s = montarScriptPlanilha({
      supabaseUrl: 'https://x.co',
      anonKey: 'a"b',
      segredo: "s'\\n",
      planilhaId: 'id',
    })
    expect(() => new Function(s)).not.toThrow()
  })
})

// ---------- O script rodando contra stubs do Apps Script ----------

type Resp = {
  status: string
  coluna_marcar: number | null
  linhas: { indice: number; situacao: string }[]
}

/**
 * Aba falsa: `valores` é a grade de valores (booleanos nas caixas). A
 * grade exibida sai dela como numa planilha em português (VERDADEIRO /
 * FALSO). Conta toda chamada ao serviço de planilhas, para o teste
 * provar que o custo não cresce com o número de linhas.
 */
function abaFalsa(valores: unknown[][], opcoes: { soLeitura?: boolean } = {}) {
  const chamadas: string[] = []
  const escritas: { a1: string; valor: unknown }[] = []
  const letraParaColuna = (l: string) =>
    [...l].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
  const negar = () => {
    if (opcoes.soLeitura) throw new Error('sem permissão')
  }
  const aba = {
    getDataRange() {
      chamadas.push('getDataRange')
      return {
        getDisplayValues() {
          chamadas.push('getDisplayValues')
          return valores.map((l) =>
            l.map((v) => (v === true ? 'VERDADEIRO' : v === false ? 'FALSO' : String(v))),
          )
        },
      }
    },
    getRange(linha: number, coluna: number, nLinhas = 1, nColunas = 1) {
      chamadas.push('getRange')
      return {
        getValue() {
          chamadas.push('getValue')
          return valores[linha - 1][coluna - 1]
        },
        setValue(v: unknown) {
          chamadas.push('setValue')
          negar()
          valores[linha - 1][coluna - 1] = v
        },
        getValues() {
          chamadas.push('getValues')
          return Array.from({ length: nLinhas }, (_, i) =>
            Array.from({ length: nColunas }, (_, j) => valores[linha - 1 + i][coluna - 1 + j]),
          )
        },
        setValues(m: unknown[][]) {
          chamadas.push('setValues')
          negar()
          m.forEach((l, i) =>
            l.forEach((v, j) => {
              valores[linha - 1 + i][coluna - 1 + j] = v
            }),
          )
        },
      }
    },
    getRangeList(a1s: string[]) {
      chamadas.push('getRangeList')
      return {
        setValue(v: unknown) {
          chamadas.push('setValue')
          negar()
          for (const a1 of a1s) {
            const m = /^([A-Z]+)(\d+)$/.exec(a1)
            if (!m) throw new Error(`A1 inválido: ${a1}`)
            valores[Number(m[2]) - 1][letraParaColuna(m[1])] = v
            escritas.push({ a1, valor: v })
          }
        },
      }
    },
  }
  return { aba, chamadas, escritas }
}

function rodar(valores: unknown[][], resposta: Resp, opcoes: { soLeitura?: boolean } = {}) {
  const { aba, chamadas, escritas } = abaFalsa(valores, opcoes)
  let enviado: { p_grade: string[][] } | null = null
  const SpreadsheetApp = { openById: () => ({ getSheets: () => [aba] }) }
  const UrlFetchApp = {
    fetch(_url: string, op: { payload: string }) {
      enviado = JSON.parse(op.payload)
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(resposta) }
    },
  }
  const script = montarScriptPlanilha({
    supabaseUrl: 'https://abc.supabase.co',
    anonKey: 'anon',
    segredo: 'seg',
    planilhaId: 'id',
  })
  const sincronizar = new Function(
    'SpreadsheetApp',
    'UrlFetchApp',
    'ScriptApp',
    `${script}\nreturn sincronizar;`,
  )(SpreadsheetApp, UrlFetchApp, {}) as () => void
  sincronizar()
  return { valores, chamadas, escritas, enviado: enviado as { p_grade: string[][] } | null }
}

describe('sincronizar (script gerado)', () => {
  // Cabeçalho na linha 1 (índice 0); caixas na coluna D (índice 3)
  const base = (): unknown[][] => [
    ['QT.', 'NOME', 'CELULAR', 'ADICIONADO NO DESAFIO'],
    ['1', 'Ana', '35 99000-0001', false],
    ['2', 'Beto', '35 99000-0002', true],
    ['3', 'Cida', '35 99000-0003', true],
    ['4', 'Davi', '35 99000-0004', false],
  ]

  it('manda a grade exibida e marca a célula certa (índice e coluna 0-based)', () => {
    const r = rodar(base(), {
      status: 'ok',
      coluna_marcar: 3,
      linhas: [{ indice: 1, situacao: 'dentro' }],
    })
    expect(r.enviado?.p_grade[2][3]).toBe('VERDADEIRO')
    expect(r.escritas).toEqual([{ a1: 'D2', valor: true }])
    expect(r.valores[1][3]).toBe(true)
  })

  it('compara booleanos, não o texto exibido: o que já está certo não é reescrito', () => {
    const r = rodar(base(), {
      status: 'ok',
      coluna_marcar: 3,
      linhas: [
        { indice: 2, situacao: 'dentro' },
        { indice: 4, situacao: 'aguardando_conta' },
      ],
    })
    expect(r.escritas).toEqual([])
    expect(r.chamadas).not.toContain('setValue')
    expect(r.chamadas).not.toContain('setValues')
  })

  it('só escreve o que mudou e não mexe em quem não veio na resposta', () => {
    const r = rodar(base(), {
      status: 'ok',
      coluna_marcar: 3,
      linhas: [
        { indice: 1, situacao: 'dentro' },
        { indice: 2, situacao: 'aguardando_conta' },
        { indice: 4, situacao: 'aguardando_conta' },
      ],
    })
    expect(r.escritas).toEqual([
      { a1: 'D2', valor: true },
      { a1: 'D3', valor: false },
    ])
    // Cida (índice 3) não veio na resposta: continua marcada
    expect(r.valores.map((l) => l[3])).toEqual(['ADICIONADO NO DESAFIO', true, false, true, false])
  })

  it('o número de chamadas à planilha não cresce com as linhas', () => {
    const valores: unknown[][] = [['NOME', 'CELULAR', 'ADICIONADO']]
    for (let i = 0; i < 300; i++) valores.push([`P${i}`, '35 99000-0000', i % 2 === 0])
    const r = rodar(valores, {
      status: 'ok',
      coluna_marcar: 2,
      linhas: Array.from({ length: 300 }, (_, i) => ({
        indice: i + 1,
        situacao: i % 3 === 0 ? 'dentro' : 'aguardando_conta',
      })),
    })
    expect(r.chamadas.length).toBeLessThanOrEqual(8)
    expect(r.chamadas).not.toContain('getValue')
    expect(r.valores.slice(1).map((l) => l[2])).toEqual(
      Array.from({ length: 300 }, (_, i) => i % 3 === 0),
    )
  })

  it('coluna depois do Z vira AA, AB…', () => {
    const vazia = () => Array.from({ length: 28 }, () => '' as unknown)
    const cab = vazia()
    cab[27] = 'ADICIONADO'
    const linha = vazia()
    linha[27] = false
    const r = rodar([cab, linha], {
      status: 'ok',
      coluna_marcar: 27,
      linhas: [{ indice: 1, situacao: 'dentro' }],
    })
    expect(r.escritas).toEqual([{ a1: 'AB2', valor: true }])
  })

  it('sem coluna de marcar não lê nem escreve nada além da grade', () => {
    const r = rodar(base(), {
      status: 'ok',
      coluna_marcar: null,
      linhas: [{ indice: 1, situacao: 'dentro' }],
    })
    expect(r.chamadas).toEqual(['getDataRange', 'getDisplayValues'])
  })

  it('conta só de leitura: a escrita falha em silêncio', () => {
    expect(() =>
      rodar(
        base(),
        { status: 'ok', coluna_marcar: 3, linhas: [{ indice: 1, situacao: 'dentro' }] },
        { soLeitura: true },
      ),
    ).not.toThrow()
  })
})
