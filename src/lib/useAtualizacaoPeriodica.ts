import { useEffect, useRef } from 'react'

/**
 * Roda `carregar` ao montar e a cada `intervaloMs`, mas SÓ com a aba
 * visível — e de novo na hora em que a pessoa volta para o app.
 *
 * É o freio que a cota de logs pede (migração 028): tela em segundo
 * plano não busca nada, e ninguém usa tempo real para isso.
 */
export function useAtualizacaoPeriodica(
  carregar: () => Promise<void>,
  intervaloMs: number,
) {
  const atual = useRef(carregar)
  useEffect(() => {
    atual.current = carregar
  }, [carregar])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const rodar = () => {
      void atual.current().catch((e) => console.error('[atualizacao]', e))
    }
    const ligar = () => {
      clearInterval(timer)
      timer = setInterval(rodar, intervaloMs)
    }
    const aoMudar = () => {
      if (document.hidden) {
        clearInterval(timer)
      } else {
        rodar()
        ligar()
      }
    }
    rodar()
    if (!document.hidden) ligar()
    document.addEventListener('visibilitychange', aoMudar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoMudar)
    }
  }, [intervaloMs])
}
