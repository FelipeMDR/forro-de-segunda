import { useTema } from './tema'

/**
 * Visual de cada nível da Forródex: a Primeira dança é neutra, e daí em
 * diante bronze, prata e ouro — no anel da foto e na moldura da carta.
 * O degradê cônico imita o reflexo do metal. O miolo e o texto mudam com
 * o tema (um miolo creme num app escuro brilharia demais).
 */
export interface EstiloNivel {
  /** Anel em volta da foto (e bolinha da legenda). */
  anel: string
  /** Moldura da carta; null = borda fina comum. */
  moldura: string | null
  /** Fundo do miolo da carta. */
  miolo: string
  /** Cor do nome do nível e dos pontinhos. */
  texto: string
}

const BRONZE = {
  anel: 'conic-gradient(from 210deg,#7a4a24,#e0a370,#a8673a,#f3c79a,#7a4a24)',
  moldura: 'linear-gradient(135deg,#7a4a24,#f3c79a,#a8673a)',
}
const PRATA = {
  anel: 'conic-gradient(from 210deg,#7d8590,#f4f6f8,#a7aeb7,#ffffff,#7d8590)',
  moldura: 'linear-gradient(135deg,#7d8590,#ffffff,#a7aeb7)',
}
const OURO = {
  anel: 'conic-gradient(from 210deg,#a8740f,#ffe08a,#d9a21b,#fff3c4,#a8740f)',
  moldura: 'linear-gradient(135deg,#a8740f,#fff3c4,#d9a21b)',
}

export function estiloNivel(nivel: number, escuro: boolean): EstiloNivel {
  switch (nivel) {
    case 2:
      return { ...BRONZE, miolo: escuro ? '#2A1F17' : '#fbf3ec', texto: escuro ? '#E0A370' : '#7a4a24' }
    case 3:
      return { ...PRATA, miolo: escuro ? '#22282C' : '#f3f5f7', texto: escuro ? '#C9D0D6' : '#4f5761' }
    case 4:
      return { ...OURO, miolo: escuro ? '#2B2410' : '#fdf6e3', texto: escuro ? '#FFE08A' : '#855c08' }
    default:
      return { anel: escuro ? '#4A5155' : '#d6d3cc', moldura: null, miolo: 'var(--sf)', texto: 'var(--ink3)' }
  }
}

/** Estilos dos níveis no tema atual. */
export function useEstiloNivel(): (nivel: number) => EstiloNivel {
  const [tema] = useTema()
  return (nivel) => estiloNivel(nivel, tema === 'dark')
}
