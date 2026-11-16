/**
 * Vendas que aparecem no card de divulgação da tela Hoje.
 *
 * Para anunciar uma festa ou workshop novo: ponha a foto em
 * public/divulgacao/ (800×500, webp) e acrescente um item aqui. Cada
 * item some sozinho quando passa de `ate`; sem nenhum no ar, o card
 * inteiro some.
 */
export interface Divulgacao {
  id: string
  /** Etiqueta curta acima do título: "Festa", "Workshop"… */
  tipo: string
  titulo: string
  /** Atração ou professores, a linha logo abaixo do título. */
  destaque: string
  /** Data como vai no selo da foto, ex.: "SÁB 05/12". */
  selo: string
  /** Horário, local, turmas, mimos… uma linha com ícone para cada. */
  linhas: { icone: 'agenda' | 'local' | 'estrela' | 'pessoas'; texto: string }[]
  imagem: string
  /** Formulário de compra (abre fora do app). */
  link: string
  botao: string
  /** Cor do selo e do botão, combinando com o cartaz. */
  cor: 'brasa' | 'verde' | 'azul'
  /** Some a partir deste instante (ISO com fuso). */
  ate: string
}

export const DIVULGACOES: Divulgacao[] = [
  {
    id: 'forro-na-rep-2026-12',
    tipo: 'Festa',
    titulo: 'Forró na Rep',
    destaque: 'com Trio Praiano',
    selo: 'SÁB 05/12',
    linhas: [
      { icone: 'agenda', texto: 'Sáb, 05 de dez · 18h às 00h' },
      { icone: 'local', texto: 'Jybá Beergarden · Parque da Cidade' },
      { icone: 'estrela', texto: 'Chopp em dobro até 20h' },
    ],
    imagem: '/divulgacao/forro-na-rep.webp',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSeMpSEyqU2jBCuapswHE1_TaEeMa7HO4rWXjYGL0qUT2V99aA/viewform',
    botao: 'Comprar ingresso',
    cor: 'brasa',
    ate: '2026-12-06T00:00:00-03:00',
  },
  {
    id: 'workshop-2026-12',
    tipo: 'Workshop',
    titulo: 'Workshop de Forró',
    destaque: 'com Mel Oliveira e Lucas Dumont',
    selo: '05 E 06/12',
    linhas: [
      { icone: 'pessoas', texto: 'Sáb 05: turmas iniciante e intermediária' },
      { icone: 'pessoas', texto: 'Dom 06: turma avançada' },
    ],
    imagem: '/divulgacao/workshop.webp',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSep6lxCfunHQxrr1sJD3IxsBUU_p-jTNv3Oe-ThqmF-TvY06Q/viewform',
    botao: 'Garantir minha vaga',
    cor: 'verde',
    ate: '2026-12-07T00:00:00-03:00',
  },
]

/** As divulgações ainda no ar neste instante, na ordem da lista. */
export function divulgacoesNoAr(
  agora: Date,
  lista: Divulgacao[] = DIVULGACOES,
): Divulgacao[] {
  return lista.filter((d) => agora.getTime() < new Date(d.ate).getTime())
}
