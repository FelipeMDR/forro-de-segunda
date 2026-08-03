import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getApi, type ForroApi } from '../lib/api'
import type { Papel, Profile } from '../lib/types'

interface AuthState {
  api: ForroApi
  userId: string | null
  profile: Profile | null
  papel: Papel
  carregando: boolean
  refreshProfile: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}

export function useApi(): ForroApi {
  return useAuth().api
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<ForroApi | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [papel, setPapel] = useState<Papel>('aluno')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let cancelado = false
    void getApi().then(async (a) => {
      if (cancelado) return
      setApi(a)
      const uid = await a.getSessionUserId()
      if (cancelado) return
      setUserId(uid)
      unsub = a.onAuthChange((novo) => setUserId(novo))
      if (!uid) setCarregando(false)
    })
    return () => {
      cancelado = true
      unsub?.()
    }
  }, [])

  const carregarPerfil = useCallback(
    async (a: ForroApi, uid: string) => {
      const [p, r] = await Promise.all([a.getProfile(uid), a.getMyRole()])
      setProfile(p)
      setPapel(r)
    },
    [],
  )

  useEffect(() => {
    if (!api) return
    if (!userId) {
      setProfile(null)
      setPapel('aluno')
      return
    }
    setCarregando(true)
    void carregarPerfil(api, userId).finally(() => setCarregando(false))
  }, [api, userId, carregarPerfil])

  const refreshProfile = useCallback(async () => {
    if (api && userId) await carregarPerfil(api, userId)
  }, [api, userId, carregarPerfil])

  if (!api) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="text-4xl animate-pulse">🎶</span>
      </div>
    )
  }

  return (
    <AuthCtx.Provider
      value={{ api, userId, profile, papel, carregando, refreshProfile }}
    >
      {children}
    </AuthCtx.Provider>
  )
}
