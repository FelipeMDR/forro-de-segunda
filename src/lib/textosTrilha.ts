import { formatDate } from './dates'
import { diasAte, type LinhaCronograma, type PassoComSituacao } from './trilha'

export function chaves(n: number): string {
  return `${n} ${n === 1 ? 'chave' : 'chaves'}`
}

/** "Libera em 5 dias, ou agora com 2 chaves" */
export function quandoLibera(s: PassoComSituacao, hoje: string): string {
  let quando: string
  if (s.data) {
    const n = diasAte(hoje, s.data)
    quando = n <= 0 ? 'Libera hoje' : n === 1 ? 'Libera amanhã' : `Libera em ${n} dias`
  } else {
    // Sem data e com preço: passo do nível seguinte, que a turma não vai ver
    quando = s.custo ? 'Próximo nível' : 'Abre com a turma'
  }
  if (s.estado === 'chave' && s.custo) {
    return s.data ? `${quando}, ou agora com ${chaves(s.custo)}` : `${quando} · ${chaves(s.custo)}`
  }
  if (s.custo) return `${quando} · depois por ${chaves(s.custo)}`
  return quando
}

/** Por que o passo está aberto para o aluno. */
export function comoAbriu(s: PassoComSituacao): string {
  if (s.motivo === 'chave') return 'Liberado com chave'
  if (s.motivo === 'revisao') return 'Revisão do nível anterior'
  return s.data ? `Ensinado na aula de ${formatDate(s.data)}` : 'Aberto'
}

export type TomLinha = 'feito' | 'proxima' | 'normal' | 'cancelada' | 'reposicao'

/** Texto e cor de uma linha do cronograma da turma (painel). */
export function linhaCronograma(
  l: LinhaCronograma,
  hoje: string,
  ehProxima: boolean,
): { texto: string; tom: TomLinha } {
  const { aula } = l
  if (aula.tipo === 'cancelada') {
    return aula.reposicaoEm
      ? { texto: `Reposta em ${formatDate(aula.reposicaoEm)} · trilha não atrasa`, tom: 'cancelada' }
      : { texto: `${aula.motivo ?? 'Cancelada'} · trilha andou uma semana`, tom: 'cancelada' }
  }
  if (aula.tipo === 'reposicao') {
    return { texto: ehProxima ? 'Reposição · próxima aula' : 'Reposição', tom: 'reposicao' }
  }
  if (ehProxima) return { texto: 'Próxima aula', tom: 'proxima' }
  if (aula.data <= hoje) return { texto: 'Dado · vídeo aberto para a turma', tom: 'feito' }
  return { texto: 'Agendado', tom: 'normal' }
}
