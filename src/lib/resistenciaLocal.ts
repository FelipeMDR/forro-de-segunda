import type { Fala } from './resistencia'
import type { Forca } from './somAviso'

/**
 * O que o Modo Resistência guarda no celular do professor: as duas
 * gravações (IndexedDB, por serem arquivos de áudio) e os momentos
 * marcados em cada música (localStorage, por música do Spotify). Só o
 * celular ligado na caixa usa isso, então não vai para o servidor.
 */

const BANCO = 'fds-resistencia'
const LOJA = 'gravacoes'
const CHAVE_MARCAS = 'fds-resistencia-marcas'
const CHAVE_PARCEIROS = 'fds-resistencia-parceiros'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })
}

async function naLoja<T>(
  modo: IDBTransactionMode,
  fazer: (loja: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await abrir()
  try {
    return await new Promise<T>((ok, falha) => {
      const r = fazer(db.transaction(LOJA, modo).objectStore(LOJA))
      r.onsuccess = () => ok(r.result as T)
      r.onerror = () => falha(r.error)
    })
  } finally {
    db.close()
  }
}

export async function lerGravacao(fala: Fala): Promise<Blob | null> {
  try {
    return (await naLoja<Blob | undefined>('readonly', (l) => l.get(fala))) ?? null
  } catch {
    return null
  }
}

export function guardarGravacao(fala: Fala, audio: Blob): Promise<unknown> {
  return naLoja('readwrite', (l) => l.put(audio, fala))
}

export function apagarGravacao(fala: Fala): Promise<unknown> {
  return naLoja('readwrite', (l) => l.delete(fala))
}

type MarcasPorMusica = Record<string, number[]>

function lerTodasMarcas(): MarcasPorMusica {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_MARCAS) ?? '{}') as MarcasPorMusica
  } catch {
    return {}
  }
}

export function lerMarcas(uri: string): number[] {
  return lerTodasMarcas()[uri] ?? []
}

export function guardarMarcas(uri: string, marcas: number[]) {
  const todas = lerTodasMarcas()
  if (marcas.length) todas[uri] = marcas
  else delete todas[uri]
  try {
    localStorage.setItem(CHAVE_MARCAS, JSON.stringify(todas))
  } catch {
    // Sem espaço ou modo privado: a marca vale só até fechar a tela
  }
}

export function lerParceiros(): 3 | 4 {
  try {
    return localStorage.getItem(CHAVE_PARCEIROS) === '4' ? 4 : 3
  } catch {
    return 3
  }
}

export function guardarParceiros(n: 3 | 4) {
  try {
    localStorage.setItem(CHAVE_PARCEIROS, String(n))
  } catch {
    // tanto faz: volta para 3 na próxima vez
  }
}

const CHAVE_FORCA = 'fds-resistencia-forca'

/** Começa no máximo: com a música alta, o aviso precisa de tudo. */
export function lerForca(): Forca {
  try {
    const f = localStorage.getItem(CHAVE_FORCA)
    return f === 'normal' || f === 'forte' ? f : 'maximo'
  } catch {
    return 'maximo'
  }
}

export function guardarForca(f: Forca) {
  try {
    localStorage.setItem(CHAVE_FORCA, f)
  } catch {
    // tanto faz: volta para o máximo na próxima vez
  }
}
