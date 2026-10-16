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
 * Quem fez check-in nesta noite, do mais recente para o mais antigo,
 * com duas etiquetas:
 * - "nunca dançamos" (laranja): ainda não está na minha Forródex — o
 *   convite para tirar alguém novo;
 * - "✓ hoje" (verde): já marquei dupla com a pessoa nesta noite. O
 *   checklist marca o que foi feito, e não o que falta: numa noite
 *   cheia, quase todo mundo ganharia uma etiqueta de "falta".
 *
 * Antes era uma etiqueta só, "falta dançar", e muita gente lia como
 * "não dancei hoje". As etiquetas só aparecem depois que os dados
 * chegam: começar com "ninguém" marcava todo mundo e depois sumia.
 */
export function SalaoPage() {
  const { api, userId } = useAuth()
  const { noite } = useNoite()
  const navigate = useNavigate()
  const [presentes, setPresentes] = useLembrado<PresenteNoite[] | null>(
    `salao:${noite}`,
    null,
  )
  const [jaDancei, setJaDancei] = useLembrado<Set<string> | null>('salao:jaDancei', null)
  // Com quem marquei dupla nesta noite (vazio se eu não fiz check-in)
  const [dancouHoje, setDancouHoje] = useLembrado<Set<string> | null>(
    `salao:hoje:${noite}`,
    null,
  )
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
        .then(({ parceiros }) => vivo && setJaDancei(new Set(parceiros.map((p) => p.user_id))))
        .catch(() => {})
      void api
        .parceirosPossiveis(noite)
        .then(
          (ps) =>
            vivo && setDancouHoje(new Set(ps.filter((p) => p.marcado).map((p) => p.user_id))),
        )
        .catch(() => {})
    }
    return () => {
      vivo = false
    }
  }, [api, noite, userId])

  const outros = presentes?.filter((p) => p.user_id !== userId) ?? []
  const euVim = presentes?.some((p) => p.user_id === userId)

  function etiqueta(id: string): 'nunca' | 'hoje' | null {
    // Marquei hoje: vale o verde, mesmo antes da outra pessoa confirmar
    // (a Forródex só conta dupla confirmada, e a laranja ficaria)
    if (dancouHoje?.has(id)) return 'hoje'
    // Vale para todo mundo, inscrito no desafio ou não: é o mesmo
    // "ainda não dançaram" que o perfil da pessoa mostra
    if (jaDancei && !jaDancei.has(id)) return 'nunca'
    return null
  }

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
              : `${presentes.length} ${presentes.length === 1 ? 'pessoa fez' : 'pessoas fizeram'} check-in nesta noite${euVim ? ', contando você' : ''}. Em laranja, quem ainda não dançou com você${euVim ? '; em verde, com quem você já marcou dupla hoje' : ''}.`}
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
                    {etiqueta(p.user_id) === 'nunca' && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-preto bg-brasa-300 px-2 py-[3px] text-[11px] font-extrabold text-preto">
                        nunca dançamos
                      </span>
                    )}
                    {etiqueta(p.user_id) === 'hoje' && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-preto bg-verde-500 px-2 py-[3px] text-[11px] font-extrabold text-preto">
                        ✓ hoje
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
