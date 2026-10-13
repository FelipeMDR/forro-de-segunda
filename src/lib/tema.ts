import { useCallback, useEffect, useState } from 'react'

/**
 * Tema do app. Claro é o padrão; quem preferir o escuro (o app é usado
 * à noite, num salão escuro) troca no perfil, e a escolha fica guardada
 * no aparelho.
 *
 * O index.html aplica o tema salvo antes do React carregar (sem isso a
 * primeira pintura sairia no tema errado e piscaria). A chave e os
 * valores precisam bater com aquele script.
 */
export type Tema = 'dark' | 'light'

const CHAVE = 'fds-tema'

/** Cor da barra do navegador/sistema em cada tema (= fundo do app). */
const COR_BARRA: Record<Tema, string> = {
  dark: '#0B1013',
  light: '#F5F4F2',
}

export function temaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', COR_BARRA[tema])
}

const ouvintes = new Set<(t: Tema) => void>()

export function definirTema(tema: Tema) {
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    // Navegação privada: vale só nesta sessão.
  }
  aplicarTema(tema)
  ouvintes.forEach((cb) => cb(tema))
}

/** Tema atual e como trocá-lo; telas abertas acompanham a troca. */
export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(temaSalvo)
  useEffect(() => {
    ouvintes.add(setTema)
    return () => {
      ouvintes.delete(setTema)
    }
  }, [])
  const trocar = useCallback((t: Tema) => definirTema(t), [])
  return [tema, trocar]
}
