import { toISODate } from './dates'

/**
 * Rótulo do grupo a que uma data pertence, do ponto de vista de hoje.
 *
 * "Hoje" e "Ontem" ganham nome próprio porque é assim que a pessoa
 * pensa; daí para trás o dia do calendário passa a ser mais útil que
 * uma contagem ("há 9 dias" não diz nada).
 */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const dia = toISODate(new Date(iso))
  const hoje = toISODate(agora)
  if (dia === hoje) return 'Hoje'

  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  if (dia === toISODate(ontem)) return 'Ontem'

  const d = new Date(iso)
  const seteDias = new Date(agora)
  seteDias.setDate(seteDias.getDate() - 7)
  if (d >= seteDias) {
    // Dia da semana por extenso só vale enquanto é único na janela —
    // passando de sete dias, "segunda" viraria ambíguo.
    return d.toLocaleDateString('pt-BR', { weekday: 'long' })
  }

  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

/**
 * Fatia uma lista já ordenada do mais novo para o mais antigo em blocos
 * por dia, preservando a ordem.
 *
 * Não reordena nada: só marca onde um dia acaba e o outro começa. Isso
 * mantém a lista compatível com a rolagem infinita, em que as páginas
 * seguintes só acrescentam no fim.
 */
export function agrupaPorDia<T>(
  itens: T[],
  quando: (item: T) => string,
  agora = new Date(),
): Array<{ rotulo: string; itens: T[] }> {
  const grupos: Array<{ rotulo: string; itens: T[] }> = []
  for (const item of itens) {
    const rotulo = rotuloDoDia(quando(item), agora)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.rotulo === rotulo) ultimo.itens.push(item)
    else grupos.push({ rotulo, itens: [item] })
  }
  return grupos
}
