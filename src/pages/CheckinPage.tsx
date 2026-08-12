import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { MarcarDuplas } from '../components/MarcarDuplas'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  challengePhase,
  desafiosQueContam,
  diaDaNoite,
  diasSuspensos,
  janelaDoCheckin,
  suspensaoDoDia,
} from '../lib/dates'
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
import type { Challenge, Feriado } from '../lib/types'

export function CheckinPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const [desafios, setDesafios] = useState<Challenge[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [meusCheckins, setMeusCheckins] = useState<Date[]>([])
  const [foto, setFoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [legenda, setLegenda] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Muda sozinho com o tempo (o respiro de 5 min vence), então precisa
  // de um tique para a tela destravar sem o aluno recarregar a página.
  const [agora, setAgora] = useState(() => new Date())
  const [posicao, setPosicao] = useState<PosicaoObtida | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [buscandoLocal, setBuscandoLocal] = useState(false)

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
    if (userId) {
      void api
        .checkinsDe(userId)
        .then((cs) => setMeusCheckins(cs.map((c) => new Date(c.criado_em))))
        .catch(() => setMeusCheckins([]))
    }
  }, [api, userId])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const suspensos = useMemo(() => diasSuspensos(feriados), [feriados])

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
    () => desafiosQueContam(new Date(), ativos, suspensos),
    [ativos, suspensos],
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
      const janelaAtual = janelaDoCheckin(agora, c, suspensos)
      const jaContou =
        janelaAtual !== null &&
        meusCheckins.some((d) => janelaDoCheckin(d, c, suspensos) === janelaAtual)
      if (jaContou) jaPontuaram.push(c)
      else aindaPontuam.push(c)
    }
    return { aindaPontuam, jaPontuaram }
  }, [valendoAgora, meusCheckins, suspensos])

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

  // Só pede GPS se algum desafio realmente precisar — pedir permissão
  // sem motivo é o tipo de coisa que faz o aluno negar pra sempre.
  const buscarLocal = async () => {
    setBuscandoLocal(true)
    setErroLocal(null)
    try {
      setPosicao(await obterPosicao())
    } catch (e) {
      setErroLocal((e as Error).message)
    } finally {
      setBuscandoLocal(false)
    }
  }

  useEffect(() => {
    if (comLocal.length > 0 && !posicao && !erroLocal && !buscandoLocal) {
      void buscarLocal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comLocal.length])

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
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  const publicar = async () => {
    if (!foto) return
    setEnviando(true)
    try {
      await api.createCheckin(foto, legenda, posicao)
      toast(
        aindaPontuamAqui.length > 0
          ? `Check-in confirmado! Valeu ponto em ${aindaPontuamAqui.length} ${
              aindaPontuamAqui.length === 1 ? 'desafio' : 'desafios'
            } 🎉`
          : jaPontuaram.length > 0
            ? 'Foto publicada! O ponto de hoje já tinha sido contado 😉'
            : suspensaoAgora
              ? 'Foto publicada! Como a aula de hoje foi cancelada, ela não conta ponto 🚫'
              : foraDeles.length > 0
                ? 'Foto publicada! Ela já fica valendo caso você entre no desafio 🏆'
                : 'Foto publicada! (nenhum desafio com janela aberta agora)',
      )
      // Não sai da tela: o melhor momento para marcar com quem se
      // dançou é agora, com a noite fresca. A pessoa navega quando
      // quiser — ou nem marca, que também está ok.
      setFoto(null)
      setLegenda('')
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return null
      })
      setMeusCheckins((atual) => [...atual, new Date()])
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
   * UM aviso, não cinco.
   *
   * Antes cada situação (valendo ponto, longe do local, já pontuou,
   * aula cancelada, desafio que não participo, nada aberto) tinha seu
   * próprio cartão, e vários apareciam juntos — empurrando a câmera,
   * que é o motivo da tela existir, para fora do celular. Aqui vence a
   * informação mais acionável, e o resto fica nos detalhes.
   */
  const status: { tom: 'ok' | 'info' | 'aviso'; emoji: string; texto: string } =
    aindaPontuamAqui.length > 0
      ? {
          tom: 'ok',
          emoji: '✅',
          texto:
            aindaPontuamAqui.length === 1
              ? `Valendo ponto em ${aindaPontuamAqui[0].titulo}`
              : `Valendo ponto em ${aindaPontuamAqui.length} desafios`,
        }
      : longe.length > 0
        ? {
            tom: 'aviso',
            emoji: '📍',
            texto: `Você está a ${distanciaLegivel(longe[0].distancia ?? 0)} de ${
              longe[0].desafio.local?.nome || 'onde o desafio conta'
            } — de lá, a foto marca ponto.`,
          }
        : jaPontuaram.length > 0
          ? {
              tom: 'info',
              emoji: '👍',
              texto:
                'Seu ponto desta noite já foi contado. A foto entra no feed do mesmo jeito.',
            }
          : suspensaoAgora
            ? {
                tom: 'aviso',
                emoji: '🚫',
                texto: `Hoje não tem forró${
                  suspensaoAgora.motivo ? ` (${suspensaoAgora.motivo})` : ''
                } — a foto não marca ponto.`,
              }
            : foraDeles.length > 0
              ? {
                  tom: 'info',
                  emoji: '🏆',
                  texto:
                    'Tem desafio rolando agora que você não entrou. Pode postar — a foto já fica valendo se você entrar depois.',
                }
              : {
                  tom: 'aviso',
                  emoji: '⚠️',
                  texto:
                    'Nenhum desafio com janela aberta agora. A foto entra no feed, mas não marca ponto.',
                }

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Check-in da aula 📸</h1>

      {/* Só depois de ter foto no dia: marcar dupla exige que os dois
          tenham feito check-in, então antes disso nem faria sentido. */}
      {jaPosteiHoje && (
        <>
          <MarcarDuplas data={noiteAtual} />
          <Link className="btn-ghost block text-center" to="/">
            Ir para o feed
          </Link>
        </>
      )}

      <div
        className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${CORES[status.tom]}`}
      >
        <span aria-hidden>{status.emoji}</span>
        <p className="flex-1">{status.texto}</p>
      </div>

      {/* GPS falhou: tem botão, então não cabe no resumo. */}
      {erroLocal && comLocal.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <p className="flex-1">
            📍 {erroLocal} — sem isso a foto não marca ponto nos desafios com
            local, nem se você entrar depois.
          </p>
          <button
            className="shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs font-bold"
            onClick={() => void buscarLocal()}
          >
            Tentar de novo
          </button>
        </div>
      )}

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

      {preview ? (
        <div className="card overflow-hidden">
          <img
            src={preview}
            alt="Prévia do check-in"
            className="aspect-[4/5] w-full object-cover"
          />
          <button
            className="btn-ghost m-3"
            onClick={() => {
              setFoto(null)
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old)
                return null
              })
            }}
          >
            Tirar outra 🔄
          </button>
        </div>
      ) : (
        limite.pode && (
          <>
            <CameraCapture
              onCapture={(b) => void aoCapturar(b)}
              permitirFotoTeste={api.mode === 'demo'}
            />
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
        )
      )}

      <div>
        <label className="label" htmlFor="legenda">
          Legenda (opcional)
        </label>
        <textarea
          id="legenda"
          className="input resize-none"
          rows={2}
          maxLength={200}
          placeholder="Como foi a aula de hoje?"
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
        />
      </div>

      <button
        className="btn-primary w-full py-3.5 text-base"
        disabled={!foto || enviando || !limite.pode}
        onClick={() => void publicar()}
      >
        {enviando ? 'Publicando…' : 'Publicar check-in 🎉'}
      </button>

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
    </div>
  )
}
