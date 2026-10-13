import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  challengePhase,
  desafiosQueContam,
  diaDaNoite,
  diasSuspensos,
  janelaDoCheckin,
  mapaAberturas,
  suspensaoDoDia,
} from '../lib/dates'
import { aoPublicarCheckin } from '../lib/eventos'
import type { AberturaAntecipada, Challenge, Feriado } from '../lib/types'

/**
 * Em que pé está o check-in desta noite — a pergunta "registrei minha
 * presença?" que todo mundo traz ao abrir o app.
 *
 * UMA situação, a mais acionável, na mesma ordem de prioridade da tela
 * de check-in (lá ela ainda leva em conta a localização, que aqui não é
 * pedida: só abrir o app não pode disparar o GPS).
 *
 *   valendo   → tem desafio meu com janela aberta e ainda não pontuei
 *   pontuou   → minha foto desta noite já contou presença
 *   postou    → postei, mas nada estava valendo (a foto só foi pro feed)
 *   cancelada → hoje teria janela, mas a aula foi cancelada
 *   fora      → tem desafio rolando que eu não entrei
 *   nada      → nenhum desafio com janela aberta agora
 */
export type SituacaoNoite =
  | 'valendo'
  | 'pontuou'
  | 'postou'
  | 'cancelada'
  | 'fora'
  | 'nada'

/** Uma linha do "como está cada desafio". */
export interface LinhaDesafioAgora {
  desafio: Challenge
  estado: 'valendo' | 'pontuou' | 'fora'
  texto: string
}

interface EstadoNoite {
  carregado: boolean
  /** Dia da noite atual (ISO), que vira às 05:00. */
  noite: string
  agora: Date
  desafios: Challenge[]
  feriados: Feriado[]
  aberturas: AberturaAntecipada[]
  meusCheckins: Date[]
  situacao: SituacaoNoite
  /** O desafio que dá nome à situação (o que vale agora, o que contou…). */
  desafioDaVez: Challenge | null
  /** "HH:MM" em que a janela do desafio da vez fecha. */
  ateHora: string | null
  /** Hora do check-in desta noite (o que contou, ou o primeiro). */
  checkinNoite: Date | null
  motivoCancelamento: string | null
  linhas: LinhaDesafioAgora[]
  recarregar: () => void
}

const Ctx = createContext<EstadoNoite | null>(null)

const minutosDe = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Fim ("HH:MM") da janela de `c` que contém `agora`, se houver. */
export function fimDaJanela(agora: Date, c: Challenge): string | null {
  const min = agora.getHours() * 60 + agora.getMinutes()
  const dia = agora.getDay()
  for (const j of c.janelas) {
    const ini = minutosDe(j.hora_inicio)
    const fim = minutosDe(j.hora_fim)
    if (fim >= ini) {
      if (j.dia_semana === dia && min <= fim) return j.hora_fim
    } else {
      // Janela que vira a noite: vale no dia dela e na madrugada seguinte
      if (j.dia_semana === dia && min >= ini) return j.hora_fim
      if ((j.dia_semana + 1) % 7 === dia && min <= fim) return j.hora_fim
    }
  }
  return null
}

export function NoiteProvider({ children }: { children: ReactNode }) {
  const { api, userId } = useAuth()
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [aberturas, setAberturas] = useState<AberturaAntecipada[]>([])
  const [meusCheckins, setMeusCheckins] = useState<Date[]>([])
  const [carregado, setCarregado] = useState(false)
  const [agora, setAgora] = useState(() => new Date())
  /** Sobe a cada recarga pedida; refaz as consultas. */
  const [versao, setVersao] = useState(0)

  // Janelas abrem e fecham com o relógio: um tique por minuto basta.
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Desafios, feriados e aberturas mudam raramente — uma busca por
  // sessão (e a cada recarga explícita) basta.
  useEffect(() => {
    let vivo = true
    void Promise.all([
      api.listChallenges().catch(() => [] as Challenge[]),
      api.listFeriados().catch(() => [] as Feriado[]),
      api.listAberturas().catch(() => [] as AberturaAntecipada[]),
    ]).then(([d, f, a]) => {
      if (!vivo) return
      setDesafios(d)
      setFeriados(f)
      setAberturas(a)
    })
    return () => {
      vivo = false
    }
  }, [api, versao])

  useEffect(() => {
    if (!userId) return
    let vivo = true
    void api
      .checkinsDe(userId)
      .then((cs) => vivo && setMeusCheckins(cs.map((c) => new Date(c.criado_em))))
      .catch(() => {})
      .finally(() => vivo && setCarregado(true))
    return () => {
      vivo = false
    }
  }, [api, userId, versao])

  // A foto acabou de sair: o estado muda na hora, sem esperar consulta.
  useEffect(
    () =>
      aoPublicarCheckin(() => {
        setMeusCheckins((atual) => [...atual, new Date()])
        setAgora(new Date())
      }),
    [],
  )

  // Voltar ao app depois de um tempo (de manhã, no dia seguinte) refaz
  // tudo: a noite pode ter virado e os desafios mudado.
  useEffect(() => {
    let saiu = Date.now()
    const aoMudar = () => {
      if (document.hidden) {
        saiu = Date.now()
        return
      }
      setAgora(new Date())
      if (Date.now() - saiu > 10 * 60 * 1000) setVersao((v) => v + 1)
    }
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const valor = useMemo<EstadoNoite>(() => {
    const noite = diaDaNoite(agora)
    const suspensos = diasSuspensos(feriados)
    const mapa = mapaAberturas(aberturas)
    const ativos = desafios.filter((c) => challengePhase(c, agora) === 'ativo')
    const abertos = desafiosQueContam(agora, ativos, suspensos, mapa)
    const valendo = abertos.filter((c) => c.sou_membro)
    const fora = abertos.filter((c) => !c.sou_membro)
    const daNoite = meusCheckins
      .filter((d) => diaDaNoite(d) === noite)
      .sort((a, b) => a.getTime() - b.getTime())

    // Cada janela vale 1 ponto por desafio (ver CheckinPage)
    const aindaPontuam: Challenge[] = []
    const jaPontuaram: Challenge[] = []
    for (const c of valendo) {
      const janela = janelaDoCheckin(agora, c, suspensos, mapa)
      const contou =
        janela !== null &&
        meusCheckins.some((d) => janelaDoCheckin(d, c, suspensos, mapa) === janela)
      if (contou) jaPontuaram.push(c)
      else aindaPontuam.push(c)
    }

    // O que contou presença nesta noite, mesmo com a janela já fechada
    let contouEm: { desafio: Challenge; quando: Date } | null = null
    for (const d of daNoite) {
      const meus = desafiosQueContam(
        d,
        ativos.filter((c) => c.sou_membro),
        suspensos,
        mapa,
      )
      if (meus.length > 0) {
        contouEm = { desafio: meus[0], quando: d }
        break
      }
    }

    let suspensao: Feriado | null = null
    if (valendo.length === 0) {
      for (const c of desafiosQueContam(agora, ativos.filter((x) => x.sou_membro))) {
        const dia = janelaDoCheckin(agora, c)
        if (dia && suspensos.has(dia)) {
          suspensao = suspensaoDoDia(dia, feriados)
          break
        }
      }
    }

    let situacao: SituacaoNoite
    let desafioDaVez: Challenge | null = null
    if (aindaPontuam.length > 0) {
      situacao = 'valendo'
      desafioDaVez = aindaPontuam[0]
    } else if (contouEm || jaPontuaram.length > 0) {
      situacao = 'pontuou'
      desafioDaVez = contouEm?.desafio ?? jaPontuaram[0]
    } else if (daNoite.length > 0) {
      situacao = 'postou'
    } else if (suspensao) {
      situacao = 'cancelada'
    } else if (fora.length > 0) {
      situacao = 'fora'
      desafioDaVez = fora[0]
    } else {
      situacao = 'nada'
    }

    const linhas: LinhaDesafioAgora[] = abertos.map((c) => {
      if (!c.sou_membro) {
        return { desafio: c, estado: 'fora', texto: 'Você não participa' }
      }
      if (jaPontuaram.some((j) => j.id === c.id)) {
        return { desafio: c, estado: 'pontuou', texto: 'Já pontuou hoje' }
      }
      const ate = fimDaJanela(agora, c)
      return {
        desafio: c,
        estado: 'valendo',
        texto: ate ? `Valendo até ${ate}` : 'Valendo agora',
      }
    })

    return {
      carregado,
      noite,
      agora,
      desafios,
      feriados,
      aberturas,
      meusCheckins,
      situacao,
      desafioDaVez,
      ateHora: desafioDaVez ? fimDaJanela(agora, desafioDaVez) : null,
      checkinNoite: contouEm?.quando ?? daNoite[0] ?? null,
      motivoCancelamento: suspensao?.motivo ?? null,
      linhas,
      recarregar,
    }
  }, [agora, aberturas, carregado, desafios, feriados, meusCheckins, recarregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useNoite(): EstadoNoite {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNoite fora do NoiteProvider')
  return v
}

/** "21:52" */
export function horaCurta(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** "Segunda · 12 out" — da noite, não do relógio (a madrugada é da noite anterior). */
export function rotuloDaNoite(noite: string): string {
  const d = new Date(`${noite}T12:00:00`)
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0]
  const data = d
    .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    .replace('.', '')
    .replace(' de ', ' ')
  return `${dia[0].toUpperCase()}${dia.slice(1)} · ${data}`
}
