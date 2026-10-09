import { useEffect, useRef } from 'react'
import type { ForroApi } from './api'

/**
 * Recarrega a tela quando a sessão de DJ muda — na prática, quando
 * troca a música (o loop só grava a sessão quando algo muda; migração
 * 031). Com o app em segundo plano ignora o aviso: ao voltar, a recarga
 * de `useAtualizacaoPeriodica` já traz tudo em dia.
 */
export function useSessaoDJAoVivo(api: ForroApi, carregar: () => Promise<void>) {
  const atual = useRef(carregar)
  useEffect(() => {
    atual.current = carregar
  }, [carregar])

  useEffect(
    () =>
      api.assinarSessaoDJ(() => {
        if (document.hidden) return
        void atual.current().catch((e) => console.error('[sessao-dj]', e))
      }),
    [api],
  )
}
