import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { Icone } from '../components/Icone'
import { TelaDuplas } from '../components/MarcarDuplas'
import { Spinner } from '../components/Spinner'
import { BotaoAcao, BotaoSuave, useVoltar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { fimDaJanela, horaCurta, useNoite } from '../context/NoiteContext'
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
import { esperaLegivel, limiteCheckin, LIMITE_POR_JANELA } from '../lib/limites'
import { estadoDaPermissao } from '../lib/permissoes'
import type { Challenge } from '../lib/types'

/**
 * O check-in é um caminho de quatro passos, não uma página só.
 *
 *   status  → o cartaz: vale ponto agora? (e o botão de abrir a câmera)
 *   camera  → enquadrar e disparar
 *   revisar → ver a foto, escrever a legenda, publicar
 *   duplas  → "com quem você dançou hoje?"
 *
 * O cartaz vem antes da câmera porque é a resposta da pergunta que traz
 * a pessoa até aqui ("vale ponto?"), e porque o toque em "Abrir câmera"
 * é o gesto que o navegador exige para pedir a permissão — entrar na
 * tela continua sem disparar diálogo nenhum.
 */
type Etapa = 'status' | 'camera' | 'revisar' | 'duplas'

/** Cor do cartaz e da pílula da câmera. Texto é sempre preto. */
const FUNDO = {
  brasa: '#DE5300',
  verde: '#9BC22D',
  azul: '#0391D5',
  pessego: '#FFB98C',
} as const
type CorStatus = keyof typeof FUNDO

interface Status {
  cor: CorStatus
  /** Título do cartaz ("Valendo ponto agora"). */
  titulo: string
  /** Complemento curto, para a pílula da câmera. */
  curto: string
  /** Frase completa, para quem abre os detalhes. */
  texto: string
}

export function CheckinPage() {
  const { api } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const voltar = useVoltar('/')
  const [params] = useSearchParams()
  const noite = useNoite()
  const { desafios, feriados, aberturas, meusCheckins, carregado } = noite
  const [foto, setFoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [enviando, setEnviando] = useState(false)
  // null enquanto não dá para decidir qual passo mostrar
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  /** Hora e veredito da foto que ACABOU de ser publicada. */
  const [publicada, setPublicada] = useState<{ hora: Date; contou: boolean } | null>(null)
  const jaDecidiu = useRef(false)
  /** O toque em "Abrir câmera" já aconteceu (não precisa de outro). */
  const [tocouAbrir, setTocouAbrir] = useState(false)
  const [detalhes, setDetalhes] = useState(false)
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
  const meusAtivos = useMemo(() => ativos.filter((c) => c.sou_membro), [ativos])

  // Todos com janela aberta agora, inclusive os que não participo:
  // entrar no desafio é escolher competir, e quem entra depois leva as
  // presenças que já tinha. Para isso o check-in precisa ser avaliado
  // agora — em desafio com local, o veredito não tem como ser feito
  // depois, já que a coordenada não é guardada (migração 014).
  const abertosAgora = useMemo(
    () => desafiosQueContam(agora, ativos, suspensos, aberturasMapa),
    [agora, ativos, suspensos, aberturasMapa],
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
  // veria só "nenhum desafio com janela aberta" e acharia que é bug.
  const suspensaoAgora = useMemo(() => {
    if (valendoAgora.length > 0) return null
    for (const c of desafiosQueContam(agora, meusAtivos)) {
      const dia = janelaDoCheckin(agora, c)
      if (dia && suspensos.has(dia)) return suspensaoDoDia(dia, feriados)
    }
    return null
  }, [agora, valendoAgora, meusAtivos, suspensos, feriados])

  // Cada janela vale 1 ponto por desafio: separa os que ainda vão pontuar
  // agora dos que já pontuaram nesta janela. Usa a janela (não a data do
  // calendário) para não se perder em desafios que cruzam a meia-noite
  // (ex.: 21:00–02:00) — check-in às 23h e outro à 01h são a MESMA janela.
  const { aindaPontuam, jaPontuaram } = useMemo(() => {
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
  }, [agora, valendoAgora, meusCheckins, suspensos, aberturasMapa])

  // Desafios abertos agora que exigem estar no local — inclusive os que
  // não participo, senão a foto não seria avaliada e entrar depois não
  // recuperaria nada.
  const comLocal = useMemo(() => abertosAgora.filter((c) => c.local), [abertosAgora])
  /** Só os meus, que é o que a tela detalha com distância. */
  const meusComLocal = useMemo(
    () => valendoAgora.filter((c) => c.local),
    [valendoAgora],
  )

  /**
   * Tem desafio com local rolando e o GPS ainda não disse nem sim nem
   * não. Enquanto isso for verdade, publicar é uma corrida: a câmera é
   * rápida e o GPS pode não ter respondido ainda, principalmente num
   * salão fechado. Sem travar o botão nesse meio-tempo, a foto sai sem
   * coordenada nenhuma — e como ela nunca é reavaliada depois (a
   * coordenada não fica guardada, só o veredito), o ponto se perde pra
   * sempre, em silêncio.
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

  // O GPS espera a câmera (ver `cameraResolvida`): nunca há dois
  // diálogos do sistema empilhados, e simplesmente ENTRAR na tela não
  // dispara pedido nenhum.
  useEffect(() => {
    if (
      cameraResolvida &&
      comLocal.length > 0 &&
      !posicao &&
      !erroLocal &&
      !buscandoLocal
    ) {
      void buscarLocal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comLocal.length, cameraResolvida])

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

  /** Volta para a câmera jogando fora a foto — "tirar outra". */
  const voltarParaCamera = () => {
    descartarFoto()
    setTocouAbrir(true)
    setEtapa('camera')
  }

  const publicar = async () => {
    if (!foto) return
    setEnviando(true)
    try {
      await api.createCheckin(foto, legenda, posicao)
      const contou = aindaPontuamAqui.length > 0
      // O recado do que valeu: a resposta da pergunta que trouxe a
      // pessoa aqui. O que contou vira a etiqueta da tela de duplas.
      if (!contou) {
        toast(
          jaPontuaram.length > 0
            ? 'Seu ponto desta noite já tinha sido contado. A foto está no feed.'
            : suspensaoAgora
              ? 'Hoje não tem forró, então a foto não marca ponto.'
              : foraDeles.length > 0
                ? 'Foto no feed. Ela já fica valendo se você entrar no desafio.'
                : 'Nenhum desafio aberto agora — a foto entrou no feed.',
        )
      }
      setPublicada({ hora: new Date(), contou })
      descartarFoto()
      setLegenda('')
      // O melhor momento para marcar com quem se dançou é agora, com a
      // noite fresca — é o passo seguinte. O aviso atualiza a barra, a
      // tela Hoje e a lista de check-ins da noite.
      setEtapa('duplas')
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
  /** Tem desafio meu exigindo local agora, e a localização não veio. */
  const semLocalizacao = meusComLocal.length > 0 && !posicao

  /**
   * UM aviso, não cinco: vence a informação mais acionável, e o resto
   * fica nos detalhes. Retornos diretos, em ordem de prioridade.
   */
  const decidirStatus = (): Status => {
    if (aindaPontuamAqui.length > 0) {
      const c = aindaPontuamAqui[0]
      const ate = fimDaJanela(agora, c)
      return {
        cor: 'brasa',
        titulo: 'Valendo ponto agora',
        curto: ate ? `até ${ate}` : c.titulo,
        texto:
          aindaPontuamAqui.length === 1
            ? `Valendo ponto em ${c.titulo}${ate ? ` até ${ate}` : ''}.`
            : `Valendo ponto em ${aindaPontuamAqui.length} desafios.`,
      }
    }
    if (longe.length > 0) {
      const lugar = longe[0].desafio.local?.nome || 'onde o desafio conta'
      return {
        cor: 'pessego',
        titulo: 'Longe do local',
        curto: `a ${distanciaLegivel(longe[0].distancia ?? 0)}`,
        texto: `Você está a ${distanciaLegivel(longe[0].distancia ?? 0)} de ${lugar} — de lá, a foto marca ponto.`,
      }
    }
    // Antes do "nenhum desafio aberto": o desafio ESTÁ aberto, o que
    // falta é a localização. Cair no caso final aqui era mentira.
    if (semLocalizacao) {
      return erroLocal
        ? {
            cor: 'pessego',
            titulo: 'Sem localização',
            curto: 'não marca ponto',
            texto: `Tem desafio rolando que só conta ponto no local, e não deu para confirmar onde você está (${erroLocal.toLowerCase()}).`,
          }
        : {
            cor: 'brasa',
            titulo: 'Valendo ponto agora',
            curto: 'conferindo o local',
            texto: 'Confirmando sua localização para saber se a foto marca ponto…',
          }
    }
    if (jaPontuaram.length > 0) {
      return {
        cor: 'verde',
        titulo: 'Você já pontuou hoje',
        curto: 'não conta de novo',
        texto: 'Seu ponto desta noite já foi contado. A foto entra no feed do mesmo jeito.',
      }
    }
    if (suspensaoAgora) {
      return {
        cor: 'pessego',
        titulo: 'Hoje não tem forró',
        curto: 'sem ponto',
        texto: `Hoje não tem forró${suspensaoAgora.motivo ? ` (${suspensaoAgora.motivo})` : ''} — a foto não marca ponto.`,
      }
    }
    if (foraDeles.length > 0) {
      return {
        cor: 'azul',
        titulo: 'Tem desafio rolando',
        curto: 'você não entrou',
        texto:
          'Tem desafio rolando agora que você não entrou. Pode postar — a foto já fica valendo se você entrar depois.',
      }
    }
    return {
      cor: 'pessego',
      titulo: 'Nada valendo agora',
      curto: 'só vai pro feed',
      texto: 'Nenhum desafio com janela aberta agora. A foto entra no feed, mas não marca ponto.',
    }
  }
  const status = decidirStatus()

  /**
   * Em qual passo a tela abre. `?passo=duplas` (vindo da tela Hoje) vai
   * direto para as duplas de quem já postou; `?passo=camera` pula o
   * cartaz. Decide uma vez só: depois quem manda no passo é a pessoa.
   */
  useEffect(() => {
    if (jaDecidiu.current || !carregado) return
    jaDecidiu.current = true
    const passo = params.get('passo')
    if (passo === 'duplas' && jaPosteiHoje) setEtapa('duplas')
    else if (passo === 'camera' && limite.pode) setEtapa('camera')
    else setEtapa('status')
  }, [carregado, jaPosteiHoje, limite.pode, params])

  if (etapa === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner texto="Preparando o check-in…" />
      </div>
    )
  }

  // ---- Passo 1: o cartaz ----
  if (etapa === 'status') {
    return (
      <Cartaz
        status={statusDoCartaz()}
        detalhes={detalhes}
        onDetalhes={() => setDetalhes((d) => !d)}
        onFechar={voltar}
        onAbrir={() => {
          setTocouAbrir(true)
          setEtapa('camera')
        }}
        onDuplas={jaPosteiHoje ? () => setEtapa('duplas') : undefined}
        bloqueio={
          !limite.pode && limite.liberaEm
            ? limite.motivo === 'intervalo'
              ? `Calma no pé! Dá pra postar de novo em ${esperaLegivel(limite.liberaEm, agora)}.`
              : `Você já postou ${LIMITE_POR_JANELA} check-ins nas últimas horas. Libera de novo em ${esperaLegivel(limite.liberaEm, agora)}.`
            : null
        }
        nota={notaAbertura()}
      />
    )
  }

  // ---- Passo 2: a câmera, em tela cheia por cima de tudo ----
  if (etapa === 'camera') {
    return (
      <>
        <CameraCapture
          onCapture={(b) => void aoCapturar(b)}
          onResolvida={() => setCameraResolvida(true)}
          onFechar={() => setEtapa('status')}
          abrirDireto={tocouAbrir}
          permitirFotoTeste={api.mode === 'demo'}
          topo={
            <button
              type="button"
              onClick={() => setDetalhes((d) => !d)}
              aria-expanded={detalhes}
              className="flex h-11 min-w-0 max-w-full items-center justify-center gap-2 rounded-full border-2 border-preto px-3 text-sm font-extrabold text-preto"
              style={{ background: FUNDO[status.cor] }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-preto" />
              <span className="truncate">
                {status.titulo} · {status.curto}
              </span>
            </button>
          }
        />
        {detalhes && (
          <div
            className="anima-aparece fixed inset-x-3.5 z-[55] mx-auto flex max-w-[calc(28rem-28px)] flex-col gap-1.5"
            style={{ top: 'calc(env(safe-area-inset-top) + 66px)' }}
          >
            <div className="rounded-[14px] bg-[rgba(20,27,31,.94)] px-3.5 py-2.5 text-sm text-branco">
              {status.texto}
            </div>
            {linhasDetalhe().map((l) => (
              <div
                key={l.titulo}
                className="flex justify-between gap-3 rounded-[14px] bg-[rgba(20,27,31,.94)] px-3.5 py-2.5 text-sm text-branco"
              >
                <b className="truncate">{l.titulo}</b>
                <span className="shrink-0 text-verde-300">{l.texto}</span>
              </div>
            ))}
            {erroLocal && comLocal.length > 0 && (
              <button
                type="button"
                onClick={() => void buscarLocal()}
                className="h-11 rounded-[14px] bg-brasa-300 text-sm font-extrabold text-preto"
              >
                Tentar a localização de novo
              </button>
            )}
          </div>
        )}
      </>
    )
  }

  // ---- Passo 3: revisar a foto e escrever a legenda ----
  if (etapa === 'revisar' && preview) {
    return (
      <div
        className="anima-aparece flex min-h-dvh flex-col bg-fundo"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-14 items-center justify-center text-[17px] font-extrabold">
          Prévia
        </div>
        <img
          src={preview}
          alt="Prévia do check-in"
          className="mx-4 aspect-[4/5] rounded-[18px] border-2 border-preto object-cover"
        />
        <div className="flex flex-1 flex-col gap-3 px-4 pt-3.5">
          <textarea
            className="input resize-none"
            rows={1}
            maxLength={200}
            aria-label="Legenda"
            placeholder="Legenda (opcional)"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />

          {/* Só aparece quando tem desafio com local em jogo — é o que
              explica por que o botão está preso. */}
          {aguardandoLocal && (
            <p className="flex items-center gap-2.5 rounded-2xl border border-linha bg-sf px-4 py-3 text-sm text-ink2">
              <Icone nome="local" tamanho={18} className="shrink-0 animate-pulse text-bl-t" />
              Confirmando sua localização antes de publicar — só um instante.
            </p>
          )}
          {erroLocal && comLocal.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-linha bg-sf px-4 py-3 text-sm text-ink2">
              <p className="flex-1">
                {erroLocal} — sem isso a foto não marca ponto nos desafios com local.
              </p>
              <button
                type="button"
                className="shrink-0 rounded-full bg-chip px-3 py-1.5 text-xs font-extrabold text-ink"
                onClick={() => void buscarLocal()}
              >
                Tentar de novo
              </button>
            </div>
          )}

          <div
            className="mt-auto flex gap-2.5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            <BotaoSuave
              tamanho="g"
              className="flex-1"
              disabled={enviando}
              onClick={voltarParaCamera}
            >
              Tirar outra
            </BotaoSuave>
            <BotaoAcao
              tamanho="g"
              className="flex-[1.4]"
              // Trava enquanto o GPS ainda não respondeu nem sim nem não:
              // publicar agora sairia sem coordenada, e isso não tem
              // conserto depois (ver `aguardandoLocal`).
              disabled={enviando || !limite.pode || aguardandoLocal}
              onClick={() => void publicar()}
            >
              {enviando ? 'Publicando…' : aguardandoLocal ? 'Aguardando local…' : 'Publicar'}
            </BotaoAcao>
          </div>
        </div>
      </div>
    )
  }

  // ---- Passo 4: com quem você dançou ----
  const horaFeito = publicada?.hora ?? noite.checkinNoite
  return (
    <TelaDuplas
      data={noiteAtual}
      etiqueta={
        horaFeito
          ? `${publicada ? (publicada.contou ? 'Presença registrada' : 'Foto publicada') : noite.situacao === 'pontuou' ? 'Presença registrada' : 'Check-in feito'} · ${horaCurta(horaFeito)}`
          : null
      }
      onSair={() => navigate('/feed', { replace: true })}
    />
  )

  /** O cartaz não pede GPS: usa a situação da noite e o veredito simples. */
  function statusDoCartaz(): Status & { chips: [string, string] } {
    const hora = noite.checkinNoite ? horaCurta(noite.checkinNoite) : null
    switch (noite.situacao) {
      case 'valendo': {
        const c = noite.desafioDaVez
        return {
          cor: 'brasa',
          titulo: 'Valendo ponto agora',
          curto: '',
          texto: '',
          chips: [
            c?.local ? `Só no ${c.local.nome || 'local'}` : (c?.titulo ?? 'Desafio'),
            noite.ateHora ? `até ${noite.ateHora}` : 'agora',
          ],
        }
      }
      case 'pontuou':
        return {
          cor: 'verde',
          titulo: 'Você já pontuou hoje',
          curto: '',
          texto: '',
          chips: [hora ? `Presença às ${hora}` : 'Presença contada', 'Foto extra vai só pro feed'],
        }
      case 'postou':
        return {
          cor: 'verde',
          titulo: 'Sua foto já está no feed',
          curto: '',
          texto: '',
          chips: [hora ? `Check-in às ${hora}` : 'Check-in feito', 'Nada valendo ponto'],
        }
      case 'cancelada':
        return {
          cor: 'pessego',
          titulo: 'Hoje não tem forró',
          curto: '',
          texto: '',
          chips: [noite.motivoCancelamento ?? 'Aula cancelada', 'A foto não marca ponto'],
        }
      case 'fora':
        return {
          cor: 'azul',
          titulo: 'Tem desafio rolando',
          curto: '',
          texto: '',
          chips: [noite.desafioDaVez?.titulo ?? 'Desafio', 'Você não participa'],
        }
      default:
        return {
          cor: 'pessego',
          titulo: 'Nada valendo agora',
          curto: '',
          texto: '',
          chips: ['A foto vai para o feed', 'Sem ponto'],
        }
    }
  }

  /** Linhas do "como está cada desafio", com a distância quando há local. */
  function linhasDetalhe(): { titulo: string; texto: string }[] {
    return abertosAgora.map((c) => {
      const s = situacaoLocal.find((x) => x.desafio.id === c.id)
      const texto = !c.sou_membro
        ? 'Você não participa'
        : jaPontuaram.some((j) => j.id === c.id)
          ? 'Já pontuou hoje'
          : s
            ? s.distancia === null
              ? 'Conferindo o local…'
              : s.dentro
                ? 'No local · valendo'
                : `A ${distanciaLegivel(s.distancia)} do local`
            : (() => {
                const ate = fimDaJanela(agora, c)
                return ate ? `Valendo até ${ate}` : 'Valendo agora'
              })()
      return { titulo: c.titulo, texto }
    })
  }

  /** O espaço abriu mais cedo hoje e isso é o que faz algo valer agora. */
  function notaAbertura(): string | null {
    const a = abertosAgora.length > 0 ? aberturaDoDia(toISODate(agora), aberturas) : null
    return a
      ? `O espaço abriu mais cedo hoje, às ${a.hora_abertura}${a.motivo ? ` (${a.motivo})` : ''}.`
      : null
  }
}

/**
 * Cartaz do check-in: tela inteira na cor da situação, título enorme,
 * duas etiquetas tortas e o botão redondo da câmera embaixo, onde o
 * polegar está.
 */
function Cartaz({
  status,
  detalhes,
  onDetalhes,
  onFechar,
  onAbrir,
  onDuplas,
  bloqueio,
  nota,
}: {
  status: Status & { chips: [string, string] }
  detalhes: boolean
  onDetalhes: () => void
  onFechar: () => void
  onAbrir: () => void
  onDuplas?: () => void
  /** Limite de fotos: no lugar do botão da câmera, quando volta a liberar. */
  bloqueio: string | null
  nota: string | null
}) {
  const noite = useNoite()
  const agora = noite.agora
  const cabecalho = `${agora
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .replace(',', '')
    .replace(' de ', ' ')} · ${horaCurta(agora)}`
  return (
    <div
      className="anima-aparece fixed inset-0 z-40 mx-auto flex max-w-md flex-col overflow-hidden px-[22px] text-preto"
      style={{
        background: FUNDO[status.cor],
        paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)',
      }}
    >
      <div className="relative z-[2] flex items-center justify-between">
        <span className="text-[15px] font-extrabold first-letter:uppercase">{cabecalho}</span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-preto bg-branco text-preto"
        >
          <Icone nome="fechar" tamanho={20} traco={2.6} />
        </button>
      </div>
      <div
        aria-hidden
        className="absolute -right-[70px] top-[150px] h-[260px] w-[260px] rounded-full border-[2.5px] border-preto bg-branco opacity-[.18]"
      />
      <div className="sem-barra relative z-[2] flex flex-1 flex-col justify-center gap-[18px] overflow-y-auto py-4">
        <h1 className="m-0 text-[clamp(56px,19vw,76px)] font-extrabold leading-[.88] tracking-[-.05em] [text-wrap:balance]">
          {status.titulo}
        </h1>
        <div className="flex flex-wrap gap-2">
          <span className="-rotate-3 rounded-full border-2 border-preto bg-branco px-3.5 py-2 text-[15px] font-extrabold">
            {status.chips[0]}
          </span>
          <span className="rotate-2 rounded-full bg-preto px-3.5 py-2 text-[15px] font-extrabold text-branco">
            {status.chips[1]}
          </span>
        </div>
        {nota && <p className="text-sm font-bold">{nota}</p>}
        {noite.linhas.length > 0 && (
          <button
            type="button"
            onClick={onDetalhes}
            aria-expanded={detalhes}
            className="h-11 self-start text-[15px] font-extrabold underline underline-offset-[3px]"
          >
            Como está cada desafio
          </button>
        )}
        {detalhes && (
          <div className="anima-aparece flex flex-col gap-1.5">
            {noite.linhas.map((l) => (
              <div
                key={l.desafio.id}
                className="flex justify-between gap-3 rounded-[14px] border-2 border-preto bg-branco/85 px-3.5 py-2.5 text-[15px] font-bold"
              >
                <span className="truncate">{l.desafio.titulo}</span>
                <span className="shrink-0">{l.texto}</span>
              </div>
            ))}
          </div>
        )}
        {onDuplas && (
          <button
            type="button"
            onClick={onDuplas}
            className="h-12 self-start rounded-2xl border-2 border-preto bg-branco px-4 text-[15px] font-extrabold"
          >
            Com quem você dançou?
          </button>
        )}
      </div>
      {bloqueio ? (
        <p className="relative z-[2] rounded-2xl border-2 border-preto bg-branco px-4 py-3 text-center text-[15px] font-extrabold">
          {bloqueio}
        </p>
      ) : (
        <button
          type="button"
          onClick={onAbrir}
          className="relative z-[2] flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1 self-center rounded-full bg-preto text-[13px] font-extrabold text-branco shadow-[0_0_0_6px_rgba(0,5,7,.18)] active:scale-95"
        >
          <Icone nome="camera" tamanho={34} traco={2} />
          Abrir câmera
        </button>
      )}
    </div>
  )
}
