import { useNavigate } from 'react-router-dom'
import { LogoWordmark } from '../components/Logo'
import { VERSAO_TERMOS } from '../lib/termos'

/** Contato do encarregado de dados (LGPD, art. 41). */
export const EMAIL_CONTATO = 'fds.itajuba.suporte@gmail.com'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-tinta-500">
        {titulo}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-tinta-700">
        {children}
      </div>
    </section>
  )
}

/**
 * Aviso de privacidade.
 *
 * Fica FORA do RequireAuth: precisa ser lido antes de criar a conta, que
 * é justamente quando a pessoa ainda não tem sessão.
 *
 * O texto descreve o que o app realmente faz — foi escrito lendo o
 * código e o banco, não copiado de modelo. Se algo mudar no que é
 * coletado ou em quem vê o quê, este texto muda junto e a versão sobe
 * (ver VERSAO_TERMOS).
 */
export function PrivacidadePage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LogoWordmark largura={200} />
      </div>

      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-sm font-bold text-tinta-600"
      >
        ← Voltar
      </button>

      <h1 className="text-xl font-extrabold">Privacidade e uso de dados</h1>
      <p className="mt-1 text-xs text-tinta-500">
        Versão {VERSAO_TERMOS} · Forró de Segunda, Itajubá&nbsp;(MG)
      </p>

      <div className="mt-6 space-y-6">
        <Secao titulo="Em uma frase">
          <p>
            Este app existe para registrar a presença nas aulas de forró e
            deixar a turma acompanhar isso junto. Guardamos o mínimo para
            fazer essas duas coisas, não vendemos nada para ninguém e você
            pode pedir seus dados de volta ou a exclusão a qualquer momento.
          </p>
        </Secao>

        <Secao titulo="Quem cuida dos seus dados">
          <p>
            O projeto Forró de Segunda (Espaço Livre, Itajubá&nbsp;–&nbsp;MG),
            por meio da sua diretoria. Para qualquer assunto sobre seus
            dados, incluindo os pedidos descritos mais abaixo, escreva para{' '}
            <strong className="break-all">{EMAIL_CONTATO}</strong> ou fale com
            a organização na aula.
          </p>
        </Secao>

        <Secao titulo="O que coletamos">
          <p>
            <strong>Antes de você criar a conta.</strong> A organização
            mantém a lista de chamada com <strong>nome</strong>,{' '}
            <strong>telefone</strong>, <strong>turma</strong> e{' '}
            <strong>papel na dança</strong> (condutor ou conduzido), a partir
            da sua inscrição no projeto. É o telefone dessa lista que libera
            o cadastro no app.
          </p>
          <p>
            <strong>Ao criar a conta.</strong> Seu{' '}
            <strong>e-mail</strong> e uma <strong>senha</strong>. A senha é
            guardada cifrada e ninguém da organização consegue vê-la.
          </p>
          <p>
            <strong>Usando o app.</strong> As <strong>fotos</strong> de
            check-in e suas legendas, sua <strong>foto de perfil</strong>, as{' '}
            <strong>reações</strong> e <strong>comentários</strong> que você
            faz, as <strong>duplas</strong> que você marca, as confirmações
            de presença ("Eu vou") e a data e hora de cada check-in.
          </p>
          <p>
            <strong>Localização, só quando o desafio exige.</strong> Alguns
            desafios só contam ponto se a foto for tirada no local. Nesse
            caso o app pede sua posição e{' '}
            <strong>
              compara com o local do desafio sem guardar a coordenada
            </strong>
            : fica registrado apenas o resultado da comparação (dentro ou
            fora). Não existe nenhum histórico de onde você esteve.
          </p>
          <p>
            <strong>Notificações.</strong> Se você autorizar os lembretes de
            aula, guardamos o endereço de envio que o seu navegador gera. Ele
            não identifica você fora do app.
          </p>
        </Secao>

        <Secao titulo="Para que usamos">
          <p>
            Para registrar sua presença, calcular ranking e distintivos,
            montar o feed da turma e avisar sobre as aulas. Nada disso é
            usado para propaganda, e não há qualquer decisão automatizada
            sobre você além da contagem de pontos dos desafios.
          </p>
        </Secao>

        <Secao titulo="Quem enxerga o quê">
          <p>
            <strong>Os outros alunos com conta</strong> veem seu nome, foto
            de perfil, turma, cargo no projeto, suas fotos de check-in,
            reações, comentários, distintivos e as duplas confirmadas.
          </p>
          <p>
            <strong>Só a organização</strong> vê seu telefone, seu e-mail e
            os relatórios de frequência.
          </p>
          <p>
            <strong>Ninguém de fora.</strong> O app inteiro exige conta, e a
            conta exige estar na lista de chamada. Nada aqui é público na
            internet nem indexado por buscadores.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            <strong>Fotos de check-in: 4 meses.</strong> Depois disso elas
            são apagadas automaticamente e fica só o registro de que você
            esteve presente. As fotos que você marcar como{' '}
            <strong>favoritas</strong> (até 12) escapam dessa limpeza e ficam
            guardadas enquanto a conta existir.
          </p>
          <p>
            O <strong>registro de presença</strong> e os distintivos duram
            enquanto o projeto durar — é o histórico que dá sentido ao
            ranking e à retrospectiva. Sua <strong>conta</strong> dura até
            você pedir a exclusão.
          </p>
        </Secao>

        <Secao titulo="Com quem dividimos">
          <p>
            Apenas com os serviços que fazem o app funcionar, e só no que é
            necessário para isso:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Supabase</strong> — banco de dados, contas e
              armazenamento das fotos
            </li>
            <li>
              <strong>Vercel</strong> — hospedagem do aplicativo
            </li>
            <li>
              <strong>Google (Gmail)</strong> — envio dos e-mails de
              confirmação e de recuperação de senha
            </li>
          </ul>
          <p>
            Esses serviços têm servidores fora do Brasil, o que a LGPD
            permite. <strong>Nenhum dado é vendido</strong> nem cedido para
            publicidade.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            A LGPD (art. 18) garante que você pode, a qualquer momento:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>saber quais dados seus existem e pedir uma cópia deles;</li>
            <li>corrigir o que estiver errado ou desatualizado;</li>
            <li>
              pedir a <strong>exclusão da sua conta</strong> e dos seus dados;
            </li>
            <li>
              retirar este consentimento — o que encerra sua participação no
              app, já que sem ele não há como registrar presença;
            </li>
            <li>saber com quem os dados foram compartilhados.</li>
          </ul>
          <p>
            Boa parte disso você resolve sozinho no app: trocar nome, e-mail
            e senha no perfil, apagar uma foto sua pelo menu da publicação,
            desmarcar uma dupla. Para o resto, escreva para{' '}
            <strong className="break-all">{EMAIL_CONTATO}</strong>.
          </p>
        </Secao>

        <Secao titulo="Se você tem menos de 16 anos">
          <p>
            Nesse caso o cadastro precisa do consentimento de um dos seus
            pais ou responsável (LGPD, art. 14). Fale com a organização antes
            de criar a conta.
          </p>
        </Secao>

        <Secao titulo="Quando este texto mudar">
          <p>
            Se mudarmos o que é coletado, para quê, com quem dividimos ou por
            quanto tempo guardamos, publicamos uma versão nova e avisamos no
            app. A versão que você aceitou fica registrada junto da sua
            conta.
          </p>
        </Secao>
      </div>
    </div>
  )
}
