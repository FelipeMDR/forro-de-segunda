import { telefoneValido } from './phone'
import type { PapelDanca } from './types'

export interface LinhaAluno {
  nome: string
  telefone: string
  turma: string
  papel_danca: PapelDanca | null
}

/** Aceita "condutor", "Condutora", "conduzido(a)"… e normaliza. */
export function parsePapelDanca(v: string): PapelDanca | null {
  const lower = v.trim().toLowerCase()
  if (lower.startsWith('condutor')) return 'Condutor(a)'
  if (lower.startsWith('conduzid')) return 'Conduzido(a)'
  return null
}

export interface ResultadoParse {
  linhas: LinhaAluno[]
  avisos: string[]
}

function dividir(linha: string, sep: string): string[] {
  // Divisão simples com suporte a células entre aspas
  const celulas: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (const ch of linha) {
    if (ch === '"') {
      dentroDeAspas = !dentroDeAspas
    } else if (ch === sep && !dentroDeAspas) {
      celulas.push(atual.trim())
      atual = ''
    } else {
      atual += ch
    }
  }
  celulas.push(atual.trim())
  return celulas
}

/**
 * Lê o CSV da lista de chamada. Colunas: nome, telefone, turma e papel
 * (Condutor/Conduzido, opcional) — com cabeçalho em qualquer ordem ou
 * sem cabeçalho (ordem fixa: nome;telefone;turma;papel). Separador ;
 * ou , (detectado). O MESMO telefone pode aparecer em várias linhas,
 * uma por turma (aluno em múltiplas turmas com papéis diferentes).
 */
export function parseAlunosCSV(
  texto: string,
  turmasValidas: string[],
): ResultadoParse {
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

  let idx = { nome: 0, telefone: 1, turma: 2, papel: 3 }
  let inicio = 0
  const cabecalho = dividir(primeira.toLowerCase(), sep)
  if (cabecalho.some((c) => c.includes('telefone') || c.includes('celular'))) {
    idx = {
      nome: cabecalho.findIndex((c) => c.includes('nome')),
      telefone: cabecalho.findIndex(
        (c) => c.includes('telefone') || c.includes('celular'),
      ),
      turma: cabecalho.findIndex((c) => c.includes('turma')),
      papel: cabecalho.findIndex(
        (c) => c.includes('papel') || c.includes('função') || c.includes('funcao'),
      ),
    }
    inicio = 1
    if (idx.telefone < 0) {
      return { linhas: [], avisos: ['Cabeçalho sem coluna de telefone'] }
    }
  }

  const turmasLower = turmasValidas.map((t) => t.toLowerCase())
  const linhas: LinhaAluno[] = []
  const vistos = new Set<string>()

  for (let i = inicio; i < brutas.length; i++) {
    const celulas = dividir(brutas[i], sep)
    const nome = idx.nome >= 0 ? (celulas[idx.nome] ?? '') : ''
    const telefone = celulas[idx.telefone] ?? ''
    const turma = idx.turma >= 0 ? (celulas[idx.turma] ?? '') : ''
    const papel =
      idx.papel >= 0 ? parsePapelDanca(celulas[idx.papel] ?? '') : null

    if (!telefoneValido(telefone)) {
      avisos.push(`Linha ${i + 1}: telefone inválido ("${telefone}") — pulada`)
      continue
    }
    // Duplicado = mesmo telefone NA MESMA turma (múltiplas turmas são ok)
    const chave = `${telefone.replace(/\D/g, '').slice(-10)}|${turma.toLowerCase()}`
    if (vistos.has(chave)) {
      avisos.push(
        `Linha ${i + 1}: telefone repetido na mesma turma — pulada`,
      )
      continue
    }
    vistos.add(chave)
    if (turma && !turmasLower.includes(turma.toLowerCase())) {
      avisos.push(
        `Linha ${i + 1}: turma "${turma}" não está nas turmas do semestre (importada mesmo assim)`,
      )
    }
    linhas.push({ nome, telefone, turma, papel_danca: papel })
  }

  return { linhas, avisos }
}
