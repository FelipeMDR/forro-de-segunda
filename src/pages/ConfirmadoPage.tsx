import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogoWordmark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Lê o erro que o Supabase devolve no fragmento da URL.
 *
 * Link vencido ou já usado não vira exceção: o GoTrue redireciona para
 * cá com `#error=...&error_description=...`. Sem olhar aqui, a tela
 * ficaria em "conferindo o link" até desistir.
 */
function erroNoLink(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const p = new URLSearchParams(hash)
  const desc = p.get('error_description')
  if (!desc && !p.get('error')) return null
  return /expired|invalid/i.test(desc ?? '')
    ? 'Este link não vale mais. Eles expiram depois de um tempo e só podem ser usados uma vez.'
    : (desc ?? 'Não foi possível confirmar por este link.')
}

/**
 * Destino do link de confirmação de e-mail — tanto do cadastro quanto
 * da troca de e-mail no perfil.
 *
 * O link traz um token que o supabase-js troca por sessão sozinho
 * (`detectSessionInUrl`), então quem chega aqui com o link válido já
 * entra logado. Fica FORA do RequireAuth pelo mesmo motivo da tela de
 * senha nova: mandar para o login descartaria o token da URL.
 */
export function ConfirmadoPage() {
  const { api, userId, carregando, refreshProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [erro] = useState(erroNoLink)
  const [email, setEmail] = useState('')
  const [reenviando, setReenviando] = useState(false)
  const [reenviado, setReenviado] = useState(false)
  // Mesma folga da tela de senha nova: o token demora um tico para
  // virar sessão, e acusar erro antes disso seria mentira
  const [esperou, setEsperou] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), 2500)
    return () => clearTimeout(t)
  }, [])

  // O perfil em memória ainda tem o e-mail antigo quando a chegada aqui
  // é uma troca de endereço confirmada
  useEffect(() => {
    if (userId) void refreshProfile()
  }, [userId, refreshProfile])

  const reenviar = async () => {
    setReenviando(true)
    try {
      await api.reenviarConfirmacao(email)
      setReenviado(true)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setReenviando(false)
    }
  }

  const falhou = erro !== null || (!userId && !carregando && esperou)

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
        {falhou ? (
          <>
            <h1 className="text-lg font-extrabold">Link vencido 😕</h1>
            <p className="rounded-xl bg-amber-500/10 px-3 py-3 text-sm text-amber-800">
              {erro ??
                'Este link não vale mais. Eles expiram depois de um tempo e só podem ser usados uma vez.'}
            </p>
            {reenviado ? (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-800">
                Mandamos outro link. 📬 Não achou? Olhe no spam.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="label" htmlFor="conf-email">
                  Seu e-mail
                </label>
                <input
                  id="conf-email"
                  type="email"
                  className="input"
                  placeholder="voce@email.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  className="btn-ghost w-full"
                  disabled={reenviando || !email.trim()}
                  onClick={() => void reenviar()}
                >
                  {reenviando ? 'Enviando…' : 'Mandar outro link'}
                </button>
              </div>
            )}
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
          <>
            <h1 className="text-lg font-extrabold">E-mail confirmado! 🎉</h1>
            <p className="text-sm text-tinta-600">
              Tudo certo. É por este endereço que você entra no app e
              recupera a senha se esquecer. Agora bora pra pista 💃
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => navigate('/', { replace: true })}
            >
              Entrar no app 🎶
            </button>
          </>
        )}
      </div>
    </div>
  )
}
