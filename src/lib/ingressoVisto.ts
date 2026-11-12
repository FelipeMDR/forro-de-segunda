import type { IngressoPerfil } from './types'

/** Chave do "já comemorei isso" — uma por desafio e por estado do distintivo. */
export function chaveVisto(i: IngressoPerfil): string {
  return `ingresso-visto:${i.desafio_id}:${i.estado}`
}

/**
 * Qual comemoração mostrar agora, se houver. Presença vem antes de
 * garantido: quem acabou de marcar presença não precisa ouvir de novo
 * que o ingresso está confirmado.
 */
export function proximaComemoracao(
  ingressos: IngressoPerfil[],
  vistos: (chave: string) => boolean,
): IngressoPerfil | null {
  const nova = (i: IngressoPerfil) => !vistos(chaveVisto(i))
  return (
    ingressos.find((i) => i.estado === 'presenca' && nova(i)) ??
    ingressos.find((i) => i.estado === 'garantido' && nova(i)) ??
    null
  )
}

/**
 * Leitura do localStorage. Sem armazenamento (modo privado, bloqueado)
 * conta como "já visto": melhor não comemorar do que comemorar a cada
 * abertura do app.
 */
export function jaVisto(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) !== null
  } catch {
    return true
  }
}

/** Marca como vista; ver a de presença também encerra a de garantido. */
export function marcarVisto(i: IngressoPerfil): void {
  try {
    window.localStorage.setItem(chaveVisto(i), '1')
    if (i.estado === 'presenca') {
      window.localStorage.setItem(chaveVisto({ ...i, estado: 'garantido' }), '1')
    }
  } catch {
    // sem armazenamento: jaVisto() já devolve true, nada a fazer
  }
}
