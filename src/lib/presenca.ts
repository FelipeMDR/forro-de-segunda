import { janelaDoCheckin } from './dates'
import type { Challenge } from './types'

/**
 * Presença = check-in que marcou ponto em algum desafio rodando na hora.
 *
 * Antes bastava existir um check-in: qualquer foto, de qualquer lugar, em
 * qualquer horário, virava presença no perfil e na planilha do painel.
 * Quem postasse de casa numa terça de manhã ganhava presença igual a quem
 * atravessou a noite no salão — e a planilha de frequência, que é usada
 * para valer, dizia o mesmo.
 *
 * A regra passa a ser a MESMA do ranking: a foto tem que cair na janela
 * de um desafio (dia da semana + horário + período) e, se aquele desafio
 * exigir estar no local, tem que ter o veredito de GPS. Participar do
 * desafio continua sendo opcional — quem não entrou não aparece no rank,
 * mas ganha a presença do mesmo jeito, porque estava lá.
 *
 * Este arquivo é o ÚNICO lugar que decide isso. Perfil, distintivos,
 * retrospectiva e planilha do painel chamam daqui — se cada tela
 * recalculasse por conta própria, elas voltariam a divergir com o tempo,
 * que foi exatamente o que aconteceu com a comparação de telefone.
 */

/** Check-in com o veredito de local que o servidor gravou. */
export interface CheckinComVeredito {
  criado_em: string
  /**
   * Ids dos desafios em que a foto valeu NO LOCAL (espelha a tabela
   * `checkin_locais`). Vazio quando não veio GPS ou caiu fora de todo
   * raio — e aí só contam desafios sem trava de local.
   */
  locais?: string[]
}

/** O contexto que decide o que conta: desafios + exceções do calendário. */
export interface RegrasPresenca {
  /**
   * TODOS os desafios, não só os ativos hoje: `janelaDoCheckin` já
   * confere o período de cada um. Filtrar por "ativo agora" apagaria a
   * presença histórica assim que um desafio terminasse.
   */
  desafios: Challenge[]
  /** Dias em que a aula foi cancelada (não há janela, ninguém pontua). */
  suspensos?: ReadonlySet<string>
  /** Dias em que o espaço abriu mais cedo (a janela adianta). */
  aberturas?: ReadonlyMap<string, number>
}

/**
 * A foto passa na trava de local deste desafio?
 *
 * Desafio sem local aceita de qualquer lugar. Com local, exige o
 * veredito — menos para check-ins anteriores a `desde`, que é quando a
 * trava foi ligada: ligar a regra no meio do desafio não pode confiscar
 * presença de quem já tinha comparecido (migração 009).
 */
function valeuNoLocal(c: CheckinComVeredito, desafio: Challenge): boolean {
  if (!desafio.local) return true
  if (
    desafio.local.desde &&
    new Date(c.criado_em).getTime() < new Date(desafio.local.desde).getTime()
  ) {
    return true
  }
  return (c.locais ?? []).includes(desafio.id)
}

/**
 * A janela em que este check-in marcou ponto, ou `null` se ele não conta
 * como presença.
 *
 * Devolve a janela (e não só um booleano) porque é ela que identifica a
 * NOITE: num desafio que vira a madrugada, a foto das 23h e a da 1h
 * pertencem à mesma janela e valem uma presença só.
 */
export function janelaDaPresenca(
  c: CheckinComVeredito,
  { desafios, suspensos, aberturas }: RegrasPresenca,
): string | null {
  const d = new Date(c.criado_em)
  for (const desafio of desafios) {
    const janela = janelaDoCheckin(d, desafio, suspensos, aberturas)
    if (janela && valeuNoLocal(c, desafio)) return janela
  }
  return null
}

/** Este check-in conta como presença? */
export function contaComoPresenca(
  c: CheckinComVeredito,
  regras: RegrasPresenca,
): boolean {
  return janelaDaPresenca(c, regras) !== null
}

/**
 * As noites em que a pessoa esteve de verdade, como datas ao meio-dia —
 * formato que `diasDistintos` e `computeStreak` já consomem.
 *
 * Meio-dia, e não meia-noite, para nenhuma conversão de fuso empurrar a
 * data para o dia anterior.
 */
export function datasDePresenca(
  checkins: CheckinComVeredito[],
  regras: RegrasPresenca,
): Date[] {
  const noites = new Set<string>()
  for (const c of checkins) {
    const janela = janelaDaPresenca(c, regras)
    if (janela) noites.add(janela)
  }
  return [...noites].map((dia) => new Date(`${dia}T12:00:00`))
}
