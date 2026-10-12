import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { CARGO_DJ, podeSerDJ } from './dj'

/**
 * Se quem está logado pode ser DJ agora — null enquanto carrega.
 *
 * Precisa saber quantos DJs já existem (o teto é 5), e o cargo vem da
 * lista do banco, não do perfil em memória: quem acabou de conectar o
 * Spotify ganhou o cargo no servidor, e o perfil carregado no login
 * ainda não sabe disso.
 */
export function usePodeSerDJ(): boolean | null {
  const { api, userId, profile, papel } = useAuth()
  const [pode, setPode] = useState<boolean | null>(null)

  useEffect(() => {
    if (!profile) return
    let vivo = true
    void api
      .listDJs()
      .then((djs) => {
        const souDJ = djs.some((d) => d.id === userId)
        const cargos = souDJ ? [...profile.cargos, CARGO_DJ] : profile.cargos
        if (vivo) setPode(podeSerDJ(cargos, papel, djs.length))
      })
      // Sem a migração 033: vale a regra antiga, sem teto
      .catch(() => {
        if (vivo) setPode(podeSerDJ(profile.cargos, papel, 0))
      })
    return () => {
      vivo = false
    }
  }, [api, userId, profile, papel])

  return profile ? pode : false
}
