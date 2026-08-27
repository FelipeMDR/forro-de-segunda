import { ehNavegadorEmbutido, useInstalacao } from '../lib/instalacao'
import { BotaoInstalar } from './BotaoInstalar'

/**
 * "Por que ele pergunta toda vez?" — respondido no lugar em que a
 * pergunta nasce.
 *
 * Quem decide se uma permissão sobrevive ao fechar o app é o navegador,
 * não o site: no Safari do iPhone, um site aberto pelo navegador perde a
 * permissão de câmera a cada sessão. Não existe API, ajuste ou truque
 * que faça um site contornar isso — a única saída é o app estar na tela
 * inicial, e aí o mesmo iPhone passa a lembrar.
 *
 * Por isso este aviso aparece junto do pedido de permissão, e não só no
 * topo do feed: é ali que a pessoa está incomodada e disposta a resolver.
 * Quem já instalou não vê nada — para essa pessoa o problema não existe.
 */
export function DicaInstalarParaPermissao() {
  const { jaInstalado, temPromptNativo, ios } = useInstalacao()

  if (jaInstalado) return null

  // Navegador embutido (link do Instagram, do WhatsApp…) é o pior caso:
  // a janela é descartada ao fechar, então a permissão NUNCA sobrevive,
  // e nem instalar dá para oferecer daqui. Merece recado próprio — sem
  // ele a pessoa fica liberando a câmera todo santo dia sem entender.
  if (ehNavegadorEmbutido()) {
    return (
      <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
        <p className="font-bold">Por isso ele pergunta toda vez</p>
        <p className="mt-0.5 text-xs">
          Você abriu o app pelo navegador de dentro de outro aplicativo
          (Instagram, WhatsApp…), e ele esquece tudo ao fechar. Toque nos
          <strong> ··· </strong> aqui em cima, escolha{' '}
          <strong>Abrir no navegador</strong> e, de lá, adicione à tela
          inicial — aí ele pergunta uma vez só.
        </p>
      </div>
    )
  }

  // Sem caminho de instalação nenhum, prometer que instalar resolve
  // seria enganação. `BotaoInstalar` usa exatamente a mesma condição —
  // e no iPhone fora do Safari ele abre o guia de "Abrir no Safari".
  if (!ios && !temPromptNativo) return null

  return (
    <div className="rounded-2xl bg-azul-500/10 px-4 py-3 text-sm text-azul-700">
      <p className="font-bold">Cansado de liberar toda vez?</p>
      <p className="mt-0.5 text-xs">
        Abrindo pelo navegador, o celular esquece a permissão sempre que
        você fecha o app. Com o Forró de Segunda na tela inicial, ele
        pergunta uma vez só.
      </p>
      <div className="mt-2">
        <BotaoInstalar
          className="btn-primary px-3 py-1.5 text-xs"
          rotulo="Deixar na tela inicial"
        />
      </div>
    </div>
  )
}
