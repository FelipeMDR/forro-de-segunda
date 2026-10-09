import type { FaixaSpotify } from './types'

/**
 * Músicas do modo demonstração: a busca do demo procura aqui, e o
 * "Spotify de mentira" toca a playlist abaixo quando não há pedido.
 * As URIs seguem o formato real (`spotify:track:…`), mas não existem.
 */
const m = (n: number, titulo: string, artista: string): FaixaSpotify => ({
  uri: `spotify:track:demo${String(n).padStart(2, '0')}`,
  titulo,
  artista,
  capa_url: null,
  duracao_ms: 180_000,
})

export const CATALOGO_DEMO: FaixaSpotify[] = [
  m(1, 'Asa Branca', 'Luiz Gonzaga'),
  m(2, 'Xote das Meninas', 'Luiz Gonzaga'),
  m(3, 'Riacho do Navio', 'Luiz Gonzaga'),
  m(4, 'Qui Nem Jiló', 'Luiz Gonzaga'),
  m(5, 'Feira de Mangaio', 'Sivuca'),
  m(6, 'Esperando na Janela', 'Gilberto Gil'),
  m(7, 'Anunciação', 'Alceu Valença'),
  m(8, 'Morena Tropicana', 'Alceu Valença'),
  m(9, 'Último Pau de Arara', 'Fagner'),
  m(10, 'Tareco e Mariola', 'Petrúcio Amorim'),
  m(11, 'Eu Só Quero um Xodó', 'Dominguinhos'),
  m(12, 'De Volta pro Aconchego', 'Dominguinhos'),
  m(13, 'Lembrei de Nós', 'João Gomes, Mestrinho, Jota.pê'),
  m(14, 'Amor de Que', 'Marcelo Jeneci, João Gomes'),
  m(15, 'Sabiá', 'Luiz Gonzaga'),
  m(16, 'Forró no Escuro', 'Luiz Gonzaga'),
  m(17, 'Pagode Russo', 'Luiz Gonzaga'),
  m(18, 'Vem Morena', 'Luiz Gonzaga'),
  m(19, 'A Vida do Viajante', 'Luiz Gonzaga'),
  m(20, 'Xodó', 'Mestrinho'),
]

/** A "playlist padrão" do professor no demo. */
export const PLAYLIST_DEMO: FaixaSpotify[] = CATALOGO_DEMO.slice(0, 8)

/** Cada música do demo dura 20 s, para dar para ver a fila andar. */
export const DURACAO_DEMO_MS = 20_000
