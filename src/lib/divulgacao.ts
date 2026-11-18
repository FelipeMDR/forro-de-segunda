import type { IngressoPerfil } from './types'

/**
 * Vendas que aparecem no card de divulgação da tela Hoje.
 *
 * Para anunciar uma festa ou workshop novo: ponha a foto em
 * public/divulgacao/ (webp; aparece em miniatura quadrada, cortada no
 * centro) e acrescente um item aqui. Cada
 * item some sozinho quando passa de `ate`; sem nenhum no ar, o card
 * inteiro some.
 */
export interface Divulgacao {
  id: string
  titulo: string
  /** Atração ou professores, a linha logo abaixo do título. */
  destaque: string
  /** Data curta, acima do título: "Sáb 05/12". */
  selo: string
  /** Horário, local, turmas, mimos… aparecem ao tocar na oferta. */
  linhas: { icone: 'agenda' | 'local' | 'estrela' | 'pessoas'; texto: string }[]
  imagem: string
  /** Formulário de compra (abre fora do app). */
  link: string
  /** Rótulo curto do botão: "Comprar", "Inscrever". */
  botao: string
  /** Cor do botão, combinando com o cartaz. */
  cor: 'brasa' | 'verde' | 'azul'
  /** Some a partir deste instante (ISO com fuso). */
  ate: string
  /**
   * Trecho do título do desafio de ingresso desta venda. Quem já está
   * nele (a planilha de ingressos põe lá quem comprou) não vê a oferta.
   * Sem acento e sem maiúscula: "forro na rep" casa "Forró na Rep · Dez".
   */
  desafio: string
}

export const DIVULGACOES: Divulgacao[] = [
  {
    id: 'forro-na-rep-2026-12',
    titulo: 'Forró na Rep',
    destaque: 'com Trio Praiano',
    selo: 'Sáb 05/12',
    linhas: [
      { icone: 'agenda', texto: 'Sáb, 05 de dez · 18h às 00h' },
      { icone: 'local', texto: 'Jybá Beergarden · Parque da Cidade' },
      { icone: 'estrela', texto: 'Chopp em dobro até 20h' },
    ],
    imagem: '/divulgacao/forro-na-rep.webp',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSep6lxCfunHQxrr1sJD3IxsBUU_p-jTNv3Oe-ThqmF-TvY06Q/viewform',
    botao: 'Comprar',
    cor: 'brasa',
    ate: '2026-12-06T00:00:00-03:00',
    desafio: 'Forró na Rep',
  },
  {
    id: 'workshop-2026-12',
    titulo: 'Workshop de Forró',
    destaque: 'com Mel Oliveira e Lucas Dumont',
    selo: '05 e 06/12',
    linhas: [
      { icone: 'pessoas', texto: 'Sáb 05: turmas iniciante e intermediária' },
      { icone: 'pessoas', texto: 'Dom 06: turma avançada' },
    ],
    imagem: '/divulgacao/workshop.webp',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSeMpSEyqU2jBCuapswHE1_TaEeMa7HO4rWXjYGL0qUT2V99aA/viewform',
    botao: 'Comprar',
    cor: 'verde',
    ate: '2026-12-07T00:00:00-03:00',
    desafio: 'Workshop',
  },
]

/** As divulgações ainda no ar neste instante, na ordem da lista. */
export function divulgacoesNoAr(
  agora: Date,
  lista: Divulgacao[] = DIVULGACOES,
): Divulgacao[] {
  return lista.filter((d) => agora.getTime() < new Date(d.ate).getTime())
}

const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * A pessoa já tem ingresso desta venda: está num desafio de ingresso
 * com o título certo e cujo evento ainda não passou. A data evita que o
 * ingresso da edição passada do Forró na Rep esconda a venda da nova.
 */
export function jaTemIngresso(d: Divulgacao, ingressos: IngressoPerfil[], hoje: string): boolean {
  const trecho = normalizar(d.desafio)
  return ingressos.some(
    (i) => i.evento_data >= hoje && normalizar(i.titulo).includes(trecho),
  )
}

/**
 * O card some quando a pessoa já fechou todas as ofertas no ar. Uma
 * oferta nova (id que ela não fechou) traz o card de volta.
 */
export function cardOculto(noAr: Divulgacao[], ocultos: string[]): boolean {
  return noAr.every((d) => ocultos.includes(d.id))
}

/**
 * Quanto tempo em segundo plano conta como "abriu o app de novo". No
 * celular o app quase nunca é fechado de verdade, só vai para o fundo:
 * sem isso, quem fechou o card não o veria mais até reiniciar o
 * aparelho. Abaixo disso (olhou o WhatsApp e voltou), segue fechado.
 */
export const REABRIR_APOS_MS = 10 * 60 * 1000

/**
 * O × vale só enquanto o app está aberto: fica em memória, nunca no
 * aparelho. Abrir o app de novo (ou voltar depois de REABRIR_APOS_MS
 * no fundo) mostra o anúncio outra vez.
 */
export function criarOcultosDaSessao(reabrirAposMs = REABRIR_APOS_MS) {
  let ocultos: string[] = []
  let noFundoDesde: number | null = null
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((cb) => cb())

  return {
    ler: () => ocultos,
    fechar(ids: string[]) {
      ocultos = [...new Set([...ocultos, ...ids])]
      avisar()
    },
    foiParaOFundo(agora: number) {
      noFundoDesde = agora
    },
    voltou(agora: number) {
      const longe = noFundoDesde !== null && agora - noFundoDesde >= reabrirAposMs
      noFundoDesde = null
      if (longe && ocultos.length > 0) {
        ocultos = []
        avisar()
      }
    },
    assinar(cb: () => void) {
      ouvintes.add(cb)
      return () => {
        ouvintes.delete(cb)
      }
    },
  }
}

/** A sessão do app: uma só, ligada à visibilidade da página. */
export const ocultosDaSessao = criarOcultosDaSessao()

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ocultosDaSessao.foiParaOFundo(Date.now())
    else ocultosDaSessao.voltou(Date.now())
  })
  // A primeira versão guardava o × no aparelho para sempre: limpa
  try {
    localStorage.removeItem('divulgacao:ocultos')
  } catch {
    // sem armazenamento, nada a limpar
  }
}

/**
 * O "visto" vai para o banco uma vez por pessoa, oferta e dia: voltar à
 * Home dez vezes na mesma noite não vira dez visualizações.
 */
export function vistoHojePendente(id: string, dia: string): boolean {
  try {
    return localStorage.getItem(`divulgacao:visto:${id}`) !== dia
  } catch {
    return true
  }
}

export function marcarVistoHoje(id: string, dia: string): void {
  try {
    localStorage.setItem(`divulgacao:visto:${id}`, dia)
  } catch {
    // Sem armazenamento: no pior caso conta de novo na próxima visita
  }
}
