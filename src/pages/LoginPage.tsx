import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Icone } from '../components/Icone'
import { LogoWordmark } from '../components/Logo'
import { BotaoAcao, BotaoIcone, BotaoSuave } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { EmailNaoConfirmado } from '../lib/api'
import { telefoneValido } from '../lib/phone'

/**
 * Entrada do app em passos, um por tela:
 *
 *   inicio   → a marca, a frase e os dois caminhos
 *   telefone → "qual o seu celular?" (o cadastro só abre para quem está
 *              na lista de chamada)
 *   cadastro → achou na lista: e-mail, senha e o aceite da LGPD
 *   entrar   → e-mail (ou telefone, nas contas antigas) e senha
 *
 * Recuperar a senha e confirmar o e-mail são desvios de `entrar` e
 * `cadastro`, e voltam para eles.
 */
type Etapa = 'inicio' | 'telefone' | 'cadastro' | 'entrar'

/** Moldura de cada passo: voltar em cima, conteúdo, ação presa embaixo. */
function Passo({
  onVoltar,
  children,
  rodape,
}: {
  onVoltar?: () => void
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <div className="anima-tela flex flex-1 flex-col gap-5">
      {onVoltar && <BotaoIcone icone="voltar" rotulo="Voltar" variante="chip" onClick={onVoltar} />}
      {children}
      <div className="flex-1" />
      {rodape}
    </div>
  )
}

function Titulo({ sobre, cor, children, texto }: {
  sobre?: string
  cor?: string
  children: ReactNode
  texto?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {sobre && <span className={`text-sm font-bold ${cor ?? 'text-or-t'}`}>{sobre}</span>}
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.05] tracking-[-.02em]">
        {children}
      </h1>
      {texto && <p className="text-base leading-relaxed text-ink2 [text-wrap:pretty]">{texto}</p>}
    </div>
  )
}

export function LoginPage() {
  const { api, userId, carregando } = useAuth()
  const toast = useToast()
  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Recuperação de senha: null = fechado; string = e-mail digitado
  const [recuperando, setRecuperando] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  // Conta criada (ou tentando entrar) esperando o clique no e-mail:
  // null = nada pendente; string = o endereço que precisa confirmar
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [reenviado, setReenviado] = useState(false)
  /** Consentimento da LGPD — sem ele o cadastro não segue. */
  const [aceitou, setAceitou] = useState(false)
  // Achou o telefone na lista: o nome que veio dela (pode faltar)
  const [verificado, setVerificado] = useState<{ nome: string | null } | null>(null)
  // Só entra em jogo quando a lista de chamada não trouxe nome para o
  // telefone: aí quem se apresenta é a própria pessoa.
  const [nome, setNome] = useState('')
  // Demo: formulário de organizador
  const [orgAberto, setOrgAberto] = useState(false)
  const [orgNome, setOrgNome] = useState('')

  if (userId && !carregando) return <Navigate to="/" replace />

  const irPara = (e: Etapa) => {
    setEtapa(e)
    if (e === 'inicio' || e === 'entrar') {
      setVerificado(null)
      setNome('')
    }
    setSenha('')
    setConfirmar('')
    setRecuperando(null)
    setEnviado(false)
    setConfirmando(null)
    setReenviado(false)
  }

  const reenviarConfirmacao = async () => {
    setOcupado(true)
    try {
      await api.reenviarConfirmacao(confirmando ?? '')
      setReenviado(true)
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const pedirRecuperacao = async (e: FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    try {
      await api.solicitarResetSenha(recuperando ?? '')
      setEnviado(true)
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    try {
      await api.signInTelefone(telefone, senha)
    } catch (err) {
      // Senha certa, só falta o clique no link: em vez de repetir o
      // recado, a tela passa a oferecer o reenvio
      if (err instanceof EmailNaoConfirmado) setConfirmando(err.email)
      else toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const verificarTelefone = async (e: FormEvent) => {
    e.preventDefault()
    if (!telefoneValido(telefone)) {
      toast('Digite o celular com DDD', 'erro')
      return
    }
    setOcupado(true)
    try {
      const { existe, nome, jaTemConta } = await api.telefoneNaLista(telefone)
      if (jaTemConta) {
        toast('Este celular já tem conta — é só entrar!')
        irPara('entrar')
        return
      }
      if (!existe) {
        toast('Celular não encontrado na lista de chamada. Fale com a organização!', 'erro')
        return
      }
      setVerificado({ nome })
      setEtapa('cadastro')
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const criarConta = async (e: FormEvent) => {
    e.preventDefault()
    if (senha !== confirmar) {
      toast('As senhas não conferem', 'erro')
      return
    }
    if (!aceitou) {
      toast('Você precisa aceitar o aviso de privacidade para criar a conta', 'erro')
      return
    }
    // A lista não trouxe nome e a pessoa não digitou: sem isso a conta
    // nasceria "Dançarino(a)", e ninguém no painel saberia quem é.
    if (!verificado?.nome && nome.trim().length < 2) {
      toast('Conta pra gente como você se chama', 'erro')
      return
    }
    setOcupado(true)
    try {
      // 'entrou' não precisa de tela: a sessão já existe e o app troca
      // sozinho para a tela Hoje
      if ((await api.signUpTelefone(telefone, email, senha, nome)) === 'confirmar') {
        setConfirmando(email.trim())
      }
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const criarOrganizador = async (e: FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    try {
      await api.demoSignUpOrganizador(orgNome, telefone, senha || 'demo123')
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const demo = api.mode === 'demo' && (
    <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-sf px-4 py-3 text-[13px] leading-snug text-ink2">
      <p>
        <b className="text-ink">Modo demonstração</b> — dados só neste aparelho. Entrar:{' '}
        <b>11 98888-0001</b> / senha <b>forro123</b>. Primeira vez: <b>11 99999-0000</b> ou{' '}
        <b>11 97777-1234</b>.
      </p>
      <button
        type="button"
        className="self-start text-[13px] font-bold text-bl-t"
        onClick={() => setOrgAberto((v) => !v)}
      >
        {orgAberto ? '▾' : '▸'} Criar conta de organizador(a) — demo
      </button>
      {orgAberto && (
        <form onSubmit={criarOrganizador} className="flex flex-col gap-2.5">
          <input className="input" placeholder="Nome" value={orgNome} onChange={(e) => setOrgNome(e.target.value)} required />
          <input className="input" type="tel" placeholder="Telefone (opcional)" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          <input className="input" type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <BotaoSuave type="submit" bloco disabled={ocupado}>
            Entrar como organizador(a)
          </BotaoSuave>
        </form>
      )}
    </div>
  )

  let conteudo: ReactNode

  if (confirmando !== null) {
    conteudo = (
      <Passo onVoltar={() => irPara('entrar')}>
        <Titulo sobre="Falta um passo" cor="text-bl-t" texto={
          <>
            Mandamos um link de confirmação para <b className="break-all text-ink">{confirmando}</b>.
            Clique nele e sua conta está liberada. Não achou? Olhe no spam — e confira se o
            endereço está escrito certinho.
          </>
        }>
          Confira seu e-mail
        </Titulo>
        {reenviado ? (
          <p className="rounded-2xl border-[1.5px] border-verde-500 bg-sf px-4 py-3 text-[15px]">
            Pronto, mandamos outro link.
          </p>
        ) : (
          <BotaoSuave tamanho="g" bloco disabled={ocupado} onClick={() => void reenviarConfirmacao()}>
            {ocupado ? 'Enviando…' : 'Não recebi — mandar de novo'}
          </BotaoSuave>
        )}
        <button type="button" className="text-[15px] font-extrabold text-bl-t" onClick={() => irPara('entrar')}>
          Já confirmei, quero entrar
        </button>
      </Passo>
    )
  } else if (etapa === 'inicio') {
    conteudo = (
      <div className="anima-tela flex flex-1 flex-col gap-5">
        <div className="flex flex-1 flex-col justify-center gap-7">
          <div className="self-center [filter:drop-shadow(0_6px_0_rgba(0,5,7,.25))]">
            <LogoWordmark largura={300} prioridade />
          </div>
          <div className="flex flex-col gap-3 text-center">
            <p className="text-[22px] font-bold leading-tight [text-wrap:balance]">
              A foto da aula é a sua presença.
            </p>
            <p className="text-base leading-snug text-ink2 [text-wrap:pretty]">
              Conte quantas noites você dançou e com quanta gente diferente.
            </p>
          </div>
        </div>
        {demo}
        <div className="flex flex-col gap-3">
          <BotaoAcao tamanho="g" bloco className="min-h-[58px] text-lg" onClick={() => irPara('telefone')}>
            Criar conta
          </BotaoAcao>
          <BotaoSuave tamanho="g" bloco className="text-[17px]" onClick={() => irPara('entrar')}>
            Já tenho conta
          </BotaoSuave>
          <Link to="/privacidade" className="p-2 text-center text-sm text-ink3">
            Política de privacidade
          </Link>
        </div>
      </div>
    )
  } else if (etapa === 'telefone') {
    conteudo = (
      <form onSubmit={verificarTelefone} className="flex flex-1 flex-col">
        <Passo
          onVoltar={() => irPara('inicio')}
          rodape={
            <BotaoAcao type="submit" tamanho="g" bloco className="text-lg" disabled={ocupado}>
              {ocupado ? 'Procurando…' : 'Continuar'}
            </BotaoAcao>
          }
        >
          <Titulo
            sobre="Passo 1 de 2"
            texto="O cadastro é liberado para quem está na lista de chamada. Se o número estiver lá, seu nome já vem preenchido."
          >
            Qual o seu celular?
          </Titulo>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-label="Celular com DDD"
            placeholder="(35) 9 0000-0000"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
            className="h-[60px] rounded-2xl border-2 border-linha bg-sf px-[18px] text-[22px] font-bold tracking-[.02em] text-ink outline-none focus:border-brasa-500"
          />
          <div className="flex items-start gap-2.5 text-sm leading-snug text-ink3">
            <Icone nome="cadeado" tamanho={18} traco={2} className="mt-px shrink-0" />
            <span>Seu telefone nunca aparece para outras pessoas.</span>
          </div>
        </Passo>
      </form>
    )
  } else if (etapa === 'cadastro' && verificado) {
    conteudo = (
      <form onSubmit={criarConta} className="flex flex-1 flex-col">
        <Passo
          onVoltar={() => irPara('telefone')}
          rodape={
            <BotaoAcao type="submit" tamanho="g" bloco className="text-lg" disabled={ocupado || !aceitou}>
              {ocupado ? 'Criando…' : 'Criar conta'}
            </BotaoAcao>
          }
        >
          <Titulo sobre="Achamos você na lista" cor="text-gr-t">
            {verificado.nome ? `Oi, ${verificado.nome.split(' ')[0]}!` : 'Oi!'}
          </Titulo>
          {verificado.nome ? (
            <div className="flex justify-between gap-3 rounded-[18px] border border-linha bg-sf p-4 text-[15px]">
              <span className="text-ink3">Nome</span>
              <b className="text-right">{verificado.nome}</b>
            </div>
          ) : (
            // A lista não trouxe nome (planilha sem a coluna, linha em
            // branco): é aqui que a pessoa se apresenta. Não aparece
            // quando a lista tem nome — o banco dá preferência à lista,
            // e um campo editável que fosse ignorado seria pior.
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                className="input"
                aria-label="Seu nome"
                placeholder="Como a galera te chama"
                autoComplete="name"
                value={nome}
                minLength={2}
                onChange={(e) => setNome(e.target.value)}
                required
              />
              <span className="px-1 text-[13px] text-ink3">
                É assim que você vai aparecer no feed e no ranking.
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <input
              type="email"
              className="input"
              aria-label="E-mail"
              placeholder="E-mail"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              aria-label="Crie uma senha"
              placeholder="Crie uma senha (mín. 6)"
              autoComplete="new-password"
              value={senha}
              minLength={6}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              aria-label="Confirme a senha"
              placeholder="Confirme a senha"
              autoComplete="new-password"
              value={confirmar}
              minLength={6}
              onChange={(e) => setConfirmar(e.target.value)}
              required
            />
          </div>
          {/* O aceite é a condição do cadastro, então mora aqui e não num
              rodapé de letra miúda: sem marcar, o botão não passa. O link
              abre numa aba nova para não perder o que já foi digitado. */}
          <label className="flex cursor-pointer items-start gap-3 py-1 text-[15px] leading-snug text-ink2">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
            />
            <span
              aria-hidden
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border-2 border-preto text-preto peer-focus-visible:ring-2 peer-focus-visible:ring-brasa-500 ${
                aceitou ? 'bg-verde-500' : 'bg-branco'
              }`}
            >
              {aceitou && <Icone nome="check" tamanho={16} traco={3.2} />}
            </span>
            <span>
              Li e aceito os termos de uso e o{' '}
              <Link
                to="/privacidade"
                target="_blank"
                rel="noopener"
                className="font-bold text-bl-t underline"
                onClick={(e) => e.stopPropagation()}
              >
                aviso de privacidade
              </Link>{' '}
              (LGPD), e autorizo o uso dos meus dados para registrar minha presença.
            </span>
          </label>
        </Passo>
      </form>
    )
  } else if (recuperando !== null) {
    conteudo = enviado ? (
      <Passo onVoltar={() => irPara('entrar')}>
        <Titulo sobre="Link a caminho" cor="text-gr-t" texto="Se existir uma conta com esse e-mail, o link para criar uma senha nova já está a caminho. Não achou? Olhe no spam. O link vale por pouco tempo — se expirar, é só pedir de novo.">
          Confira seu e-mail
        </Titulo>
        <BotaoSuave tamanho="g" bloco onClick={() => irPara('entrar')}>
          Voltar para entrar
        </BotaoSuave>
      </Passo>
    ) : (
      <form onSubmit={pedirRecuperacao} className="flex flex-1 flex-col">
        <Passo
          onVoltar={() => setRecuperando(null)}
          rodape={
            <BotaoAcao type="submit" tamanho="g" bloco className="text-lg" disabled={ocupado}>
              {ocupado ? 'Enviando…' : 'Enviar link'}
            </BotaoAcao>
          }
        >
          <Titulo texto="Digite o e-mail que você cadastrou e a gente manda um link para criar uma senha nova.">
            Esqueci minha senha
          </Titulo>
          <input
            type="email"
            className="input"
            aria-label="E-mail"
            placeholder="voce@email.com"
            value={recuperando}
            onChange={(e) => setRecuperando(e.target.value)}
            required
          />
          <p className="text-sm leading-snug text-ink3">
            Não cadastrou e-mail, ou não lembra qual usou? Fale com a organização na aula ou
            no grupo do WhatsApp.
          </p>
        </Passo>
      </form>
    )
  } else {
    conteudo = (
      <form onSubmit={entrar} className="flex flex-1 flex-col">
        <Passo
          onVoltar={() => irPara('inicio')}
          rodape={
            <>
              {demo}
              <BotaoAcao type="submit" tamanho="g" bloco className="text-lg" disabled={ocupado}>
                {ocupado ? 'Entrando…' : 'Entrar'}
              </BotaoAcao>
            </>
          }
        >
          <Titulo>Que bom te ver de novo</Titulo>
          <div className="flex flex-col gap-2.5">
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              className="input"
              aria-label="E-mail"
              placeholder="E-mail"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              className="input"
              aria-label="Senha"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          <button
            type="button"
            className="self-start text-[15px] font-bold text-bl-t"
            onClick={() => setRecuperando(telefone.includes('@') ? telefone : '')}
          >
            Esqueci minha senha
          </button>
          {/* Contas criadas antes do e-mail ainda entram pelo número. */}
          <span className="text-sm leading-snug text-ink3">
            Conta antiga? Você ainda pode entrar com o telefone.
          </span>
        </Passo>
      </form>
    )
  }

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)',
      }}
    >
      {conteudo}
    </div>
  )
}
