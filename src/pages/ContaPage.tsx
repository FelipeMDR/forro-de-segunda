import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartaoInstalar } from '../components/BotaoInstalar'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { enablePush, isPushEnabled, pushSupported } from '../lib/push'

/**
 * Uma linha do cartão de dados: rótulo à esquerda, valor à direita.
 *
 * Fechada, é só leitura — que é o estado em que a pessoa passa 99% do
 * tempo aqui. Tocar abre o editor embaixo. Antes os três campos ficavam
 * abertos o tempo todo, com três botões de salvar, e a tela virava um
 * formulário para uma coisa que se mexe uma vez por ano.
 */
function LinhaConta({
  rotulo,
  valor,
  acao,
  aberta,
  onAlternar,
  children,
}: {
  rotulo: string
  valor?: string | null
  /** Texto do lado direito quando não há valor a mostrar (ex.: "Trocar"). */
  acao?: string
  aberta: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-preto/5"
      >
        <span className="shrink-0 text-sm text-tinta-600">{rotulo}</span>
        <span
          className={`min-w-0 flex-1 truncate text-right text-sm font-bold ${
            acao ? 'text-azul-700' : 'text-tinta-900'
          }`}
        >
          {acao ?? valor ?? '—'}
        </span>
      </button>
      {aberta && <div className="space-y-2 px-4 pb-4">{children}</div>}
    </div>
  )
}

/** Interruptor no padrão do print — usado só pelos lembretes push. */
function Interruptor({
  ligado,
  onClick,
  rotulo,
}: {
  ligado: boolean
  onClick: () => void
  rotulo: string
}) {
  return (
    <button
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        ligado ? 'bg-verde-600' : 'bg-preto/20'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
          ligado ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/**
 * Tudo que a pessoa configura da própria conta.
 *
 * Saiu do perfil: lá se mistura "quem eu sou no projeto" com "onde troco
 * minha senha", e para chegar em "sair da conta" rolava-se a tela
 * inteira. O perfil ficou com identidade e conquistas; a configuração
 * ganhou endereço próprio, atrás da engrenagem.
 */
export function ContaPage() {
  const { api, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [aberta, setAberta] = useState<'nome' | 'email' | 'senha' | null>(null)
  const [nome, setNome] = useState(profile?.nome ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  // Endereço que já foi pedido mas ainda espera o clique no link. Fica
  // como aviso fixo, não toast: é uma instrução de vários passos.
  const [aguardandoLink, setAguardandoLink] = useState<string | null>(null)
  const [pushAtivo, setPushAtivo] = useState(false)

  useEffect(() => {
    setNome(profile?.nome ?? '')
    setEmail(profile?.email ?? '')
  }, [profile])

  useEffect(() => {
    void isPushEnabled().then(setPushAtivo)
  }, [])

  if (!profile) return <Spinner texto="Carregando…" />
  const semEmail = !profile.email

  const alternar = (qual: 'nome' | 'email' | 'senha') =>
    setAberta((a) => (a === qual ? null : qual))

  const salvarNome = async () => {
    setSalvando('nome')
    try {
      await api.updateProfile({ nome: nome.trim() })
      await refreshProfile()
      setAberta(null)
      toast('Nome atualizado! ✨')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(null)
    }
  }

  const salvarEmail = async () => {
    setSalvando('email')
    try {
      if ((await api.trocarEmail(email)) === 'confirmar') {
        setAguardandoLink(email.trim())
      } else {
        setAguardandoLink(null)
        await refreshProfile()
        setAberta(null)
        toast('E-mail salvo! Agora dá para recuperar a senha por ele 📬')
      }
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(null)
    }
  }

  const salvarSenha = async () => {
    if (senha !== confirmar) {
      toast('As senhas não conferem', 'erro')
      return
    }
    setSalvando('senha')
    try {
      await api.trocarSenha(senha)
      setSenha('')
      setConfirmar('')
      setAberta(null)
      toast('Senha alterada! 🔑')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(null)
    }
  }

  const alternarPush = async () => {
    if (pushAtivo) {
      // O app consegue pedir a permissão, mas não retirá-la: quem manda
      // nela é o navegador. Dizer isso é melhor que um botão que finge.
      toast(
        'Para desativar, use as notificações do app nas configurações do seu celular.',
      )
      return
    }
    const ok = await enablePush(api)
    setPushAtivo(ok)
    toast(
      ok
        ? 'Lembretes ativados! Te avisamos quando tiver forró 🎶'
        : 'Não foi possível ativar as notificações',
      ok ? 'ok' : 'erro',
    )
  }

  const reiniciarDemo = () => {
    localStorage.removeItem('fds-demo-db-v10')
    localStorage.removeItem('fds-demo-uid')
    window.location.reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/perfil')}
          aria-label="Voltar para o perfil"
          className="-ml-1 shrink-0 rounded-full px-2 py-1 text-lg text-tinta-600 transition active:scale-90"
        >
          ←
        </button>
        <h1 className="text-xl font-extrabold">Meus dados e acesso</h1>
      </div>

      {semEmail && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-800">
          <strong>Cadastre seu e-mail.</strong> Sua conta é anterior a essa
          novidade, então hoje, se você esquecer a senha, só a organização
          consegue te destravar. Com um e-mail aqui, você resolve sozinho.
        </p>
      )}

      <div className="card divide-y divide-preto/10 overflow-hidden">
        <LinhaConta
          rotulo="Nome"
          valor={profile.nome}
          aberta={aberta === 'nome'}
          onAlternar={() => alternar('nome')}
        >
          <input
            className="input"
            aria-label="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <p className="text-xs text-tinta-500">
            Suas turmas quem define é a organização — fale com eles se algo
            mudou.
          </p>
          <button
            className="btn-ghost w-full"
            disabled={
              salvando === 'nome' || !nome.trim() || nome === profile.nome
            }
            onClick={() => void salvarNome()}
          >
            {salvando === 'nome' ? 'Salvando…' : 'Salvar nome'}
          </button>
        </LinhaConta>

        <LinhaConta
          rotulo="E-mail"
          valor={profile.email ?? 'não cadastrado'}
          aberta={aberta === 'email'}
          onAlternar={() => alternar('email')}
        >
          <input
            type="email"
            className="input"
            aria-label="E-mail para recuperar a senha"
            placeholder="voce@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-tinta-500">
            É com ele que você entra no app e recupera a senha se esquecer.
          </p>
          {aguardandoLink && (
            <p className="rounded-xl bg-azul-500/10 px-3 py-3 text-xs text-azul-700">
              <strong>Falta confirmar.</strong> Mandamos um link para{' '}
              <strong className="break-all">{aguardandoLink}</strong>. Enquanto
              você não clicar nele, seu login continua o de antes.
            </p>
          )}
          <button
            className="btn-ghost w-full"
            disabled={
              salvando === 'email' || !email.trim() || email === profile.email
            }
            onClick={() => void salvarEmail()}
          >
            {salvando === 'email' ? 'Salvando…' : 'Salvar e-mail'}
          </button>
        </LinhaConta>

        <LinhaConta
          rotulo="Senha"
          acao="Trocar"
          aberta={aberta === 'senha'}
          onAlternar={() => alternar('senha')}
        >
          <input
            type="password"
            className="input"
            aria-label="Nova senha"
            placeholder="Nova senha (mín. 6 caracteres)"
            autoComplete="new-password"
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <input
            type="password"
            className="input"
            aria-label="Confirmar nova senha"
            placeholder="Confirmar nova senha"
            autoComplete="new-password"
            minLength={6}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
          />
          <button
            className="btn-ghost w-full"
            disabled={salvando === 'senha' || senha.length < 6}
            onClick={() => void salvarSenha()}
          >
            {salvando === 'senha' ? 'Salvando…' : 'Trocar senha'}
          </button>
        </LinhaConta>
      </div>

      {pushSupported() && (
        <div className="card flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Lembretes push</p>
            <p className="text-xs text-tinta-500">
              Avisar quando a aula começa
            </p>
          </div>
          <Interruptor
            ligado={pushAtivo}
            rotulo="Lembretes push"
            onClick={() => void alternarPush()}
          />
        </div>
      )}

      {/* Lugar fixo para instalar: o convite do feed é dispensável, e
          quem dispensou não tinha mais como voltar atrás. */}
      <CartaoInstalar />

      {/* Endereço fixo para reler o aviso — a LGPD dá o direito de
          consultar a qualquer momento, não só na hora do cadastro. */}
      <Link
        to="/privacidade"
        className="card flex items-center gap-3 p-4 transition hover:bg-preto/5"
      >
        <span className="min-w-0 flex-1 text-sm font-bold">
          Privacidade e uso de dados
        </span>
        <span aria-hidden className="shrink-0 text-tinta-400">
          ›
        </span>
      </Link>

      <div className="space-y-2 pt-1">
        <button
          className="w-full py-3 text-center text-sm font-bold text-red-700"
          onClick={() => void api.signOut()}
        >
          Sair da conta
        </button>
        {api.mode === 'demo' && (
          <button className="btn-danger w-full" onClick={reiniciarDemo}>
            Reiniciar demonstração (apaga os dados locais)
          </button>
        )}
      </div>
    </div>
  )
}
