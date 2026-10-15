import { formatDate } from './dates'
import { diasAte, type LinhaCronograma, type PassoComSituacao } from './trilha'

/** "Libera em 5 dias, ou agora com 1 chave" */
export function quandoLibera(s: PassoComSituacao, hoje: string): string {
  if (!s.data) return 'Abre com a turma'
  const n = diasAte(hoje, s.data)
  const quando = n <= 0 ? 'Libera hoje' : n === 1 ? 'Libera amanhã' : `Libera em ${n} dias`
  return s.estado === 'chave' ? `${quando}, ou agora com 1 chave` : quando
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
