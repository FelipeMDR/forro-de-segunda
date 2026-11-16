import { DIVULGACOES } from './divulgacao'
import type { Profile } from './types'

/**
 * O que a pessoa fez com uma oferta do card de divulgação (migração 046):
 * o card apareceu, ela abriu os detalhes, tocou em Comprar ou fechou.
 */
export type TipoEventoDivulgacao = 'visto' | 'detalhes' | 'clique' | 'fechou'

export interface EventoDivulgacao {
  divulgacao: string
  user_id: string
  evento: TipoEventoDivulgacao
  criado_em: string
}

/** Contagens de pessoas (não de toques) de um grupo. */
export interface Contagem {
  /** Viram a oferta (qualquer evento conta: quem clicou, viu). */
  viram: number
  detalhes: number
  clicaram: number
  fecharam: number
  /** Viram e não tocaram em Comprar. */
  ignoraram: number
}

export interface LinhaTurma extends Contagem {
  turma: string
  /** Pessoas com conta nessa turma: dá o tamanho da plateia possível. */
  pessoas: number
}

export interface MetricasOferta extends Contagem {
  divulgacao: string
  titulo: string
  /** Toques em Comprar, contando repetidos. */
  cliques: number
  porTurma: LinhaTurma[]
  /** Pessoas distintas que clicaram, por dia ("2026-11-20"), em ordem. */
  cliquesPorDia: { dia: string; pessoas: number }[]
}

export const SEM_TURMA = 'Sem turma'

export const ROTULO_EVENTO: Record<TipoEventoDivulgacao, string> = {
  visto: 'Viu o card',
  detalhes: 'Abriu os detalhes',
  clique: 'Tocou em Comprar',
  fechou: 'Fechou o card',
}

export function tituloDivulgacao(id: string): string {
  return DIVULGACOES.find((d) => d.id === id)?.titulo ?? id
}

/** Turmas em que a pessoa estuda; sem nenhuma, "Sem turma". */
function turmasDe(perfil: Profile | undefined): string[] {
  const t = perfil?.turmas.map((m) => m.turma) ?? []
  return t.length > 0 ? t : [SEM_TURMA]
}

/** Dia no fuso de Itajubá, para agrupar cliques. */
function diaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function contar(eventos: EventoDivulgacao[]): Contagem {
  const quem = (tipo?: TipoEventoDivulgacao) =>
    new Set(eventos.filter((e) => !tipo || e.evento === tipo).map((e) => e.user_id)).size
  const viram = quem()
  const clicaram = quem('clique')
  return {
    viram,
    detalhes: quem('detalhes'),
    clicaram,
    fecharam: quem('fechou'),
    ignoraram: viram - clicaram,
  }
}

/**
 * O funil de cada oferta, a mais recente primeiro, com o recorte por
 * turma. Quem faz duas turmas conta nas duas; o total da oferta conta
 * cada pessoa uma vez só. A turma é a de hoje no perfil, não a da época
 * do evento.
 */
export function metricasDivulgacao(
  eventos: EventoDivulgacao[],
  perfis: Profile[],
): MetricasOferta[] {
  const perfilPor = new Map(perfis.map((p) => [p.id, p]))
  const pessoasPorTurma = new Map<string, number>()
  for (const p of perfis) {
    for (const t of turmasDe(p)) pessoasPorTurma.set(t, (pessoasPorTurma.get(t) ?? 0) + 1)
  }

  const porOferta = new Map<string, EventoDivulgacao[]>()
  for (const e of eventos) {
    porOferta.set(e.divulgacao, [...(porOferta.get(e.divulgacao) ?? []), e])
  }

  const ordemConfig = (id: string) => {
    const i = DIVULGACOES.findIndex((d) => d.id === id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }

  return [...porOferta.entries()]
    .map(([divulgacao, evs]): MetricasOferta => {
      const porTurma = new Map<string, EventoDivulgacao[]>()
      for (const e of evs) {
        for (const t of turmasDe(perfilPor.get(e.user_id))) {
          porTurma.set(t, [...(porTurma.get(t) ?? []), e])
        }
      }

      const cliquesDia = new Map<string, Set<string>>()
      for (const e of evs) {
        if (e.evento !== 'clique') continue
        const dia = diaLocal(e.criado_em)
        cliquesDia.set(dia, (cliquesDia.get(dia) ?? new Set()).add(e.user_id))
      }

      return {
        divulgacao,
        titulo: tituloDivulgacao(divulgacao),
        ...contar(evs),
        cliques: evs.filter((e) => e.evento === 'clique').length,
        porTurma: [...porTurma.entries()]
          .map(([turma, es]) => ({
            turma,
            pessoas: pessoasPorTurma.get(turma) ?? 0,
            ...contar(es),
          }))
          .sort(
            (a, b) =>
              b.clicaram - a.clicaram || b.viram - a.viram || a.turma.localeCompare(b.turma),
          ),
        cliquesPorDia: [...cliquesDia.entries()]
          .map(([dia, s]) => ({ dia, pessoas: s.size }))
          .sort((a, b) => a.dia.localeCompare(b.dia)),
      }
    })
    .sort((a, b) => ordemConfig(a.divulgacao) - ordemConfig(b.divulgacao))
}

/** Linhas do CSV bruto: um evento por linha, do mais antigo ao mais novo. */
export function linhasCsvDivulgacao(
  eventos: EventoDivulgacao[],
  perfis: Profile[],
): { cabecalho: string[]; linhas: string[][] } {
  const perfilPor = new Map(perfis.map((p) => [p.id, p]))
  const linhas = [...eventos]
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .map((e) => {
      const p = perfilPor.get(e.user_id)
      return [
        new Date(e.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        tituloDivulgacao(e.divulgacao),
        ROTULO_EVENTO[e.evento],
        p?.nome ?? '(conta apagada)',
        turmasDe(p).join(', '),
      ]
    })
  return { cabecalho: ['Data e hora', 'Oferta', 'O que fez', 'Pessoa', 'Turma'], linhas }
}
