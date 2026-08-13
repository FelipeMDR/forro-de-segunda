/**
 * Aviso de que um check-in acabou de ser publicado.
 *
 * A tela de check-in e o botão do menu vivem em ramos diferentes da
 * árvore e não compartilham estado. Sem isto, o botão só descobria a
 * novidade na próxima troca de tela — e ficava dizendo "fazer check-in"
 * bem ao lado de um "Check-in registrado!".
 *
 * Um evento do navegador é o caminho mais curto entre os dois: nada de
 * gerenciador de estado nem de propriedade atravessando meia dúzia de
 * componentes só para levar um recado.
 */
const EVENTO_CHECKIN = 'fds:checkin-publicado'

export function avisarCheckinPublicado(): void {
  window.dispatchEvent(new Event(EVENTO_CHECKIN))
}

/** Assina o aviso. Devolve a função que cancela a assinatura. */
export function aoPublicarCheckin(callback: () => void): () => void {
  window.addEventListener(EVENTO_CHECKIN, callback)
  return () => window.removeEventListener(EVENTO_CHECKIN, callback)
}
