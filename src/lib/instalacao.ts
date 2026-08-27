import { useEffect, useState } from 'react'

/**
 * Instalação na tela inicial.
 *
 * No Android/Chrome existe `beforeinstallprompt`: dá para abrir o
 * diálogo nativo de instalação num clique. No iOS **não existe API
 * nenhuma** — a Apple só permite adicionar pela bandeja de
 * Compartilhar do Safari, acionada pela pessoa. Nenhum site consegue
 * abrir aquela bandeja. Por isso lá o caminho é um passo a passo
 * ilustrado, e não um botão mágico.
 */

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS não implementa display-mode: standalone
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export function ehIOS(): boolean {
  const ua = navigator.userAgent
  // iPad com iPadOS 13+ se apresenta como Macintosh; o toque denuncia
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

/**
 * Navegador embutido dentro de outro app (Instagram, Facebook,
 * WhatsApp…) — é por aí que muita gente chega, clicando no link da bio.
 *
 * Importa muito além da instalação: essas janelas costumam ser
 * DESCARTADAS ao fechar, então permissão de câmera e localização não
 * sobrevive — o app pede tudo de novo na visita seguinte, para sempre.
 * Nenhum ajuste no site muda isso; a saída é abrir no navegador de
 * verdade e instalar.
 */
export function ehNavegadorEmbutido(): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line|Twitter|LinkedIn|WhatsApp|GSA/i.test(
    navigator.userAgent,
  )
}

/**
 * No iOS, só o Safari adiciona à tela inicial. Chrome, Firefox e os
 * navegadores embutidos (Instagram, WhatsApp…) não têm a opção.
 */
export function ehSafariIOS(): boolean {
  if (!ehIOS()) return false
  const ua = navigator.userAgent
  const outroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua)
  return !outroNavegador && !ehNavegadorEmbutido()
}

/**
 * O evento fica num único lugar, capturado assim que este módulo
 * carrega — antes do React montar qualquer tela.
 *
 * O `beforeinstallprompt` dispara UMA vez, logo no carregamento. Se
 * cada componente guardasse o evento no próprio estado, só veria o
 * evento quem já estivesse montado na hora: o cartão do perfil, que só
 * monta quando a pessoa navega até lá, nunca mostraria o botão.
 */
let eventoGuardado: EventoInstalacao | null = null
let instalado = false
const inscritos = new Set<() => void>()

function avisar() {
  inscritos.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem isto o Chrome mostra a própria barrinha, e o botão do app
    // ficaria redundante
    e.preventDefault()
    eventoGuardado = e as EventoInstalacao
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    instalado = true
    eventoGuardado = null
    avisar()
  })
}

export interface EstadoInstalacao {
  jaInstalado: boolean
  /** Dá para abrir o diálogo nativo num clique (Android/desktop). */
  temPromptNativo: boolean
  ios: boolean
  /** iOS fora do Safari: nem o passo a passo resolve, precisa trocar. */
  iosForaDoSafari: boolean
  /** Abre o diálogo nativo. Devolve true se a pessoa aceitou. */
  instalar: () => Promise<boolean>
}

export function useInstalacao(): EstadoInstalacao {
  // Só serve para redesenhar quando o evento chega ou o app é instalado
  const [, redesenhar] = useState(0)

  useEffect(() => {
    const fn = () => redesenhar((n) => n + 1)
    inscritos.add(fn)
    return () => {
      inscritos.delete(fn)
    }
  }, [])

  const instalar = async () => {
    if (!eventoGuardado) return false
    await eventoGuardado.prompt()
    const { outcome } = await eventoGuardado.userChoice
    // O evento é de uso único: se recusou, só volta numa próxima visita
    eventoGuardado = null
    avisar()
    return outcome === 'accepted'
  }

  const ios = ehIOS()
  return {
    jaInstalado: instalado || estaInstalado(),
    temPromptNativo: eventoGuardado !== null,
    ios,
    iosForaDoSafari: ios && !ehSafariIOS(),
    instalar,
  }
}
