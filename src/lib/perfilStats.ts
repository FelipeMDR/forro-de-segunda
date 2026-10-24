import type { ForroApi } from './api'
import { computeBadges } from './badges'
import { equipeDaCaca, papelEfetivo, progressoCaca } from './caca'
import {
  computeStreak,
  diasDistintos,
  diasSuspensos,
  mapaAberturas,
} from './dates'
import { datasDePresenca } from './presenca'
import type {
  AberturaAntecipada,
  Badge,
  CacaCongelada,
  Challenge,
  Feriado,
  PapelDanca,
  ParceiroDanca,
  PerfilPublico,
  Turma,
  TurmaMembro,
} from './types'

export interface PerfilStats {
  streak: number
  presencas: number
  desafios: number
  /** Pessoas diferentes com dupla confirmada dos dois lados. */
  parceiros: number
}

/**
 * Estatísticas e distintivos de um aluno — usado tanto no próprio
 * perfil quanto no perfil público de outra pessoa.
 */
export async function carregarPerfilStats(
  api: ForroApi,
  userId: string,
  turmas: TurmaMembro[],
  cargos: string[] = [],
  opcoes: {
    /**
     * Função principal de quem está sem turma (migração 041). undefined =
     * indisponível (banco sem a migração): sem convite a escolher.
     */
    papelPrincipal?: PapelDanca | null
    /** Próprio perfil: mostra a caça no nível 0 e o convite à função. */
    proprio?: boolean
  } = {},
): Promise<{ stats: PerfilStats; badges: Badge[] }> {
  const papelPrincipal = opcoes.papelPrincipal ?? null
  const funcaoDisponivel = opcoes.papelPrincipal !== undefined
  // A caça vale no semestre em curso: as duplas são recortadas no último
  // "Encerrar semestre" (nunca encerrado = desde sempre). É um pedido à
  // parte do histórico completo, que o rodízio continua usando.
  const caca = api
    .inicioSemestreAtual()
    .catch(() => null)
    .then(async (inicio) => ({
      inicio,
      parceiros: await api
        .parceirosDe(userId, inicio ?? undefined)
        .catch(() => [] as ParceiroDanca[]),
    }))
  const [
    checkins,
    nDesafios,
    distintivosCustom,
    parceiros,
    desafios,
    feriados,
    aberturas,
    musicasTocadas,
    perfis,
    turmasCadastradas,
    cacaSemestre,
    cacasCongeladas,
  ] = await Promise.all([
    api.checkinsDe(userId),
    api.contarDesafios(userId),
    api.distintivosDe(userId),
    // Sem a migração 016 a tabela não existe — o perfil vale sem isso
    api.parceirosDe(userId).catch(() => []),
    // Presença agora depende dos desafios (ver `lib/presenca.ts`): é o
    // que separa quem esteve no forró de quem postou uma foto em casa.
    api.listChallenges().catch(() => [] as Challenge[]),
    api.listFeriados().catch(() => [] as Feriado[]),
    api.listAberturas().catch(() => [] as AberturaAntecipada[]),
    // Sem a migração 029 a tabela não existe — o perfil vale sem isso
    api.musicasTocadasDe(userId).catch(() => 0),
    // Sem a lista de perfis ou de turmas não há equipe: a caça só some
    api.listPerfisPublicos().catch(() => null),
    api.listTurmas().catch(() => null),
    caca,
    // Sem a migração 041 não há caças guardadas
    api.cacaCongeladaDe(userId).catch(() => [] as CacaCongelada[]),
  ])

  // Uma noite só entra na conta se a foto marcou ponto em algum desafio
  // rodando na hora. Vale para os três números derivados de presença:
  // o contador, a sequência de semanas e os distintivos de presença —
  // se um deles usasse os check-ins crus, o perfil se contradiria.
  const datas = datasDePresenca(checkins, {
    desafios,
    suspensos: diasSuspensos(feriados),
    aberturas: mapaAberturas(aberturas),
  })

  return {
    stats: {
      streak: computeStreak(datas),
      presencas: diasDistintos(datas),
      desafios: nDesafios,
      parceiros: parceiros.length,
    },
    badges: computeBadges({
      userId,
      turmas,
      cargos,
      distintivosCustom,
      checkinDates: datas,
      parceiros: parceiros.length,
      primeirasNoites: parceiros.flatMap((p) => (p.primeira ? [p.primeira] : [])),
      musicasTocadas,
      papelPrincipal,
      cacaAtual: montarCacaAtual(
        userId,
        turmas,
        papelPrincipal,
        perfis,
        turmasCadastradas,
        cacaSemestre,
        opcoes.proprio ?? false,
        funcaoDisponivel,
      ),
      cacasCongeladas,
    }),
  }
}

/**
 * Caça do semestre em curso. Sem papel e sem turma, a pessoa pode
 * resolver escolhendo a função (`semPapel`); com turma mas sem papel na
 * turma, fica de fora até a organização preencher.
 */
function montarCacaAtual(
  userId: string,
  turmas: TurmaMembro[],
  papelPrincipal: PapelDanca | null,
  perfis: PerfilPublico[] | null,
  turmasCadastradas: Turma[] | null,
  semestre: { inicio: string | null; parceiros: ParceiroDanca[] },
  proprio: boolean,
  funcaoDisponivel: boolean,
) {
  const base = { inicio: semestre.inicio, proprio }
  if (!perfis || !turmasCadastradas) {
    return { ...base, progresso: null, semPapel: false }
  }
  const papel = papelEfetivo(turmas, papelPrincipal, turmasCadastradas)
  if (!papel) {
    // Sem a coluna da função não há o que escolher: nada de convite
    return { ...base, progresso: null, semPapel: turmas.length === 0 && funcaoDisponivel }
  }
  const parceiros = new Set(semestre.parceiros.map((p) => p.user_id))
  return {
    ...base,
    progresso: progressoCaca(userId, papel, equipeDaCaca(perfis), parceiros),
    semPapel: false,
  }
}
