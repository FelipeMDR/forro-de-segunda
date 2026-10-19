/**
 * Modo Resistência: a aula em que os avançados dançam em roda e trocam
 * de par no meio da música. O app divide cada música para dar 3 ou 4
 * parceiros e, em cada divisa, toca "Voltou pra roda" e, logo depois,
 * "Agradeceu, beijou e trocou".
 *
 * O Spotify não diz mais onde ficam as pausas e viradas da música (a
 * análise de áudio saiu da API para apps novos). Por isso o professor
 * marca os momentos bons com um toque, e a troca foge deles.
 *
 * Tudo aqui é puro: sem relógio, sem rede.
 */

/** "Voltou pra roda" vem este tanto antes do "trocou". */
export const AVISO_ANTES_MS = 4_000

/**
 * Em volta de um momento marcado, nenhum aviso: a dupla precisa estar
 * assentada antes da pausa (ANTES) e curtir a virada até o fim (DEPOIS).
 * Os valores valem para o "trocou"; o "voltou pra roda" já cabe neles.
 */
export const PROTEGE_ANTES_MS = 10_000
export const PROTEGE_DEPOIS_MS = 7_000

/** Sem troca nos primeiros segundos nem no finzinho da música. */
export const MARGEM_INICIO_MS = 20_000
export const MARGEM_FIM_MS = 15_000

/** Duas trocas nunca ficam mais perto que isto. */
export const INTERVALO_MINIMO_MS = 20_000

/** Um aviso atrasado mais que isto já não serve: fica sem tocar. */
export const TOLERANCIA_MS = 3_000

/** Toques num mesmo momento, mais perto que isto, viram uma marca só. */
export const MARCA_REPETIDA_MS = 3_000

function protegido(t: number, marcas: readonly number[]): boolean {
  return marcas.some((m) => t > m - PROTEGE_ANTES_MS && t < m + PROTEGE_DEPOIS_MS)
}

/**
 * Onde cai cada "trocou" (ms desde o começo da música). `parceiros` é
 * com quantas pessoas cada um dança na música: 3 parceiros = 2 trocas.
 *
 * A divisa ideal é a divisão igual. Se ela cair perto de um momento
 * marcado, vai para a borda mais próxima da proteção (antes ou depois
 * do momento), desde que caiba na música e não cole na troca anterior.
 * Sem lugar possível, a troca não acontece: melhor um parceiro a menos
 * do que trocar em cima da pausa.
 */
export function momentosDeTroca(
  duracaoMs: number,
  parceiros: number,
  marcas: readonly number[] = [],
): number[] {
  const ini = MARGEM_INICIO_MS
  const fim = duracaoMs - MARGEM_FIM_MS
  if (parceiros < 2 || fim <= ini) return []

  const bordas = marcas.flatMap((m) => [m - PROTEGE_ANTES_MS, m + PROTEGE_DEPOIS_MS])
  const trocas: number[] = []
  for (let k = 1; k < parceiros; k++) {
    const ideal = (duracaoMs * k) / parceiros
    const anterior = trocas[trocas.length - 1] ?? -Infinity
    const cabe = (t: number) =>
      t >= ini && t <= fim && !protegido(t, marcas) && t - anterior >= INTERVALO_MINIMO_MS
    const escolhida = [ideal, ...bordas]
      .filter(cabe)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0]
    if (escolhida !== undefined) trocas.push(Math.round(escolhida))
  }
  return trocas
}

export type Fala = 'voltou' | 'trocou'

export interface Aviso {
  fala: Fala
  /** Qual troca da música (0, 1, 2…), para não tocar a mesma duas vezes. */
  troca: number
}

/**
 * Os avisos que a música cruzou entre duas leituras do progresso.
 * A tela chama a cada fração de segundo com o progresso anterior e o
 * atual; um aviso que ficou para trás mais que TOLERANCIA_MS (o celular
 * travou, a pessoa adiantou a música) não toca.
 */
export function avisosCruzados(
  trocas: readonly number[],
  antes: number,
  agora: number,
): Aviso[] {
  if (agora <= antes) return []
  const avisos: Aviso[] = []
  trocas.forEach((t, troca) => {
    const pontos: Array<[Fala, number]> = [
      ['voltou', t - AVISO_ANTES_MS],
      ['trocou', t],
    ]
    for (const [fala, em] of pontos) {
      if (em > antes && em <= agora && agora - em <= TOLERANCIA_MS) avisos.push({ fala, troca })
    }
  })
  return avisos
}

/** Junta um toque às marcas da música, sem duplicar o mesmo momento. */
export function marcarMomento(marcas: readonly number[], ms: number): number[] {
  const t = Math.max(0, Math.round(ms))
  if (marcas.some((m) => Math.abs(m - t) < MARCA_REPETIDA_MS)) return [...marcas]
  return [...marcas, t].sort((a, b) => a - b)
}

/** 83_000 → "1:23". */
export function minutoSegundo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
