import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoWordmark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Destino do link de "esqueci minha senha".
 *
 * O link do e-mail traz um token na URL que o supabase-js troca por uma
 * sessão sozinho (`detectSessionInUrl`), então ao chegar aqui a pessoa
 * já está logada — só falta escolher a senha nova. É por isso que a
 * rota fica FORA do RequireAuth: quem cai aqui pode chegar antes de a
 * sessão ficar pronta, e mandá-la para o login perderia o token.
 */
export function NovaSenhaPage() {
  const { api, userId, carregando } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Dá um tempo para o token da URL virar sessão antes de acusar erro
  const [esperou, setEsperou] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), 2500)
    return () => clearTimeout(t)
  }, [])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (senha !== confirmar) {
      toast('As senhas não conferem', 'erro')
      return
    }
    setOcupado(true)
    try {
      await api.definirNovaSenha(senha)
      toast('Senha alterada! Bora dançar 💃')
      navigate('/', { replace: true })
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const semSessao = !userId && !carregando && esperou

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 40px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
      }}
    >
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <LogoWordmark largura={260} prioridade />
      </div>

      <div className="card space-y-4 p-5">
        <h1 className="text-lg font-extrabold">Criar uma senha nova 🔑</h1>

        {semSessao ? (
          <>
            <p className="rounded-xl bg-amber-500/10 px-3 py-3 text-sm text-amber-800">
              Este link não vale mais. Eles expiram depois de um tempo e só
              podem ser usados uma vez — peça um novo em "Esqueci minha
              senha".
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              Voltar para o login
            </button>
          </>
        ) : !userId ? (
          <p className="text-sm text-tinta-600">Conferindo o link…</p>
        ) : (
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <label className="label" htmlFor="nova">
                Nova senha (mín. 6 caracteres)
              </label>
              <input
                id="nova"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="nova-confirmar">
                Confirmar senha
              </label>
              <input
                id="nova-confirmar"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={6}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary w-full" disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar senha nova'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
