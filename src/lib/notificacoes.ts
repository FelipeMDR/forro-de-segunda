import type { Notificacao } from './types'

/**
 * Janela em que dois "dançou com você" da mesma pessoa são a MESMA
 * notícia. Uma noite de forró dura umas cinco horas; marcações em
 * noites diferentes ficam a mais de um dia uma da outra. Seis horas
 * separa os dois casos com folga — e cobre a virada das 5h, que é
 * quando a "noite" muda de data no meio de uma sessão.
 */
const JANELA_MESMA_NOTICIA_MS = 6 * 60 * 60 * 1000

/**
 * Tira do painel os avisos que são a mesma notícia repetida.
 *
 * "Jamili dançou com você" duas vezes, a dois minutos de distância, não
 * é informação — é ruído. Acontece quando a marcação cai em duas linhas
 * da tabela (a noite virou de data entre uma e outra, ou a pessoa fez,
 * desfez e refez cruzando a virada). O banco não tem como impedir, e
 * não deve: as linhas são legítimas. Quem decide o que é notícia é a
 * tela.
 *
 * Só compacta dupla CONFIRMADA. Pendente é ação, não aviso: cada uma
 * pede um "confirmar", e esconder uma delas esconderia a pergunta.
 * Reação e comentário não precisam: reação é uma linha por pessoa por
 * foto (trocar de emoji não cria outra), e comentário repetido é
 * comentário de verdade.
 *
 * A lista chega ordenada da mais nova para a mais velha, e é a mais
 * nova que fica.
 */
export function compactarNotificacoes(itens: Notificacao[]): Notificacao[] {
  const ultimaDuplaDe = new Map<string, number>()
  return itens.filter((n) => {
    if (n.tipo !== 'dupla' || n.pendente) return true
    const quando = new Date(n.criado_em).getTime()
    const anterior = ultimaDuplaDe.get(n.autor.id)
    if (anterior !== undefined && anterior - quando < JANELA_MESMA_NOTICIA_MS) {
      return false
    }
    ultimaDuplaDe.set(n.autor.id, quando)
    return true
  })
}
