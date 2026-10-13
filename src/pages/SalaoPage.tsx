import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { Cabecalho, LinhaPessoa } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { horaCurta, useNoite } from '../context/NoiteContext'
import { carregarParceiros } from '../lib/forrodex'
import type { PresenteNoite } from '../lib/types'
import { useLembrado } from '../lib/memoriaTelas'

/**
 * Quem fez check-in nesta noite, do mais recente para o mais antigo.
 * Quem ainda não está na minha Forródex do semestre ganha a etiqueta
 * "falta dançar": é a lista que vira convite para tirar alguém novo.
 */
export function SalaoPage() {
  const { api, userId } = useAuth()
  const { noite } = useNoite()
  const navigate = useNavigate()
  const [presentes, setPresentes] = useLembrado<PresenteNoite[] | null>(
    `salao:${noite}`,
    null,
  )
  const [jaDancei, setJaDancei] = useLembrado<Set<string>>('salao:jaDancei', new Set())
  // Quem entra na Forródex: fora dela, a etiqueta não faz sentido
  const [universo, setUniverso] = useLembrado<Set<string> | null>('salao:universo', null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setErro(null)
    void api
      .presentesDaNoite(noite)
      .then((p) => vivo && setPresentes(p))
      .catch((e) => vivo && setErro((e as Error).message))
    // A etiqueta é um extra: se falhar, a lista aparece sem ela
    if (userId) {
      void carregarParceiros(api, userId)
        .then(({ parceiros, universo }) => {
          if (!vivo) return
          setJaDancei(new Set(parceiros.map((p) => p.user_id)))
          setUniverso(universo)
        })
        .catch(() => {})
    }
    return () => {
      vivo = false
    }
  }, [api, noite, userId])

  const outros = presentes?.filter((p) => p.user_id !== userId) ?? []
  const euVim = presentes?.some((p) => p.user_id === userId)

  return (
    <div className="anima-tela">
      <Cabecalho titulo="No salão agora" />
      {erro ? (
        <div className="px-4">
          <ErrorState erro={erro} />
        </div>
      ) : presentes === null ? (
        <Spinner />
      ) : (
        <>
          <p className="px-5 pb-3.5 text-[15px] leading-snug text-ink2">
            {presentes.length === 0
              ? 'Ninguém fez check-in ainda nesta noite.'
              : `${presentes.length} ${presentes.length === 1 ? 'pessoa fez' : 'pessoas fizeram'} check-in nesta noite${euVim ? ', contando você' : ''}. Quem ainda não está na sua Forródex aparece com a etiqueta laranja.`}
          </p>
          <div className="px-3">
            {outros.map((p) => (
              <LinhaPessoa
                key={p.user_id}
                onClick={() => navigate(`/perfil/${p.user_id}`)}
                avatar={<Avatar nome={p.nome} url={p.avatar_url} tamanho={44} />}
                nome={p.nome}
                sub={[p.cargos[0], p.turma].filter(Boolean).join(' · ') || undefined}
                direita={
                  <>
                    {!jaDancei.has(p.user_id) && (!universo || universo.has(p.user_id)) && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-preto bg-brasa-300 px-2 py-[3px] text-[11px] font-extrabold text-preto">
                        falta dançar
                      </span>
                    )}
                    <span className="shrink-0 text-[13px] font-bold text-ink3">
                      {horaCurta(new Date(p.chegou_em))}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
