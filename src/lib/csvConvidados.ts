import { dividirLinhaCSV } from './csvImport'
import { nucleoTelefone, telefoneValido } from './phone'

export interface LinhaConvidado {
  nome: string
  telefone: string
}

export interface ResultadoConvidados {
  linhas: LinhaConvidado[]
  avisos: string[]
}

/**
 * Lê a lista de quem comprou ingresso. Colunas: nome e telefone — com
 * cabeçalho em qualquer ordem ou sem cabeçalho (ordem fixa:
 * nome;telefone). Separador ; ou , (detectado).
 *
 * Mais simples que o CSV da lista de chamada: aqui não existe turma nem
 * papel, e o mesmo telefone repetido é só duplicata (uma pessoa, um
 * ingresso no desafio).
 */
export function parseConvidadosCSV(texto: string): ResultadoConvidados {
  const brutas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const avisos: string[] = []
  if (brutas.length === 0) return { linhas: [], avisos: ['Arquivo vazio'] }

  const primeira = brutas[0]
  const sep =
    (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0)
      ? ';'
      : ','

  let idx = { nome: 0, telefone: 1 }
  let inicio = 0
  const cabecalho = dividirLinhaCSV(primeira.toLowerCase(), sep)
  if (cabecalho.some((c) => c.includes('telefone') || c.includes('celular'))) {
    idx = {
      nome: cabecalho.findIndex((c) => c.includes('nome')),
      telefone: cabecalho.findIndex(
        (c) => c.includes('telefone') || c.includes('celular'),
      ),
    }
    inicio = 1
  }

  const linhas: LinhaConvidado[] = []
  const vistos = new Set<string>()

  for (let i = inicio; i < brutas.length; i++) {
    const celulas = dividirLinhaCSV(brutas[i], sep)
    const nome = idx.nome >= 0 ? (celulas[idx.nome] ?? '') : ''
    const telefone = celulas[idx.telefone] ?? ''

    if (!telefoneValido(telefone)) {
      avisos.push(`Linha ${i + 1}: telefone inválido ("${telefone}") — pulada`)
      continue
    }
    // Pela linha, não pelos dígitos crus — ver o mesmo comentário em
    // parseAlunosCSV: duas grafias do mesmo número (com/sem o 9º
    // dígito) não podem escapar da checagem de duplicidade.
    const nucleo = nucleoTelefone(telefone)
    const chave = `${nucleo.ddd}${nucleo.linha}`
    if (vistos.has(chave)) {
      avisos.push(`Linha ${i + 1}: telefone repetido — pulada`)
      continue
    }
    vistos.add(chave)
    linhas.push({ nome: nome.trim(), telefone })
  }

  return { linhas, avisos }
}
