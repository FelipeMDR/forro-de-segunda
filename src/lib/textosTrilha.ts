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

/** "Prof. Ana, Prof. Bia e Prof. João" (só o primeiro nome). */
export function nomesProfessores(nomes: string[]): string {
  const p = nomes.map((n) => `Prof. ${n.trim().split(/\s+/)[0]}`)
  return p.length <= 1 ? (p[0] ?? '') : `${p.slice(0, -1).join(', ')} e ${p[p.length - 1]}`
}

/** Por que o passo está aberto para o aluno, e quem ensinou. */
export function comoAbriu(s: PassoComSituacao, professores: string[] = []): string {
  const texto =
    s.motivo === 'chave'
      ? 'Liberado com chave'
      : s.motivo === 'revisao'
        ? 'Revisão do nível anterior'
        : s.data
          ? `Ensinado na aula de ${formatDate(s.data)}`
          : 'Aberto'
  const quem = nomesProfessores(professores)
  return quem ? `${texto} · ${quem}` : texto
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
