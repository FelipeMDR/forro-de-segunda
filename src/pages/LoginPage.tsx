import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { LogoWordmark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { telefoneValido } from '../lib/phone'

export function LoginPage() {
  const { api, userId, carregando } = useAuth()
  const toast = useToast()
  const [aba, setAba] = useState<'entrar' | 'primeira'>('entrar')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [ocupado, setOcupado] = useState(false)
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
  }

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    try {
      await api.signInTelefone(telefone, senha)
    } catch (err) {
      toast((err as Error).message, 'erro')
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
      await api.signUpTelefone(telefone, senha)
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
        <div className="rounded-3xl bg-white px-6 py-5 shadow-xl">
          <LogoWordmark largura={250} />
        </div>
        <p className="text-sm text-stone-400">
          Check-ins, desafios e ranking do Espaço Livre! 🎶
        </p>
      </div>

      <div className="card space-y-4 p-5">
        {api.mode === 'demo' && (
          <div className="rounded-xl bg-brasa-500/10 px-3 py-2 text-xs text-brasa-300">
            <strong>Modo demonstração</strong> — dados só neste aparelho.
            Entrar: <strong>11 98888-0001</strong> / senha{' '}
            <strong>forro123</strong>. Primeira vez:{' '}
            <strong>11 99999-0000</strong> (Felipe) ou{' '}
            <strong>11 97777-1234</strong> (Luiz).
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-noite-950 p-1">
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
                aba === t ? 'bg-noite-700 text-white' : 'text-stone-500'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === 'entrar' ? (
          <form onSubmit={entrar} className="space-y-4">
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
            <div>
              <label className="label" htmlFor="senha">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                className="input"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary w-full" disabled={ocupado}>
              Entrar na dança 💃
            </button>
          </form>
        ) : verificado === null ? (
          <form onSubmit={verificarTelefone} className="space-y-4">
            <p className="text-sm text-stone-400">
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
            <p className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
              {verificado.nome
                ? `Achamos você na lista, ${verificado.nome.split(' ')[0]}! 🎉`
                : 'Telefone encontrado na lista! 🎉'}{' '}
              Agora crie sua senha.
            </p>
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
          <div className="border-t border-white/5 pt-3">
            <button
              type="button"
              className="text-xs font-bold text-stone-500"
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

      <p className="mt-4 text-center text-xs text-stone-600">
        Seu telefone não está na lista? Fale com a organização na aula ou no
        grupo do WhatsApp.
      </p>
    </div>
  )
}
