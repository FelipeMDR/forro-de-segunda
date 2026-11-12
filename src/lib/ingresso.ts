import type {
  Badge,
  Challenge,
  IngressoConfig,
  IngressoPerfil,
  NoiteExtra,
  TextoDistintivo,
} from './types'

/** Textos de distintivo que a organização recebe de partida. */
export function textosPadraoIngresso(titulo: string): {
  garantido: TextoDistintivo
  presenca: TextoDistintivo
} {
  return {
    garantido: { emoji: '🎟️', titulo: `${titulo} · Ingresso garantido` },
    presenca: { emoji: '🎉', titulo: `${titulo} · Marquei presença` },
  }
}

/** A noite da festa, no formato que `janelaDoCheckin` entende. */
export function noiteDoEvento(cfg: IngressoConfig): NoiteExtra {
  return {
    data: cfg.evento_data,
    hora_inicio: cfg.evento_inicio,
    hora_fim: cfg.evento_fim,
  }
}

function comNoite(c: Challenge, noite: NoiteExtra): Challenge {
  const ja = c.noites_extras.some(
    (n) =>
      n.data === noite.data &&
      n.hora_inicio === noite.hora_inicio &&
      n.hora_fim === noite.hora_fim,
  )
  return ja ? c : { ...c, noites_extras: [...c.noites_extras, noite] }
}

/**
 * Espalha a noite de cada desafio de ingresso: ele mesmo e os desafios
 * listados em `noite_extra_para` (o Espaço Livre, por exemplo) passam a
 * contar aquela noite. Devolve cópias; ids desconhecidos são ignorados e
 * a mesma noite nunca entra duas vezes.
 */
export function aplicarNoitesExtras(desafios: Challenge[]): Challenge[] {
  let r = desafios.map((c) => ({ ...c, noites_extras: [...(c.noites_extras ?? [])] }))
  for (const origem of desafios) {
    const cfg = origem.ingresso
    if (!cfg) continue
    const noite = noiteDoEvento(cfg)
    const alvos = new Set([origem.id, ...cfg.noite_extra_para])
    r = r.map((c) => (alvos.has(c.id) ? comNoite(c, noite) : c))
  }
  return r
}

/**
 * Desafios que podem receber a noite da festa: os outros desafios comuns
 * cujo período inclui a data do evento (os de ingresso trazem a própria noite).
 */
export function alvosDaNoiteExtra(
  desafios: Challenge[],
  eventoData: string,
  idProprio?: string,
): Challenge[] {
  return desafios.filter(
    (c) =>
      c.id !== idProprio &&
      !c.ingresso &&
      c.data_inicio <= eventoData &&
      eventoData <= c.data_fim,
  )
}

/** "Festa em 05/12, das 18:00 às 04:00" */
export function rotuloFesta(cfg: IngressoConfig): string {
  const [, mes, dia] = cfg.evento_data.split('-')
  return `Festa em ${dia}/${mes}, das ${cfg.evento_inicio} às ${cfg.evento_fim}`
}

/** Distintivo de ingresso do perfil; o id não muda entre os estados. */
export function badgeDeIngresso(i: IngressoPerfil): Badge {
  return {
    id: `ingresso-${i.desafio_id}`,
    emoji: i.emoji,
    titulo: i.titulo_distintivo,
    descricao:
      i.estado === 'garantido' ? 'Garantiu o ingresso' : 'Marcou presença na festa',
    tipo: i.titulo,
    regra:
      'Entra quem está na lista de ingressos. Evolui com check-in no horário da festa.',
    alcancadoEm: i.desde ?? undefined,
  }
}
