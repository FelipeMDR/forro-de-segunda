/**
 * Estado das permissões do navegador (câmera e localização).
 *
 * Serve para NÃO pedir o que já está resolvido: se a pessoa já liberou,
 * não há diálogo nenhum a mostrar; se já bloqueou, disparar o pedido de
 * novo não abre diálogo algum — o navegador recusa na hora, e o app
 * ficaria dando erro genérico em vez de explicar como liberar.
 *
 * IMPORTANTE, sobre o que este arquivo NÃO resolve: quem decide se uma
 * permissão concedida sobrevive ao fechar o app é o navegador, não o
 * site. No Chrome/Android uma permissão dada em https vale para sempre.
 * No Safari do iPhone, um site aberto pelo navegador perde a permissão
 * de câmera A CADA SESSÃO — e é por isso que o app parece pedir toda
 * vez. Instalado na tela inicial, o mesmo iPhone passa a lembrar.
 * Por isso o convite para instalar aparece junto do aviso de permissão
 * (ver `CheckinPage`): é a única coisa que de fato faz parar de pedir.
 */

export type EstadoPermissao =
  | 'liberada'
  | 'bloqueada'
  | 'vai_perguntar'
  /** Não deu para saber — trate como "tente normalmente". */
  | 'desconhecido'

/** Nomes que nos interessam, no vocabulário da Permissions API. */
type NomePermissao = 'camera' | 'geolocation'

/**
 * Consulta o estado, quando o navegador deixa.
 *
 * A Permissions API é irregular de propósito: o Safari não responde por
 * `camera` (lança TypeError), navegadores antigos não têm a API, e
 * alguns respondem `prompt` mesmo já tendo permissão de sessão. Toda
 * falha vira `desconhecido`, que os chamadores tratam como "siga o
 * fluxo normal" — nunca como bloqueio.
 */
export async function estadoDaPermissao(
  nome: NomePermissao,
): Promise<EstadoPermissao> {
  try {
    if (!navigator.permissions?.query) return 'desconhecido'
    const r = await navigator.permissions.query({
      // O TS só conhece um punhado de nomes; `camera` existe no Chrome
      // e é justamente o que a tipagem padrão não cobre.
      name: nome as PermissionName,
    })
    if (r.state === 'granted') return 'liberada'
    if (r.state === 'denied') return 'bloqueada'
    return 'vai_perguntar'
  } catch {
    return 'desconhecido'
  }
}
