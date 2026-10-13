import { useCallback, useState, type SetStateAction } from 'react'

/**
 * O que cada tela já tinha carregado, guardado enquanto o app está aberto.
 *
 * Trocar de aba desmonta a tela, e com ela ia embora tudo o que estava
 * no `useState`: voltar para o Feed era "Carregando o feed…" de novo, e
 * cada pedaço da tela pipocava conforme chegava — o app piscava a cada
 * toque na barra. Agora a tela volta mostrando o que tinha da última
 * vez e se atualiza por baixo, com a mesma consulta de sempre.
 *
 * Fica só na memória: fechar o app esquece, e trocar de conta também
 * (ver AuthContext), para ninguém ver o feed de outra pessoa.
 */
const memoria = new Map<string, unknown>()

export function lerTela<T>(chave: string, inicial: T): T {
  return memoria.has(chave) ? (memoria.get(chave) as T) : inicial
}

export function lembrarTela<T>(chave: string, valor: T) {
  memoria.set(chave, valor)
}

export function esquecerTelas() {
  memoria.clear()
}

export function proximoValor<T>(novo: SetStateAction<T>, atual: T): T {
  return typeof novo === 'function' ? (novo as (a: T) => T)(atual) : novo
}

/**
 * Estado guardado sob uma chave. Quando a chave muda com a tela montada
 * (ir de um perfil para outro reaproveita o mesmo componente), passa a
 * mostrar o que estava guardado na chave nova — nunca o da anterior.
 */
export interface Lembrado<T> {
  chave: string
  valor: T
}

/** Estado de partida (ou de troca de chave) do `useLembrado`. */
export function estadoDaChave<T>(chave: string, inicial: T): Lembrado<T> {
  return { chave, valor: lerTela(chave, inicial) }
}

/**
 * Aplica `novo` ao estado, guardando o resultado na chave de quem
 * escreveu. Uma resposta que chega atrasada, de uma chave que já saiu da
 * tela, fica guardada para ela mas não mexe no que está à mostra.
 */
export function escreverLembrado<T>(
  estado: Lembrado<T>,
  chave: string,
  novo: SetStateAction<T>,
): Lembrado<T> {
  if (estado.chave !== chave) {
    // Atualização em forma de função dependeria do valor daquela chave,
    // que não está à mão — descarta; a próxima visita recarrega.
    if (typeof novo !== 'function') lembrarTela(chave, novo)
    return estado
  }
  const valor = proximoValor(novo, estado.valor)
  lembrarTela(chave, valor)
  return { chave, valor }
}

/**
 * `useState` que sobrevive à troca de tela: começa do último valor
 * guardado em `chave` (ou de `inicial`, se a tela nunca carregou) e
 * guarda cada valor novo. Telas com id na rota põem o id na chave.
 */
export function useLembrado<T>(chave: string, inicial: T) {
  const [estado, setEstado] = useState(() => estadoDaChave(chave, inicial))
  let atual = estado
  if (estado.chave !== chave) {
    // Ajuste durante a renderização (padrão do React para estado que
    // depende de props): evita um quadro com os dados da chave antiga.
    atual = estadoDaChave(chave, inicial)
    setEstado(atual)
  }
  const definir = useCallback(
    (novo: SetStateAction<T>) => setEstado((e) => escreverLembrado(e, chave, novo)),
    [chave],
  )
  return [atual.valor, definir] as const
}
