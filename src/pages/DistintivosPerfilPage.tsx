import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeGrid } from '../components/PerfilResumo'
import { Cabecalho } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { colecao, conquistado } from '../lib/destaques'
import { carregarPerfilStats } from '../lib/perfilStats'
import type { Badge } from '../lib/types'
import { useLembrado } from '../lib/memoriaTelas'

/**
 * Todos os distintivos de alguém (ou os seus, em /perfil/distintivos),
 * com o progresso dos marcos. O perfil mostra só os destaques; aqui fica
 * a coleção inteira — menos cargo e turma, que estão no topo do perfil.
 *
 * Usa as mesmas chaves de memória do perfil: quem chega por lá vê a
 * lista na hora, e ela se atualiza por baixo.
 */
export function DistintivosPerfilPage() {
  const { id: idParam } = useParams<{ id: string }>()
  const { api, userId, profile } = useAuth()
  const navigate = useNavigate()
  const proprio = !idParam || idParam === userId
  const id = proprio ? userId : idParam
  const chave = proprio ? 'perfil:badges' : `perfil:${id}:badges`
  const [badges, setBadges] = useLembrado<Badge[] | null>(chave, null)
  const [nome, setNome] = useLembrado<string | null>(`perfil:${id}:nome`, null)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    void (async () => {
      try {
        const p = proprio ? profile : await api.getProfile(id)
        if (cancelado || !p) return
        setNome(p.nome)
        const r = await carregarPerfilStats(api, id, p.turmas, p.cargos, {
          papelPrincipal: p.papel_principal,
          proprio,
        })
        if (!cancelado) setBadges(r.badges)
      } catch (e) {
        console.error('[distintivos] falha ao carregar', e)
        if (!cancelado) setBadges((atual) => atual ?? [])
      }
    })()
    return () => {
      cancelado = true
    }
  }, [api, id, proprio, profile])

  const lista = badges ? colecao(badges) : null
  const n = lista?.filter(conquistado).length ?? 0
  const primeiroNome = (proprio ? profile?.nome : nome)?.split(/\s+/)[0]

  return (
    <div className="anima-tela pb-4">
      <Cabecalho titulo="Distintivos" fallback={proprio ? '/perfil' : `/perfil/${id}`} />
      {lista && lista.length > 0 && (
        <p className="px-5 pb-1 text-[13px] text-ink3">
          {n} {n === 1 ? 'conquistado' : 'conquistados'}
          {!proprio && primeiroNome ? ` por ${primeiroNome}` : ''}
        </p>
      )}
      <BadgeGrid
        badges={lista}
        semTitulo
        vazio={
          proprio
            ? 'Faça seu primeiro check-in para começar a colecionar!'
            : `${primeiroNome ?? 'Essa pessoa'} ainda não tem distintivos.`
        }
        // O convite da caça leva ao perfil, onde está a escolha da função
        onAbrirFuncao={proprio ? () => navigate('/perfil') : undefined}
      />
    </div>
  )
}
