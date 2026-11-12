import { addDays, toISODate } from './dates'
import type { IngressoPerfil } from './types'

/** Até quantos dias depois da festa ainda vale comemorar. */
export const DIAS_PARA_COMEMORAR = 30

/** Chave do "já comemorei isso" — uma por desafio e por estado do distintivo. */
export function chaveVisto(i: IngressoPerfil): string {
  return `ingresso-visto:${i.desafio_id}:${i.estado}`
}

/** A festa foi há no máximo `DIAS_PARA_COMEMORAR` dias (ou ainda vai ser)? */
function recente(i: IngressoPerfil, agora: Date): boolean {
  // Sem data (banco com a função antiga): não dá para saber, comemora
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.evento_data)) return true
  const [a, m, d] = i.evento_data.split('-').map(Number)
  const limite = toISODate(addDays(new Date(a, m - 1, d), DIAS_PARA_COMEMORAR))
  return toISODate(agora) <= limite
}

/**
 * Qual comemoração mostrar agora, se houver. Presença vem antes de
 * garantido: quem acabou de marcar presença não precisa ouvir de novo
 * que o ingresso está confirmado. Edição antiga não comemora: o "já
 * visto" mora no aparelho, e num celular novo a festa de anos atrás
 * voltaria a pipocar.
 */
export function proximaComemoracao(
  ingressos: IngressoPerfil[],
  vistos: (chave: string) => boolean,
  agora: Date = new Date(),
): IngressoPerfil | null {
  const nova = (i: IngressoPerfil) => recente(i, agora) && !vistos(chaveVisto(i))
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
