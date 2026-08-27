import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { MarcarDuplas } from '../components/MarcarDuplas'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  aberturaDoDia,
  challengePhase,
  desafiosQueContam,
  diaDaNoite,
  diasSuspensos,
  janelaDoCheckin,
  mapaAberturas,
  suspensaoDoDia,
  toISODate,
} from '../lib/dates'
import { avisarCheckinPublicado } from '../lib/eventos'
import { compressImage } from '../lib/image'
import {
  distanciaLegivel,
  distanciaMetros,
  obterPosicao,
  type PosicaoObtida,
} from '../lib/geo'
import {
  esperaLegivel,
  limiteCheckin,
  LIMITE_POR_JANELA,
} from '../lib/limites'
import { estadoDaPermissao } from '../lib/permissoes'
import { DicaInstalarParaPermissao } from '../components/DicaInstalarParaPermissao'
import type { AberturaAntecipada, Challenge, Feriado } from '../lib/types'

/**
 * O check-in é um caminho de três passos, não uma página só.
 *
 * Antes tudo dividia a mesma tela rolável: câmera, legenda, aviso de
 * status e a grade de duplas. Cada pedaço aparecia na hora errada — a
 * legenda pedindo texto antes de existir foto, a grade de duplas
 * disputando espaço com a câmera.
 *
 *   camera  → enquadrar e disparar
 *   revisar → ver a foto, escrever a legenda, publicar
 *   pronto  → confirmação e "com quem você dançou?"
 *
 * `pronto` também é o estado de repouso: é onde cai quem fecha a câmera
 * no ✕, quem chega já tendo postado nesta noite, e quem bateu o limite
 * de fotos por janela.
 */
type Etapa = 'camera' | 'revisar' | 'pronto'

export function CheckinPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [aberturas, setAberturas] = useState<AberturaAntecipada[]>([])
  const [meusCheckins, setMeusCheckins] = useState<Date[]>([])
  const [foto, setFoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [enviando, setEnviando] = useState(false)
  // null enquanto não dá para decidir qual passo mostrar. Sem isso a
  // câmera abriria na cara de quem já postou, e fecharia em seguida.
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  /**
   * O que aconteceu com a foto que ACABOU de ser publicada.
   *
   * Precisa ser guardado no momento do envio: assim que o check-in
   * entra em `meusCheckins`, ele passa a ser "ponto já contado" e a
   * mensagem viraria outra. Também distingue "acabei de publicar" de
   * "cheguei aqui e já tinha postado".
   */
  const [resultado, setResultado] = useState<string | null>(null)
  // Os check-ins de hoje chegam do servidor e decidem se ainda dá para
  // postar. Abrir a câmera antes disso arriscaria abri-la para quem já
  // bateu o limite, e fechá-la na cara da pessoa logo em seguida.
  const [carregado, setCarregado] = useState(false)
  const jaDecidiu = useRef(false)
  // Muda sozinho com o tempo (o respiro de 5 min vence), então precisa
  // de um tique para a tela destravar sem o aluno recarregar a página.
  const [agora, setAgora] = useState(() => new Date())
  const [posicao, setPosicao] = useState<PosicaoObtida | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  /**
   * O pedido de câmera já terminou (liberado ou não)?
   *
   * O GPS espera por isto. Antes os dois pedidos saíam juntos ao abrir a
   * tela e o sistema empilhava dois diálogos — um deles quase sempre
   * respondido no chute só para sair da frente.
   */
  const [cameraResolvida, setCameraResolvida] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 20_000)
    return () => clearInterval(t)
  }, [])

  const limite = useMemo(
    () => limiteCheckin(meusCheckins, agora),
    [meusCheckins, agora],
  )

  useEffect(() => {
    void api.listChallenges().then(setDesafios).catch(() => setDesafios([]))
    void api.listFeriados().then(setFeriados).catch(() => setFeriados([]))
    void api.listAberturas().then(setAberturas).catch(() => setAberturas([]))
    if (userId) {
      void api
        .checkinsDe(userId)
        .then((cs) => setMeusCheckins(cs.map((c) => new Date(c.criado_em))))
        .catch(() => setMeusCheckins([]))
        .finally(() => setCarregado(true))
    } else {
      setCarregado(true)
    }
  }, [api, userId])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const suspensos = useMemo(() => diasSuspensos(feriados), [feriados])
  const aberturasMapa = useMemo(() => mapaAberturas(aberturas), [aberturas])

  const ativos = useMemo(
    () => desafios.filter((c) => challengePhase(c) === 'ativo'),
    [desafios],
  )
  const meusAtivos = useMemo(
    () => ativos.filter((c) => c.sou_membro),
    [ativos],
  )

  // Todos com janela aberta agora, inclusive os que não participo:
  // entrar no desafio é escolher competir, e quem entra depois leva as
  // presenças que já tinha. Para isso o check-in precisa ser avaliado
  // agora — em desafio com local, o veredito não tem como ser feito
  // depois, já que a coordenada não é guardada (migração 014).
  const abertosAgora = useMemo(
    () => desafiosQueContam(new Date(), ativos, suspensos, aberturasMapa),
    [ativos, suspensos, aberturasMapa],
  )
  const valendoAgora = useMemo(
    () => abertosAgora.filter((c) => c.sou_membro),
    [abertosAgora],
  )
  /** Rolando agora, mas ainda não entrei. */
  const foraDeles = useMemo(
    () => abertosAgora.filter((c) => !c.sou_membro),
    [abertosAgora],
  )

  // Hoje a janela existiria, mas a aula foi cancelada. Sem isso o aluno
  // veria só "nenhum desafio com janela aberta" e acharia que é bug —
  // ele está no lugar certo, na hora certa, e não tem forró.
  const suspensaoAgora = useMemo(() => {
    if (valendoAgora.length > 0) return null
    const agora = new Date()
    for (const c of desafiosQueContam(agora, meusAtivos)) {
      const dia = janelaDoCheckin(agora, c)
      if (dia && suspensos.has(dia)) return suspensaoDoDia(dia, feriados)
    }
    return null
  }, [valendoAgora, meusAtivos, suspensos, feriados])

  // Cada janela vale 1 ponto por desafio: separa os que ainda vão pontuar
  // agora dos que já pontuaram nesta janela. Usa a janela (não a data do
  // calendário) para não se perder em desafios que cruzam a meia-noite
  // (ex.: 21:00–02:00) — check-in às 23h e outro à 01h são a MESMA janela.
  const { aindaPontuam, jaPontuaram } = useMemo(() => {
    const agora = new Date()
    const aindaPontuam: Challenge[] = []
    const jaPontuaram: Challenge[] = []
    for (const c of valendoAgora) {
      const janelaAtual = janelaDoCheckin(agora, c, suspensos, aberturasMapa)
      const jaContou =
        janelaAtual !== null &&
        meusCheckins.some(
          (d) => janelaDoCheckin(d, c, suspensos, aberturasMapa) === janelaAtual,
        )
      if (jaContou) jaPontuaram.push(c)
      else aindaPontuam.push(c)
    }
    return { aindaPontuam, jaPontuaram }
  }, [valendoAgora, meusCheckins, suspensos, aberturasMapa])

  // Desafios abertos agora que exigem estar no local — inclusive os que
  // não participo, senão a foto não seria avaliada e entrar depois não
  // recuperaria nada.
  const comLocal = useMemo(
    () => abertosAgora.filter((c) => c.local),
    [abertosAgora],
  )
  /** Só os meus, que é o que a tela detalha com distância. */
  const meusComLocal = useMemo(
    () => valendoAgora.filter((c) => c.local),
    [valendoAgora],
  )

  /**
   * Tem desafio com local rolando e o GPS ainda não disse nem sim nem
   * não. Enquanto isso for verdade, publicar é uma corrida: a câmera é
   * rápida (3 toques: tirar, revisar, publicar) e o GPS pode não ter
   * respondido ainda, principalmente num salão fechado, onde o sinal de
   * satélite demora ou nunca fecha. Sem travar o botão nesse meio-tempo,
   * a foto sai sem coordenada nenhuma — e como ela nunca é reavaliada
   * depois (a coordenada não fica guardada, só o veredito), o ponto se
   * perde pra sempre, em silêncio, sem aviso nenhum na tela de revisão.
   */
  const aguardandoLocal = comLocal.length > 0 && !posicao && !erroLocal

  // Só pede GPS se algum desafio realmente precisar — pedir permissão
  // sem motivo é o tipo de coisa que faz o aluno negar pra sempre.
  const buscarLocal = async () => {
    setBuscandoLocal(true)
    setErroLocal(null)
    try {
      // Se já está bloqueado, chamar o GPS não abre diálogo nenhum: o
      // navegador recusa na hora. Perguntar antes troca um erro
      // genérico por um recado que diz o que fazer.
      if ((await estadoDaPermissao('geolocation')) === 'bloqueada') {
        setErroLocal('Você bloqueou o acesso à localização')
        return
      }
      setPosicao(await obterPosicao())
    } catch (e) {
      setErroLocal((e as Error).message)
    } finally {
      setBuscandoLocal(false)
    }
  }

  // Em fila com a câmera, nunca junto: `cameraResolvida` só vira true
  // quando o diálogo da câmera saiu da frente. Quando a câmera nem
  // aparece (já postou hoje, bateu o limite), não há o que esperar.
  //
  // `etapa === null` é "ainda não sei qual passo mostrar", e não "não
  // vai ter câmera": sem esta primeira condição o GPS disparava no
  // primeiro render, antes de a tela decidir — voltando a empilhar os
  // dois pedidos, que é justamente o que este código evita.
  const podePedirLocal =
    etapa !== null && (etapa !== 'camera' || cameraResolvida)

  useEffect(() => {
    if (
      podePedirLocal &&
      comLocal.length > 0 &&
      !posicao &&
      !erroLocal &&
      !buscandoLocal
    ) {
      void buscarLocal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comLocal.length, podePedirLocal])

  /** Situação de cada desafio com local: dentro do raio ou não. */
  const situacaoLocal = useMemo(
    () =>
      meusComLocal.map((c) => {
        const distancia = posicao ? distanciaMetros(posicao, c.local!) : null
        return {
          desafio: c,
          distancia,
          dentro: distancia !== null && distancia <= c.local!.raio_m,
        }
      }),
    [meusComLocal, posicao],
  )

  /** Dos que ainda pontuam, os que a localização não barra. */
  const aindaPontuamAqui = useMemo(
    () =>
      aindaPontuam.filter(
        (c) =>
          !c.local ||
          situacaoLocal.find((s) => s.desafio.id === c.id)?.dentro === true,
      ),
    [aindaPontuam, situacaoLocal],
  )

  const aoCapturar = async (blob: Blob) => {
    try {
      const comprimida = await compressImage(blob)
      setFoto(comprimida)
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(comprimida)
      })
      // A câmera fecha aqui: a partir deste ponto a tela é de revisão.
      // Escrever a legenda com a câmera ligada só gastaria bateria.
      setEtapa('revisar')
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const descartarFoto = () => {
    setFoto(null)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  /** Volta ao passo 1 jogando fora a foto — "tirar outra" e a seta. */
  const voltarParaCamera = () => {
    descartarFoto()
    setEtapa('camera')
  }

  const publicar = async () => {
    if (!foto) return
    setEnviando(true)
    try {
      await api.createCheckin(foto, legenda, posicao)
      // O recado do que valeu deixou de ser um toast: ele some sozinho,
      // e é justamente a resposta da pergunta que trouxe a pessoa aqui.
      // Agora fica escrito na tela de confirmação.
      setResultado(
        aindaPontuamAqui.length > 0
          ? 'Sua presença na noite já conta 🎉'
          : jaPontuaram.length > 0
            ? 'Seu ponto desta noite já tinha sido contado 😉'
            : suspensaoAgora
              ? 'Hoje não tem forró, então a foto não marca ponto 🚫'
              : foraDeles.length > 0
                ? 'Já fica valendo caso você entre no desafio 🏆'
                : 'Nenhum desafio aberto agora — a foto entra no feed 📸',
      )
      // O melhor momento para marcar com quem se dançou é agora, com a
      // noite fresca — é o que o passo 3 oferece.
      descartarFoto()
      setLegenda('')
      setMeusCheckins((atual) => [...atual, new Date()])
      setEtapa('pronto')
      // O botão do menu de baixo mora fora desta árvore e precisa saber
      // agora, senão ficaria oferecendo "fazer check-in" ao lado da
      // confirmação de que ele acabou de ser feito.
      avisarCheckinPublicado()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setEnviando(false)
    }
  }

  const noiteAtual = diaDaNoite(agora)
  const jaPosteiHoje = meusCheckins.some((d) => diaDaNoite(d) === noiteAtual)

  /** Quem tem local e está longe demais — é o que dá para consertar andando. */
  const longe = situacaoLocal.filter((s) => s.distancia !== null && !s.dentro)

  /**
   * Tem desafio meu exigindo local agora, e a localização não veio
   * (bloqueada, sem sinal, ainda buscando).
   *
   * Sem isto, quem bloqueia o GPS caía no último caso da lista e lia
   * "nenhum desafio com janela aberta agora" — uma mentira, e das que
   * fazem a pessoa achar que o app está quebrado. O desafio ESTÁ
   * aberto; o que falta é provar que ela está lá.
   */
  const semLocalizacao = meusComLocal.length > 0 && !posicao

  /**
   * UM aviso, não cinco.
   *
   * Antes cada situação (valendo ponto, longe do local, já pontuou,
   * aula cancelada, desafio que não participo, nada aberto) tinha seu
   * próprio cartão, e vários apareciam juntos — empurrando a câmera,
   * que é o motivo da tela existir, para fora do celular. Aqui vence a
   * informação mais acionável, e o resto fica nos detalhes.
   */
  interface Status {
    tom: 'ok' | 'info' | 'aviso'
    emoji: string
    texto: string
  }

  // Retornos diretos, em ordem de prioridade — antes isto era uma
  // escada de ternários aninhados, e cada caso novo empurrava a
  // indentação de todos os outros.
  const decidirStatus = (): Status => {
    if (aindaPontuamAqui.length > 0) {
      return {
        tom: 'ok',
        emoji: '✅',
        texto:
          aindaPontuamAqui.length === 1
            ? `Valendo ponto em ${aindaPontuamAqui[0].titulo}`
            : `Valendo ponto em ${aindaPontuamAqui.length} desafios`,
      }
    }
    if (longe.length > 0) {
      return {
        tom: 'aviso',
        emoji: '📍',
        texto: `Você está a ${distanciaLegivel(longe[0].distancia ?? 0)} de ${
          longe[0].desafio.local?.nome || 'onde o desafio conta'
        } — de lá, a foto marca ponto.`,
      }
    }
    // Antes do "nenhum desafio aberto": o desafio ESTÁ aberto, o que
    // falta é a localização. Cair no caso final aqui era mentira.
    if (semLocalizacao) {
      return {
        tom: 'aviso',
        emoji: '📍',
        texto: erroLocal
          ? `Tem desafio rolando que só conta ponto no local, e não deu para confirmar onde você está (${erroLocal.toLowerCase()}).`
          : 'Confirmando sua localização para saber se a foto marca ponto…',
      }
    }
    if (jaPontuaram.length > 0) {
      return {
        tom: 'info',
        emoji: '👍',
        texto:
          'Seu ponto desta noite já foi contado. A foto entra no feed do mesmo jeito.',
      }
    }
    if (suspensaoAgora) {
      return {
        tom: 'aviso',
        emoji: '🚫',
        texto: `Hoje não tem forró${
          suspensaoAgora.motivo ? ` (${suspensaoAgora.motivo})` : ''
        } — a foto não marca ponto.`,
      }
    }
    if (foraDeles.length > 0) {
      return {
        tom: 'info',
        emoji: '🏆',
        texto:
          'Tem desafio rolando agora que você não entrou. Pode postar — a foto já fica valendo se você entrar depois.',
      }
    }
    return {
      tom: 'aviso',
      emoji: '⚠️',
      texto:
        'Nenhum desafio com janela aberta agora. A foto entra no feed, mas não marca ponto.',
    }
  }
  const status: Status = decidirStatus()

  // amber-800 e não 700: sobre o fundo em /10 o 700 dá 4,23:1, abaixo
  // do mínimo de 4,5:1 para texto pequeno.
  const CORES = {
    ok: 'bg-emerald-500/10 text-emerald-800',
    info: 'bg-azul-500/10 text-azul-700',
    aviso: 'bg-amber-500/10 text-amber-800',
  }

  // Só vale abrir detalhes quando há mais de um desafio em jogo ou algum
  // com trava de local — fora isso o resumo já disse tudo.
  const valeDetalhar = abertosAgora.length > 1 || meusComLocal.length > 0

  /**
   * Em qual passo a tela abre.
   *
   * Chegar em /checkin é dizer "quero tirar uma foto", então a câmera
   * abre sozinha — mas só para quem ainda tem foto a dar nesta noite.
   * Quem já postou, ou bateu o limite, cai no passo 3, que é onde estão
   * as duplas e a saída para o feed. Decide uma vez só: depois disso
   * quem manda no passo é a pessoa.
   */
  useEffect(() => {
    if (jaDecidiu.current || !carregado) return
    jaDecidiu.current = true
    setEtapa(jaPosteiHoje || !limite.pode ? 'pronto' : 'camera')
  }, [carregado, jaPosteiHoje, limite.pode])

  if (etapa === null) return <Spinner texto="Preparando o check-in…" />

  // ---- Passo 1: a câmera, em tela cheia por cima de tudo ----
  if (etapa === 'camera') {
    return (
      <CameraCapture
        onCapture={(b) => void aoCapturar(b)}
        onResolvida={() => setCameraResolvida(true)}
        // Fechar não é cancelar o check-in: cai no passo 3, que é o
        // estado de repouso da tela (duplas e saída para o feed).
        onFechar={() => setEtapa('pronto')}
        permitirFotoTeste={api.mode === 'demo'}
        topo={
          <>
            {/* Mesmas cores da página: a faixa da câmera é clara, então
                não há motivo para um visual só dela. */}
            <div
              className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm ${CORES[status.tom]}`}
            >
              <span aria-hidden>{status.emoji}</span>
              <p className="flex-1">{status.texto}</p>
            </div>
            {erroLocal && comLocal.length > 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-800">
                <p className="flex-1">📍 {erroLocal}</p>
                <button
                  className="shrink-0 rounded-full bg-papel/70 px-3 py-1 text-xs font-bold"
                  onClick={() => void buscarLocal()}
                >
                  Tentar de novo
                </button>
              </div>
            )}
          </>
        }
      />
    )
  }

  // ---- Passo 2: revisar a foto e escrever a legenda ----
  if (etapa === 'revisar' && preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={voltarParaCamera}
            disabled={enviando}
            aria-label="Voltar para a câmera"
            className="-ml-1 shrink-0 rounded-full px-2 py-1 text-lg text-tinta-600 transition active:scale-90 disabled:opacity-50"
          >
            ←
          </button>
          <h1 className="text-xl font-extrabold">Revisar o check-in</h1>
        </div>

        <div className="card overflow-hidden">
          <img
            src={preview}
            alt="Prévia do check-in"
            className="aspect-[4/5] w-full object-cover"
          />
        </div>

        <div>
          <label className="label" htmlFor="legenda">
            Legenda (opcional)
          </label>
          <textarea
            id="legenda"
            className="input resize-none"
            rows={2}
            maxLength={200}
            placeholder="Escreva algo sobre a noite…"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />
        </div>

        {/* Só aparece quando tem desafio com local em jogo — é o que
            explica por que o botão está preso, em vez de deixar
            parecer travado à toa. */}
        {aguardandoLocal && (
          <div className="flex items-center gap-3 rounded-2xl bg-azul-500/10 px-4 py-3 text-sm text-azul-700">
            <span aria-hidden className="animate-pulse text-lg">
              📍
            </span>
            <p className="flex-1">
              Confirmando sua localização antes de publicar — só um
              instante.
            </p>
          </div>
        )}
        {erroLocal && comLocal.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            <p className="flex-1">
              📍 {erroLocal} — sem isso a foto não marca ponto nos
              desafios com local.
            </p>
            <button
              className="shrink-0 rounded-full bg-papel/70 px-3 py-1 text-xs font-bold"
              onClick={() => void buscarLocal()}
            >
              Tentar de novo
            </button>
          </div>
        )}

        <div className="space-y-2 border-t border-preto/10 pt-4">
          <button
            className="btn-primary w-full py-3.5 text-base"
            // Trava enquanto o GPS ainda não respondeu nem sim nem não:
            // publicar agora sairia sem coordenada, e isso não tem
            // conserto depois (ver `aguardandoLocal`). Já errado
            // (`erroLocal`) não trava — aí é escolha da pessoa publicar
            // mesmo sem valer o local, como sempre foi.
            disabled={enviando || !limite.pode || aguardandoLocal}
            onClick={() => void publicar()}
          >
            {enviando
              ? 'Publicando…'
              : aguardandoLocal
                ? 'Aguardando localização…'
                : 'Publicar check-in'}
          </button>
          <button
            className="w-full py-2 text-center text-sm font-bold text-tinta-600 disabled:opacity-50"
            disabled={enviando}
            onClick={voltarParaCamera}
          >
            Tirar outra
          </button>
        </div>
      </div>
    )
  }

  // ---- Passo 3: confirmação, duplas e saída ----
  // Também é o repouso: quem fecha a câmera, quem já postou nesta noite
  // e quem bateu o limite param aqui. O título diz qual dos casos é.
  const acabouDePublicar = resultado !== null
  const titulo = acabouDePublicar
    ? 'Check-in registrado!'
    : jaPosteiHoje
      ? 'Sua presença de hoje já está registrada'
      : 'Nada publicado ainda'

  // Só reforça a explicação quando ela muda alguma coisa agora: existe
  // abertura hoje E ela é o motivo de algo estar valendo. Fora disso a
  // nota ficaria pairando sem servir pra nada.
  const aberturaAtiva =
    abertosAgora.length > 0 ? aberturaDoDia(toISODate(agora), aberturas) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span
          aria-hidden
          className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            acabouDePublicar || jaPosteiHoje
              ? 'bg-verde-500/20 text-verde-800'
              : 'bg-preto/5 text-tinta-500'
          }`}
        >
          {acabouDePublicar || jaPosteiHoje ? '✓' : '📸'}
        </span>
        <h1 className="text-xl font-extrabold">{titulo}</h1>
        {/* verde-800 e azul-700 têm contraste medido sobre o fundo claro */}
        <p className="text-sm text-azul-700">
          {resultado ?? `${status.emoji} ${status.texto}`}
        </p>
        {aberturaAtiva && (
          <p className="text-xs text-tinta-500">
            🕐 O espaço abriu mais cedo hoje, às {aberturaAtiva.hora_abertura}
            {aberturaAtiva.motivo ? ` (${aberturaAtiva.motivo})` : ''} — check-ins
            desde então contam normalmente.
          </p>
        )}
      </div>

      {!limite.pode && limite.liberaEm && (
        <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {limite.motivo === 'intervalo' ? (
            <>
              ⏳ Calma no pé! Dá pra postar de novo em{' '}
              <strong>{esperaLegivel(limite.liberaEm, agora)}</strong>.
            </>
          ) : (
            <>
              ⏳ Você já postou {LIMITE_POR_JANELA} check-ins nas últimas
              horas. Libera de novo em{' '}
              <strong>{esperaLegivel(limite.liberaEm, agora)}</strong> — a
              presença de hoje já está registrada 😉
            </>
          )}
        </div>
      )}

      {/* Marcar dupla exige que os dois tenham dado check-in, então isto
          só faz sentido depois da foto — e é aqui que a noite está mais
          fresca na memória. */}
      {jaPosteiHoje && <MarcarDuplas data={noiteAtual} />}

      {/* GPS falhou e ainda dá para tirar outra: aí sim é acionável. */}
      {erroLocal && comLocal.length > 0 && limite.pode && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            <p className="flex-1">
              📍 {erroLocal} — sem isso a foto não marca ponto nos desafios
              com local.
            </p>
            <button
              className="shrink-0 rounded-full bg-papel/70 px-3 py-1 text-xs font-bold"
              onClick={() => void buscarLocal()}
            >
              Tentar de novo
            </button>
          </div>
          {/* Aqui, e não só no feed: é neste momento que a pessoa está
              incomodada com a permissão e disposta a resolver de vez. */}
          <DicaInstalarParaPermissao />
        </>
      )}

      {/* O detalhe desafio a desafio interessa a pouca gente e quase
          nunca — fica embaixo, fechado, para quem quiser conferir. */}
      {valeDetalhar && (
        <details className="rounded-2xl bg-preto/5 px-4 py-3 text-sm">
          <summary className="cursor-pointer text-xs font-bold text-tinta-600">
            Como está cada desafio agora
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-tinta-600">
            {abertosAgora.map((c) => {
              const s = situacaoLocal.find((x) => x.desafio.id === c.id)
              return (
                <li key={c.id}>
                  <strong className="text-tinta-900">{c.titulo}</strong>
                  {!c.sou_membro && ' — você não entrou nele'}
                  {c.sou_membro &&
                    jaPontuaram.some((j) => j.id === c.id) &&
                    ' — ponto já contado nesta noite'}
                  {s &&
                    (s.distancia === null
                      ? ' — conferindo sua localização…'
                      : s.dentro
                        ? ` — você está em ${c.local?.nome || 'no local'}`
                        : ` — a ${distanciaLegivel(s.distancia)} de ${c.local?.nome || 'onde conta'}`)}
                </li>
              )
            })}
          </ul>
        </details>
      )}

      <div className="space-y-2 pt-1">
        <Link className="btn-ghost block w-full text-center" to="/">
          Ir para o feed
        </Link>
        {limite.pode && (
          <>
            <button
              className="w-full py-2 text-center text-sm font-bold text-tinta-600"
              onClick={() => setEtapa('camera')}
            >
              {jaPosteiHoje ? 'Tirar outra foto 📸' : 'Abrir a câmera 📸'}
            </button>
            {limite.restantes <= 2 && (
              <p className="px-2 text-center text-xs text-tinta-500">
                Você ainda pode postar{' '}
                <strong>
                  {limite.restantes} {limite.restantes === 1 ? 'foto' : 'fotos'}
                </strong>{' '}
                nas próximas horas.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
