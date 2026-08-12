import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { LogoWordmark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { EmailNaoConfirmado } from '../lib/api'
import { telefoneValido } from '../lib/phone'

export function LoginPage() {
  const { api, userId, carregando } = useAuth()
  const toast = useToast()
  const [aba, setAba] = useState<'entrar' | 'primeira'>('entrar')
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
  // Fluxo "primeira vez": null = ainda não verificou o telefone
  const [verificado, setVerificado] = useState<{
    nome: string | null
  } | null>(null)
  // Demo: formulário de organizador
  const [orgAberto, setOrgAberto] = useState(false)
  const [orgNome, setOrgNome] = useState('')

  if (userId && !carregando) return <Navigate to="/" replace />

  const trocarAba = (t: 'entrar' | 'primeira') => {
    setAba(t)
    setVerificado(null)
    setSenha('')
    setConfirmar('')
    setEmail('')
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
      toast('Digite o telefone com DDD', 'erro')
      return
    }
    setOcupado(true)
    try {
      const { existe, nome, jaTemConta } = await api.telefoneNaLista(telefone)
      if (jaTemConta) {
        toast('Este telefone já tem conta — é só entrar!')
        trocarAba('entrar')
        return
      }
      if (!existe) {
        toast(
          'Telefone não encontrado na lista de alunos. Fale com a organização!',
          'erro',
        )
        return
      }
      setVerificado({ nome })
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
    setOcupado(true)
    try {
      // 'entrou' não precisa de tela: a sessão já existe e o app troca
      // sozinho para o feed
      if ((await api.signUpTelefone(telefone, email, senha)) === 'confirmar') {
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

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 40px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
      }}
    >
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        {/* Sem moldura branca: a arte é transparente e o fundo já é
            claro, então a caixa só criaria um retângulo à toa */}
        <LogoWordmark largura={260} prioridade />
        <p className="text-sm text-tinta-600">
          Check-ins, desafios e ranking do Espaço Livre! 🎶
        </p>
      </div>

      <div className="card space-y-4 p-5">
        {api.mode === 'demo' && (
          <div className="rounded-xl bg-brasa-500/10 px-3 py-2 text-xs text-brasa-700">
            <strong>Modo demonstração</strong> — dados só neste aparelho.
            Entrar: <strong>11 98888-0001</strong> / senha{' '}
            <strong>forro123</strong>. Primeira vez:{' '}
            <strong>11 99999-0000</strong> (Felipe) ou{' '}
            <strong>11 97777-1234</strong> (Luiz).
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-fundo p-1">
          {(
            [
              ['entrar', 'Entrar'],
              ['primeira', 'Primeira vez'],
            ] as const
          ).map(([t, rotulo]) => (
            <button
              key={t}
              type="button"
              onClick={() => trocarAba(t)}
              className={`rounded-lg py-2 text-sm font-bold transition ${
                aba === t ? 'bg-papel text-tinta-900 shadow-sm' : 'text-tinta-500'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {confirmando !== null ? (
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold">Confira seu e-mail 📬</h2>
            <div className="rounded-xl bg-azul-500/10 px-3 py-3 text-sm text-azul-700">
              <p>
                Mandamos um link de confirmação para{' '}
                <strong className="break-all">{confirmando}</strong>. Clique
                nele e sua conta está liberada.
              </p>
              <p className="mt-2">
                Não achou? Olhe no spam — e confira se o endereço está
                escrito certinho.
              </p>
            </div>
            {reenviado ? (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-800">
                Pronto, mandamos outro link. 📬
              </p>
            ) : (
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={ocupado}
                onClick={() => void reenviarConfirmacao()}
              >
                {ocupado ? 'Enviando…' : 'Não recebi — mandar de novo'}
              </button>
            )}
            <button
              type="button"
              className="w-full text-center text-sm font-bold text-tinta-600 underline"
              onClick={() => trocarAba('entrar')}
            >
              Já confirmei, quero entrar
            </button>
          </div>
        ) : aba === 'entrar' && recuperando !== null ? (
          enviado ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-800">
                <p>
                  Se existir uma conta com esse e-mail, o link para criar uma
                  senha nova já está a caminho. 📬
                </p>
                <p className="mt-2">
                  Não achou? Olhe no spam. O link vale por pouco tempo — se
                  expirar, é só pedir de novo.
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setRecuperando(null)
                  setEnviado(false)
                }}
              >
                Voltar para entrar
              </button>
            </div>
          ) : (
            <form onSubmit={pedirRecuperacao} className="space-y-4">
              <p className="text-sm text-tinta-600">
                Digite o e-mail que você cadastrou e a gente manda um link
                para criar uma senha nova.
              </p>
              <div>
                <label className="label" htmlFor="rec-email">
                  E-mail
                </label>
                <input
                  id="rec-email"
                  type="email"
                  className="input"
                  placeholder="voce@email.com"
                  value={recuperando}
                  onChange={(e) => setRecuperando(e.target.value)}
                  required
                />
              </div>
              <button className="btn-primary w-full" disabled={ocupado}>
                {ocupado ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setRecuperando(null)}
              >
                Voltar
              </button>
              <p className="text-xs text-tinta-500">
                Não cadastrou e-mail, ou não lembra qual usou? Fale com a
                organização na aula ou no grupo do WhatsApp.
              </p>
            </form>
          )
        ) : aba === 'entrar' ? (
          <form onSubmit={entrar} className="space-y-4">
            <div>
              <label className="label" htmlFor="telefone">
                E-mail
              </label>
              <input
                id="telefone"
                type="text"
                inputMode="email"
                autoComplete="username"
                className="input"
                placeholder="voce@email.com"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                required
              />
              {/* Contas criadas antes do e-mail ainda entram pelo
                  número. Some sozinho conforme elas migram. */}
              <p className="mt-1.5 text-xs text-tinta-500">
                Tem conta antiga e ainda não cadastrou e-mail? Entre com o
                telefone, como sempre.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="senha">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                className="input"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary w-full" disabled={ocupado}>
              Entrar na dança 💃
            </button>
            <button
              type="button"
              className="w-full text-center text-sm font-bold text-tinta-600 underline"
              onClick={() =>
                setRecuperando(telefone.includes('@') ? telefone : '')
              }
            >
              Esqueci minha senha
            </button>
          </form>
        ) : verificado === null ? (
          <form onSubmit={verificarTelefone} className="space-y-4">
            <p className="text-sm text-tinta-600">
              Seu cadastro já está na lista de chamada da organização — é só
              confirmar seu telefone e criar uma senha.
            </p>
            <div>
              <label className="label" htmlFor="telefone">
                Telefone (com DDD)
              </label>
              <input
                id="telefone"
                type="tel"
                className="input"
                placeholder="Ex.: 11 91234-5678"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary w-full" disabled={ocupado}>
              Verificar telefone
            </button>
          </form>
        ) : (
          <form onSubmit={criarConta} className="space-y-4">
            <p className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700">
              {verificado.nome
                ? `Achamos você na lista, ${verificado.nome.split(' ')[0]}! 🎉`
                : 'Telefone encontrado na lista! 🎉'}{' '}
              Agora é só criar seu acesso.
            </p>
            <div>
              <label className="label" htmlFor="cad-email">
                E-mail
              </label>
              <input
                id="cad-email"
                type="email"
                className="input"
                placeholder="voce@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-tinta-500">
                É com ele que você vai entrar no app, e é por ele que você
                recupera a senha se esquecer.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="senha">
                Senha (mín. 6 caracteres)
              </label>
              <input
                id="senha"
                type="password"
                className="input"
                value={senha}
                minLength={6}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="confirmar">
                Confirmar senha
              </label>
              <input
                id="confirmar"
                type="password"
                className="input"
                value={confirmar}
                minLength={6}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary w-full" disabled={ocupado}>
              Criar minha conta 🎶
            </button>
          </form>
        )}

        {api.mode === 'demo' && (
          <div className="border-t border-preto/10 pt-3">
            <button
              type="button"
              className="text-xs font-bold text-tinta-500"
              onClick={() => setOrgAberto((v) => !v)}
            >
              {orgAberto ? '▾' : '▸'} Criar conta de organizador(a) — demo
            </button>
            {orgAberto && (
              <form onSubmit={criarOrganizador} className="mt-3 space-y-3">
                <input
                  className="input"
                  placeholder="Nome"
                  value={orgNome}
                  onChange={(e) => setOrgNome(e.target.value)}
                  required
                />
                <input
                  className="input"
                  type="tel"
                  placeholder="Telefone (opcional)"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                <button className="btn-ghost w-full" disabled={ocupado}>
                  Entrar como organizador(a) 🛠️
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-tinta-400">
        Seu telefone não está na lista? Fale com a organização na aula ou no
        grupo do WhatsApp.
      </p>
    </div>
  )
}
