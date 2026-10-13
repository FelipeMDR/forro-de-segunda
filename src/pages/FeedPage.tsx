import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckinCard } from '../components/CheckinCard'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Spinner'
import { BotaoAcao, BotaoSuave, Segmentado, TituloRaiz } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { aoPublicarCheckin } from '../lib/eventos'
import { PAGINA_FEED } from '../lib/types'
import type { FeedItem } from '../lib/types'

/**
 * Quanto o feed espera, depois de uma foto nova, antes de recarregar.
 *
 * Generoso porque o custo não é o meu aparelho: o evento chega a TODO
 * mundo que está com o app aberto, e cada um responde com uma consulta.
 * Meio minuto de atraso ninguém percebe numa noite de forró; trinta
 * recargas simultâneas a cada foto, o Supabase percebe.
 */
const ESPERA_TEMPO_REAL_MS = 25_000

export function FeedPage() {
  const { api, profile } = useAuth()
  const navigate = useNavigate()
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [visao, setVisao] = useState<'todos' | 'turma'>('todos')
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const ultimaCarga = useRef(0)
  /** Número da última recarga disparada — ver `carregar`. */
  const sequencia = useRef(0)
  /** Evento de tempo real que chegou com o app em segundo plano. */
  const pendente = useRef(false)
  /** Marcador invisível no fim da lista — carrega mais ao entrar na tela. */
  const sentinela = useRef<HTMLDivElement | null>(null)

  /**
   * Recarrega só a PRIMEIRA página e funde com o que já está na tela.
   *
   * É o que mantém o tempo real barato: sem isso, quem rolou cinco
   * páginas refaria as cinco a cada curtida de qualquer pessoa. Itens
   * mais antigos que a página nova ficam como estão — no máximo com um
   * contador desatualizado, que a próxima rolagem corrige.
   */
  const carregar = useCallback(async () => {
    // Cada chamada leva um número, e só a MAIS RECENTE tem o direito de
    // mexer na tela. Sem isso, duas recargas em voo (tempo real + foco
    // + o que mais disparar) chegavam fora de ordem, e a resposta velha
    // — que chegava por último — apagava o que a nova tinha acabado de
    // mostrar. Era assim que uma reação recém-feita "sumia".
    const minha = ++sequencia.current
    try {
      setErro(null)
      ultimaCarga.current = Date.now()
      const novos = await api.getFeed({ limite: PAGINA_FEED })
      if (minha !== sequencia.current) return
      setFeed((atual) => {
        if (!atual) {
          setTemMais(novos.length === PAGINA_FEED)
          return novos
        }
        const idsNovos = new Set(novos.map((i) => i.id))
        const corte = novos[novos.length - 1]?.criado_em
        // Descarta o que estava na faixa recarregada e não voltou:
        // é o que faz uma publicação apagada sumir da tela.
        const cauda = atual.filter(
          (i) => !idsNovos.has(i.id) && (!corte || i.criado_em < corte),
        )
        return [...novos, ...cauda]
      })
    } catch (e) {
      if (minha !== sequencia.current) return
      console.error('[feed] falha ao carregar', e)
      setErro((e as Error).message || 'Erro desconhecido')
    }
  }, [api])

  const carregarMais = useCallback(async () => {
    if (!feed || feed.length === 0 || carregandoMais) return
    setCarregandoMais(true)
    try {
      const antesDe = feed[feed.length - 1].criado_em
      const proximos = await api.getFeed({ limite: PAGINA_FEED, antesDe })
      setFeed((atual) => [...(atual ?? []), ...proximos])
      setTemMais(proximos.length === PAGINA_FEED)
    } catch (e) {
      console.error('[feed] falha ao carregar mais', e)
    } finally {
      setCarregandoMais(false)
    }
  }, [api, feed, carregandoMais])

  useEffect(() => {
    void carregar()

    // Tempo real: só foto nova (ver `subscribeFeed`). A espera é longa
    // de propósito — uma foto que aparece meio minuto depois não muda
    // nada para quem está no salão, e a recarga imediata, multiplicada
    // por todo mundo que está com o app aberto, era o maior gasto de
    // requisições do app. Com o app em segundo plano não busca nada:
    // ninguém está olhando, e gastaria dados à toa.
    const unsub = api.subscribeFeed(() => {
      if (document.hidden) {
        pendente.current = true
        return
      }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void carregar(), ESPERA_TEMPO_REAL_MS)
    })

    // A minha própria foto não espera: quem acabou de publicar volta
    // para o feed querendo vê-la ali.
    const unsubMinha = aoPublicarCheckin(() => {
      clearTimeout(timer.current)
      void carregar()
    })

    // Voltar para o app não precisa refazer a consulta se acabou de
    // sair: alternar de aplicativo no celular dispara isso o tempo todo.
    const aoVoltar = () => {
      if (document.hidden) return
      const velho = Date.now() - ultimaCarga.current > 2 * 60 * 1000
      if (velho || pendente.current) {
        pendente.current = false
        void carregar()
      }
    }
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      unsub()
      unsubMinha()
      clearTimeout(timer.current)
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [api, carregar])

  // Rolagem infinita: carrega a próxima página sozinho quando o
  // marcador do fim da lista entra na tela, em vez de esperar um
  // clique. `rootMargin` positivo busca um pouco ANTES de chegar no
  // fim de verdade, para a próxima página já estar pronta quando a
  // rolagem chegar lá — sem isso, toda virada de página mostraria um
  // soluço de carregamento.
  useEffect(() => {
    if (!temMais) return
    const el = sentinela.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) void carregarMais()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [temMais, carregarMais])

  /**
   * As turmas que são "minhas" — onde eu estudo E onde eu dou aula.
   *
   * Professor e monitor quase nunca estão matriculados na turma que
   * conduzem, então antes de juntar as duas listas a aba "Minha turma"
   * simplesmente não existia para eles: filtrava só pela matrícula, que
   * era vazia. Quem dá aula é justamente quem mais quer acompanhar as
   * publicações dos próprios alunos.
   *
   * Uma lista só, e não duas abas: para quem só estuda nada muda, e
   * para quem faz os dois "minhas turmas" é uma ideia única — não vale
   * um botão a mais na tela do celular para separar os dois papéis.
   */
  const minhasTurmas = useMemo(() => {
    const doPerfil = profile?.turmas.map((m) => m.turma) ?? []
    const deEnsino = profile?.turmas_ensino ?? []
    // Set: quem dá aula na mesma turma em que estuda apareceria duas
    // vezes no rótulo do estado vazio ("Avançado ou Avançado").
    return [...new Set([...doPerfil, ...deEnsino])]
  }, [profile])

  // Filtra por turma em comum, não por turma exata: quem faz duas turmas
  // vê as duas, e continua vendo quem divide qualquer uma delas.
  const feedVisivel = useMemo(() => {
    if (!feed || visao === 'todos') return feed
    return feed.filter((item) =>
      item.autor.turmas.some((t) => minhasTurmas.includes(t)),
    )
  }, [feed, visao, minhasTurmas])

  return (
    <div className="anima-tela">
      <TituloRaiz
        acao={
          // Sem turma no semestre (veterano) não há o que filtrar — o
          // seletor só apareceria para levar a uma lista vazia.
          minhasTurmas.length > 0 && (
            <Segmentado
              forma="pilula"
              valor={visao}
              onChange={setVisao}
              opcoes={[
                { valor: 'todos', rotulo: 'Todo mundo' },
                {
                  valor: 'turma',
                  rotulo: minhasTurmas.length > 1 ? 'Minhas turmas' : 'Minha turma',
                },
              ]}
            />
          )
        }
      >
        Feed
      </TituloRaiz>

      {erro ? (
        <div className="px-4">
          <ErrorState
            titulo="Não consegui carregar o feed"
            erro={erro}
            onRetry={() => void carregar()}
          />
        </div>
      ) : feedVisivel === null ? (
        <Spinner texto="Carregando o feed…" />
      ) : feedVisivel.length === 0 ? (
        visao === 'turma' ? (
          <Vazio
            titulo="Nada da sua turma por aqui"
            texto={
              // O filtro roda sobre o que já foi carregado. Dizer que
              // "ninguém postou" seria mentira quando há páginas por vir.
              temMais
                ? `Ninguém de ${minhasTurmas.join(' ou ')} aparece nas publicações mais recentes.`
                : `Ninguém de ${minhasTurmas.join(' ou ')} postou por enquanto. Que tal ser a primeira pessoa?`
            }
          >
            {temMais && (
              <BotaoAcao
                tamanho="m"
                sombra={false}
                disabled={carregandoMais}
                onClick={() => void carregarMais()}
              >
                {carregandoMais ? 'Carregando…' : 'Procurar mais atrás'}
              </BotaoAcao>
            )}
            <BotaoSuave onClick={() => setVisao('todos')}>Ver todo mundo</BotaoSuave>
          </Vazio>
        ) : (
          <Vazio
            titulo="Ainda não tem check-in por aqui"
            texto="Seja a primeira pessoa a postar uma foto da aula!"
          >
            <BotaoAcao tamanho="m" sombra={false} onClick={() => navigate('/checkin')}>
              Fazer check-in
            </BotaoAcao>
          </Vazio>
        )
      ) : (
        <>
          {feedVisivel.map((item) => (
            <CheckinCard key={item.id} item={item} onChanged={() => void carregar()} />
          ))}

          {temMais && (
            <div ref={sentinela} className="px-4 pt-2 text-center text-[13px] text-ink3">
              {carregandoMais ? `Carregando mais ${PAGINA_FEED} publicações…` : ' '}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Vazio({
  titulo,
  texto,
  children,
}: {
  titulo: string
  texto: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-4 flex flex-col items-center gap-2 rounded-[22px] border border-linha bg-sf px-6 py-10 text-center">
      <h2 className="text-lg font-extrabold">{titulo}</h2>
      <p className="max-w-xs text-[15px] leading-snug text-ink3">{texto}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  )
}
