/**
 * Vendas que aparecem no card de divulgação da tela Hoje.
 *
 * Para anunciar uma festa ou workshop novo, acrescente um item aqui.
 * Cada item some sozinho quando passa de `ate`; sem nenhum no ar, o card
 * inteiro some.
 */
export interface Divulgacao {
  id: string
  /** Etiqueta curta acima do título: "Festa", "Workshop"… */
  tipo: string
  titulo: string
  /** Atração ou professores, a linha logo abaixo do título. */
  destaque: string
  /** O bloco de data à esquerda: dia da semana, dia(s) e mês. */
  data: { semana: string; dia: string; mes: string }
  /** Horário, se houver. */
  quando?: string
  onde?: string
  /** Um mimo a mais, ex.: chopp em dobro. */
  extra?: string
  /** Formulário de compra (abre fora do app). */
  link: string
  botao: string
  /** Cor do bloco de data e do botão, combinando com o cartaz. */
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
    data: { semana: 'sáb', dia: '05', mes: 'dez' },
    quando: '18h às 00h',
    onde: 'Jybá Beergarden · Parque da Cidade',
    extra: 'Chopp em dobro até 20h',
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
    data: { semana: 'sáb e dom', dia: '05–06', mes: 'dez' },
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
