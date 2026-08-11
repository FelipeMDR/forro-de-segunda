export type Papel = 'aluno' | 'organizador'

/** Papel na dança dentro de uma turma. */
export type PapelDanca = 'Condutor(a)' | 'Conduzido(a)'

export const PAPEIS_DANCA: PapelDanca[] = ['Condutor(a)', 'Conduzido(a)']

/**
 * Vínculo aluno ↔ turma. Um aluno pode estar em várias turmas com
 * papéis diferentes (ex.: Condutor no Avançado e Conduzido no Inter).
 */
export interface TurmaMembro {
  turma: string
  papel_danca: PapelDanca | null
}

export interface Profile {
  id: string
  nome: string
  avatar_url: string | null
  /** Turmas definidas pela organização — aluno não edita. */
  turmas: TurmaMembro[]
  /** Cargos no projeto (Presidência, Professor(a)…) — só a organização define. */
  cargos: string[]
  telefone: string | null
  /**
   * E-mail de recuperação de senha. null = conta antiga que ainda usa o
   * e-mail sintético e por isso não consegue recuperar a senha sozinha.
   */
  email: string | null
  criado_em: string
}

/**
 * Perfil como os outros alunos podem ver: sem telefone e sem e-mail. A
 * busca de perfis usa este formato justamente para o contato de ninguém
 * sair trafegando para o aparelho de todo mundo.
 */
export type PerfilPublico = Omit<Profile, 'telefone' | 'email'>

/** Rótulo compacto das turmas de alguém (feed, ranking, chamada). */
export function turmaLabel(turmas: TurmaMembro[]): string | null {
  if (turmas.length === 0) return null
  return turmas
    .map((m) =>
      m.papel_danca
        ? `${m.turma} (${m.papel_danca === 'Condutor(a)' ? 'condutor' : 'conduzido'})`
        : m.turma,
    )
    .join(' · ')
}

export interface FeedItem {
  id: string
  user_id: string
  foto_url: string
  legenda: string | null
  criado_em: string
  /** Marcado como favorito pelo dono — aparece no perfil e não é arquivado. */
  favorito: boolean
  autor: {
    nome: string
    avatar_url: string | null
    /** Rótulo pronto para exibir ("Avançado (condutor) · Inter"). */
    turma: string | null
    /** Nomes crus das turmas — é por aqui que o filtro do feed casa. */
    turmas: string[]
    cargos: string[]
  }
  reacoes: { tipo: string; user_id: string }[]
  comentarios: number
}

/**
 * Check-in favoritado, como aparece na galeria do perfil. As fotos dos
 * check-ins comuns são apagadas pela política de retenção (4 meses);
 * as favoritas ficam guardadas.
 */
export interface CheckinFavorito {
  id: string
  foto_url: string
  legenda: string | null
  criado_em: string
  /**
   * Reações e comentários nunca foram perdidos: a retenção só apaga o
   * arquivo da foto, não a linha do check-in. Eles só não vinham nesta
   * consulta — por isso a galeria parecia esquecê-los.
   */
  reacoes: { tipo: string; user_id: string }[]
  comentarios: number
}

/**
 * Teto de favoritos por pessoa. Favorito = foto que nunca é apagada,
 * então o limite é o que segura o storage dentro do plano gratuito.
 * Mudou aqui? Mude também em `favoritar_checkin` (migração 005).
 */
export const LIMITE_FAVORITOS = 12

export interface Comment {
  id: string
  checkin_id: string
  user_id: string
  texto: string
  criado_em: string
  autor: { nome: string; avatar_url: string | null }
}

/**
 * Janela de check-in de um dia específico da semana. Cada espaço tem
 * seu próprio horário de aula, então cada dia pode ter uma janela
 * diferente dentro do mesmo desafio (ex.: segunda 18h–23h, quarta
 * 20h–22h). `hora_fim < hora_inicio` = janela vira a noite.
 */
export interface ChallengeJanela {
  /** 0 = domingo … 6 = sábado. */
  dia_semana: number
  /** "HH:MM" */
  hora_inicio: string
  /** "HH:MM" */
  hora_fim: string
}

/**
 * Trava de local: com ela, só conta ponto quem tirou a foto dentro do
 * raio. Serve para amarrar o desafio ao salão da aula ou ao local da
 * festa. Sem isso (local = null), vale de qualquer lugar.
 */
export interface ChallengeLocal {
  /** Como o aluno vê o lugar ("Espaço Livre", "Rep do Zé"). */
  nome: string | null
  lat: number
  lng: number
  raio_m: number
  /**
   * Quando a trava foi ligada (ISO). Check-in anterior a isso conta
   * como sempre contou — ligar a regra no meio do desafio não pode
   * confiscar ponto de quem já compareceu. O banco preenche sozinho
   * (migração 009); o cliente não define.
   */
  desde: string | null
}

/** Raio inicial sugerido: cobre um salão e o entorno imediato. */
export const RAIO_LOCAL_PADRAO_M = 200

/**
 * Desafio = competição de presença: quem somar mais check-ins válidos
 * dentro do período e da janela do dia (cada dia da semana pode ter
 * seu próprio horário) vence.
 */
export interface Challenge {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string // "YYYY-MM-DD"
  data_fim: string // "YYYY-MM-DD"
  /** No máximo uma janela por dia da semana. */
  janelas: ChallengeJanela[]
  /** null = conta de qualquer lugar. */
  local: ChallengeLocal | null
  /**
   * Evento pago: o aluno não entra nem sai sozinho, só a organização
   * adiciona (normalmente importando a lista de ingressos).
   */
  entrada_restrita: boolean
  criado_por: string | null
  participantes: number
  sou_membro: boolean
}

export interface ChallengeInput {
  id?: string
  titulo: string
  descricao: string
  data_inicio: string
  data_fim: string
  janelas: ChallengeJanela[]
  local: ChallengeLocal | null
  entrada_restrita: boolean
}

/**
 * Convidado de um desafio restrito que ainda não tem conta no app — a
 * festa é aberta, então parte da lista de ingressos é de fora do
 * projeto. Entra sozinho no desafio quando criar a conta.
 */
export interface ConvidadoDesafio {
  /** Normalizado (só dígitos) — é a chave que casa com o cadastro. */
  telefone: string
  /** Como veio na planilha, para conferir a olho. */
  telefone_exibicao: string | null
  nome: string | null
}

export interface RankingEntry {
  user_id: string
  nome: string
  avatar_url: string | null
  turma: string | null
  pontos: number
}

/** Evento da agenda: data única (ex.: Forró na Rep) ou semanal (aula da turma). */
export interface AgendaEvent {
  id: string
  titulo: string
  descricao: string | null
  /** null = para todo mundo; senão só aparece para essa turma. */
  turma: string | null
  /** Recorrente semanal: 0–6. Excludente com `data`. */
  dia_semana: number | null
  /** Data única "YYYY-MM-DD". Excludente com `dia_semana`. */
  data: string | null
  /** "HH:MM" */
  hora: string | null
}

export interface AgendaEventInput {
  titulo: string
  descricao: string
  turma: string | null
  dia_semana: number | null
  data: string | null
  hora: string | null
}

/**
 * Alguém que fez check-in na mesma noite — candidato a "dancei com".
 *
 * A lista é limitada a quem esteve lá justamente para o marcar não
 * virar uma busca entre 300 pessoas: são uns 30 rostos, é só tocar.
 * E de quebra impede a mentira que incomodaria — dizer que dançou com
 * quem nem apareceu.
 */
export interface ParceiroPossivel {
  user_id: string
  nome: string
  avatar_url: string | null
  turma: string | null
  /** Já marquei essa pessoa nesta data. */
  marcado: boolean
  /** Os dois se marcaram. */
  confirmada: boolean
}

/** Par confirmado dos dois lados — é o que conta para distintivo. */
export interface ParceiroDanca {
  user_id: string
  nome: string
  avatar_url: string | null
  /** Quantas noites vocês dançaram juntos. */
  noites: number
}

export type TipoNotificacao = 'reacao' | 'comentario' | 'dupla'

/**
 * Item do painel de notificações.
 *
 * Não existe tabela para isso: a lista é montada das reações,
 * comentários e marcações que apontam para mim. Uma tabela própria
 * cresceria para sempre e precisaria de gatilhos para se manter em dia.
 */
export interface Notificacao {
  id: string
  tipo: TipoNotificacao
  criado_em: string
  autor: { id: string; nome: string; avatar_url: string | null }
  /** Reação: o emoji. Comentário: o texto. Dupla: null. */
  detalhe: string | null
  /** Para abrir a foto (reação e comentário). */
  checkin_id: string | null
  /** Dupla: a noite, e se ainda falta eu confirmar. */
  data?: string
  pendente?: boolean
}

/**
 * Quem confirmou presença numa ocorrência da agenda. A chave é
 * (pessoa, evento, data): confirmar a aula desta segunda não confirma
 * a da semana que vem.
 */
export interface ConfirmacaoPresenca {
  evento_id: string
  data: string // "YYYY-MM-DD"
  user_id: string
  nome: string
  avatar_url: string | null
}

/**
 * Feriado ou cancelamento pontual: suspende a(s) aula(s) recorrente(s)
 * numa data específica (ex.: feriado nacional, professor ausente).
 * `turma: null` cancela a aula de TODAS as turmas nesse dia; com uma
 * turma definida, cancela só a aula daquela turma.
 */
export interface Feriado {
  id: string
  data: string // "YYYY-MM-DD"
  motivo: string | null
  turma: string | null
  /**
   * Fecha também a janela dos desafios nesse dia. Sem isso, cancelar a
   * aula só avisava na agenda: quem aparecesse no salão marcava presença
   * num dia em que não houve forró.
   *
   * É uma escolha do cancelamento, e não uma consequência automática,
   * porque nem todo cancelamento fecha o espaço — um feriado que suspende
   * as aulas pode ser exatamente a noite do Forró na Rep.
   */
  suspende_desafios: boolean
}

export interface FeriadoInput {
  data: string
  motivo: string
  turma: string | null
  suspende_desafios: boolean
}

/**
 * Linha da lista de chamada: telefone → turma (+ papel na dança).
 * O mesmo telefone pode aparecer em várias linhas (uma por turma).
 */
export interface AlunoCadastrado {
  id: string
  nome: string | null
  telefone: string
  /**
   * null = veterano sem turma no semestre. A linha existe só para
   * liberar o cadastro; a pessoa entra no app sem vínculo de turma.
   */
  turma: string | null
  papel_danca: PapelDanca | null
}

/**
 * Distintivo exibido no perfil. Alguns são derivados automaticamente
 * (turma, presença, cargo…); outros são personalizados, criados e
 * concedidos manualmente pela organização (ver DistintivoDef).
 */
export interface Badge {
  id: string
  emoji: string
  titulo: string
  descricao: string
}

/**
 * Catálogo de distintivos personalizados que a organização pode criar
 * e entregar pra quem quiser — não só quem venceu um desafio. Dá pra
 * entregar a um aluno específico ou ao topo do ranking de um desafio
 * (top 1, top 3, top 5…).
 */
export interface DistintivoDef {
  id: string
  emoji: string
  titulo: string
  descricao: string
  /** Quantas pessoas já receberam — ajuda a navegar quando há muitos. */
  concedidos: number
}

export interface DistintivoDefInput {
  emoji: string
  titulo: string
  descricao: string
}

/** Quem recebeu um distintivo personalizado — pro painel gerenciar. */
export interface DistintivoRecebedor {
  user_id: string
  nome: string
  concedido_em: string
}

export interface AttendanceRow {
  data: string
  nome: string
  turma: string
}

export interface Report {
  id: string
  checkin_id: string
  motivo: string | null
  criado_em: string
  foto_url: string | null
  autor_nome: string | null
  denunciante_nome: string | null
}

/** Turma do semestre, definida pela organização (ex.: "Iniciante 01"). */
export interface Turma {
  id: string
  nome: string
}

/** Cargo no projeto (Presidência, Diretor(a) de Ensino, Monitor(a)…). */
export interface Cargo {
  id: string
  nome: string
}

/** Cargos padrão do Forró de Segunda (editáveis no painel). */
export const CARGOS_PADRAO = [
  'Presidência',
  'Vice-Presidência',
  'Diretor(a) de Ensino',
  'Diretor(a) de RH',
  'Diretor(a) de Comunicação',
  'Diretor(a) de Recursos',
  'Professor(a)',
  'Monitor(a)',
  'Membro de RH',
  'Membro de Comunicação',
  'Membro de Recursos',
] as const

/** Peso hierárquico do cargo (menor = mais alto). Usado para destacar. */
export function pesoCargo(nome: string): number {
  const n = nome.toLowerCase()
  if (n.includes('presid')) return n.includes('vice') ? 2 : 1
  if (n.includes('diretor')) return 3
  if (n.includes('professor')) return 4
  if (n.includes('monitor')) return 5
  if (n.includes('membro')) return 6
  return 7
}

/**
 * Está na equipe do projeto: tem qualquer cargo (diretoria, professor,
 * monitor, membro de comissão…). Lista inicial da busca — mostrar o
 * projeto inteiro deixa de caber conforme ele cresce, e a equipe é quem
 * se procura sem saber o nome.
 *
 * Qualquer cargo, e não uma lista fechada, para que cargo novo criado
 * no painel entre aqui sozinho.
 */
export function ehEquipeDoProjeto(cargos: string[]): boolean {
  return cargos.length > 0
}

/** Cargo mais alto de alguém — é o que aparece em destaque no feed. */
export function cargoPrincipal(cargos: string[]): string | null {
  if (cargos.length === 0) return null
  return [...cargos].sort((a, b) => pesoCargo(a) - pesoCargo(b))[0]
}

/** Emoji do cargo — por palavra-chave, para cargos novos também terem um. */
export function emojiCargo(nome: string): string {
  const n = nome.toLowerCase()
  if (n.includes('presid')) return n.includes('vice') ? '⭐' : '👑'
  if (n.includes('ensino')) return '📚'
  if (n.includes('professor')) return '🪗'
  if (n.includes('monitor')) return '🙋'
  if (n.includes('comunica')) return '📣'
  if (n.includes('recurso')) return '💰'
  if (n.includes('rh') || n.includes('humanos')) return '🤝'
  return '🎖️'
}

export const REACTION_TYPES = ['❤️', '🔥', '👏', '💃'] as const

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

export const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
