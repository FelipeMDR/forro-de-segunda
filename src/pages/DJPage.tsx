import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConexaoSpotify } from '../components/ConexaoSpotify'
import { Icone } from '../components/Icone'
import { LinhaPedido } from '../components/LinhaPedido'
import { Spinner } from '../components/Spinner'
import { BotaoSuave, Cabecalho, Confirmar, Segmentado } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { horaCurta } from '../context/NoiteContext'
import { useToast } from '../context/ToastContext'
import { proximasNaTela } from '../lib/filaMusica'
import type { ConexaoDJ, PedidoMusica, PedidoNaFila, SessaoDJ } from '../lib/types'
import { useAtualizacaoPeriodica } from '../lib/useAtualizacaoPeriodica'
import { usePodeSerDJ } from '../lib/usePodeSerDJ'
import { useSessaoDJAoVivo } from '../lib/useSessaoDJAoVivo'
import { useLembrado } from '../lib/memoriaTelas'

const AVISOS: Record<NonNullable<SessaoDJ['aviso']>, string> = {
  sem_aparelho:
    'O Spotify não está tocando em nenhum aparelho. Dê play na playlist no Spotify.',
  sem_premium:
    'O Spotify recusou o controle do player. A conta precisa ser Premium e estar liberada no painel do Spotify.',
}

/** Em quanto tempo os pedidos fecham sozinhos, escolhido ao ligar. */
type Fechamento = '2' | '4' | 'nunca'
const FECHAMENTOS = [
  { valor: '2', rotulo: '2 h' },
  { valor: '4', rotulo: '4 h' },
  { valor: 'nunca', rotulo: 'Até eu desligar' },
] as const

/**
 * Modo DJ: ligar, ver a fila e cuidar dela. O professor NÃO precisa
 * deixar esta tela aberta — quem manda as músicas é o servidor, a cada
 * 15 s. Ela serve para ver e cancelar.
 */
export function DJPage() {
  const { api, userId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [conexao, setConexao] = useLembrado<ConexaoDJ | null>('dj:conexao', null)
  const [sessao, setSessao] = useLembrado<SessaoDJ | null>('dj:sessao', null)
  const [fila, setFila] = useLembrado<PedidoNaFila[]>('dj:fila', [])
  const [pedidos, setPedidos] = useLembrado<PedidoMusica[]>('dj:pedidos', [])
  const [ocupado, setOcupado] = useState(false)
  const [fechamento, setFechamento] = useState<Fechamento>('2')
  const [confirmarDesligar, setConfirmarDesligar] = useState(false)
  const [confirmarAssumir, setConfirmarAssumir] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<PedidoMusica | null>(null)
  const pode = usePodeSerDJ()

  const carregar = useCallback(async () => {
    if (!pode) return
    const [c, s, f, p] = await Promise.all([
      api.minhaConexaoDJ().catch(() => ({ conectado: false, spotify_nome: null, plano: null })),
      api.sessaoDJAberta(),
      api.filaDaNoite(),
      api.pedidosDaNoite(),
    ])
    setConexao(c)
    setSessao(s)
    setFila(f)
    setPedidos(p)
  }, [api, pode])
  // A troca de música chega na hora, pela sessão (tempo real); a busca
  // periódica fica só para pedidos novos de outras pessoas
  useSessaoDJAoVivo(api, carregar)
  useAtualizacaoPeriodica(carregar, 120_000)

  // A busca periódica roda ao montar, quando `pode` ainda é null e
  // `carregar` não faz nada: sem isto, a primeira carga só viria em 2 min
  const [falhou, setFalhou] = useState(false)
  const primeiraCarga = useCallback(() => {
    setFalhou(false)
    carregar().catch((e) => {
      console.error('[dj]', e)
      setFalhou(true)
    })
  }, [carregar])
  useEffect(() => {
    if (pode) primeiraCarga()
  }, [pode, primeiraCarga])

  const ligar = async (assumir: boolean) => {
    setOcupado(true)
    try {
      const r = await api.ligarModoDJ(assumir)
      if (r.tipo === 'ocupado') {
        setConfirmarAssumir(r.dj_nome)
        return
      }
      setConfirmarAssumir(null)
      if (fechamento !== 'nunca') {
        const quando = new Date(Date.now() + Number(fechamento) * 3600_000)
        // Sem a migração 034 não há como programar: segue ligado até
        // desligar, e a tela mostra isso (fecha_em continua vazio).
        await api.programarFechamentoDJ(quando.toISOString()).catch((e) => {
          console.warn('[dj] fechamento automático indisponível', e)
          toast('Não deu para programar o fechamento: desligue quando a dança acabar.', 'erro')
        })
      }
      // Primeira passada já, sem esperar o agendamento
      await api.cutucarLoopDJ()
      await carregar()
      toast('Modo DJ ligado. Os pedidos estão abertos.')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const desligar = async () => {
    setOcupado(true)
    try {
      await api.desligarModoDJ()
      setConfirmarDesligar(false)
      await carregar()
      toast('Modo DJ desligado')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const cancelar = async (p: PedidoMusica) => {
    try {
      await api.cancelarPedido(p.id)
      setCancelando(null)
      await carregar()
      toast(`Pedido de ${p.nome.split(' ')[0]} cancelado`)
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  if (pode === null) return <Spinner texto="Carregando o Modo DJ…" />
  if (!pode) {
    return (
      <div className="anima-tela">
        <Cabecalho titulo="Modo DJ" />
        <div className="mx-4 flex flex-col items-start gap-3 rounded-[20px] border border-linha bg-sf p-5">
          <span className="text-[15px] leading-relaxed text-ink2">
            O Modo DJ é para quem tem o cargo de DJ. Para pedir uma música, use a
            Música da noite.
          </span>
          <BotaoSuave onClick={() => navigate('/musica')}>Música da noite</BotaoSuave>
        </div>
      </div>
    )
  }
  if (conexao === null && falhou) {
    return (
      <div className="anima-tela">
        <Cabecalho titulo="Modo DJ" />
        <div className="mx-4 flex flex-col items-start gap-3 rounded-[20px] border border-linha bg-sf p-5">
          <span className="text-[15px] leading-relaxed text-ink2">
            Não deu para carregar o Modo DJ. Confira a internet e tente de novo.
          </span>
          <BotaoSuave onClick={primeiraCarga}>Tentar de novo</BotaoSuave>
        </div>
      </div>
    )
  }
  if (conexao === null) return <Spinner texto="Carregando o Modo DJ…" />

  const souEu = sessao?.dj_user_id === userId

  // Inclui o pedido que já está na fila do Spotify e ainda não tocou
  const proximas = proximasNaTela(pedidos, fila, sessao?.tocando?.pedido_id ?? null, new Date())
  const proxima = proximas[0]
  const resto = proximas.slice(1)
  const esperando = proximas.filter((x) => !x.naFilaDoSpotify).length

  return (
    <div className="anima-tela">
      <Cabecalho
        titulo="Modo DJ"
        acao={
          souEu && (
            <BotaoSuave tamanho="p" disabled={ocupado} onClick={() => setConfirmarDesligar(true)}>
              Desligar
            </BotaoSuave>
          )
        }
      />
      <div className="flex flex-col gap-3.5 px-4 pt-1">
        {!conexao.conectado ? (
          <ConexaoSpotify />
        ) : !souEu ? (
          <>
            <div className="flex flex-col gap-3.5 rounded-3xl border-2 border-preto bg-azul-500 p-5 text-preto shadow-[0_5px_0_#000507]">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-preto text-azul-300">
                <Icone nome="fone" tamanho={28} traco={2.3} />
              </span>
              <span className="text-[26px] font-extrabold leading-[1.05] tracking-[-.02em]">
                Abrir os pedidos de música
              </span>
              <span className="text-[15px] font-semibold leading-snug">
                Dê play na sua playlist no Spotify e ligue o Modo DJ. Os pedidos entram no
                meio dela, um de cada pessoa por vez.
              </span>
              <div className="flex items-center gap-2 rounded-[14px] bg-branco/85 px-3 py-2.5 text-sm font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-verde-700" />
                Spotify conectado{conexao.spotify_nome ? ` · ${conexao.spotify_nome}` : ''}
              </div>
            </div>
            {sessao && (
              <p className="rounded-2xl border border-linha bg-sf px-4 py-3 text-sm leading-snug text-ink2">
                <b className="text-ink">{sessao.dj_nome}</b> está de DJ agora. Ligando, você
                assume o som da noite.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[15px] font-extrabold">Fechar os pedidos sozinho</span>
              <Segmentado valor={fechamento} onChange={setFechamento} opcoes={FECHAMENTOS} />
              <span className="px-1 text-[13px] leading-snug text-ink3">
                Assim os pedidos não ficam abertos depois que a dança acaba.
              </span>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void ligar(Boolean(sessao))}
              className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] border-2 border-preto bg-preto text-lg font-extrabold text-branco disabled:opacity-50"
            >
              <Icone nome="fone" tamanho={22} traco={2.3} />
              {sessao ? 'Assumir o Modo DJ' : 'Ligar Modo DJ'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-verde-500 bg-verde-500/15 px-3.5 py-3 text-sm font-bold">
              <span className="pulso-verde h-2.5 w-2.5 shrink-0 rounded-full bg-verde-500" />
              <span className="flex-1">
                Pedidos abertos ·{' '}
                {sessao?.fecha_em
                  ? `fecham sozinhos às ${horaCurta(new Date(sessao.fecha_em))}`
                  : 'até você desligar'}
              </span>
            </div>

            {sessao?.aviso && (
              <p className="rounded-2xl border-[1.5px] border-brasa-500 bg-sf px-4 py-3 text-sm leading-snug">
                {AVISOS[sessao.aviso]}
              </p>
            )}

            <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
              <div className="px-3.5 pt-3 text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
                Tocando agora
              </div>
              {sessao?.tocando ? (
                <LinhaPedido
                  className="px-3.5 py-3"
                  titulo={sessao.tocando.titulo}
                  artista={sessao.tocando.artista}
                  capaUrl={sessao.tocando.capa_url}
                  tamanhoCapa={64}
                  pessoa={
                    sessao.tocando.pedido_por
                      ? { nome: sessao.tocando.pedido_por, avatarUrl: sessao.tocando.pedido_por_avatar }
                      : null
                  }
                />
              ) : (
                <p className="px-3.5 py-3 text-sm text-ink3">
                  Esperando a primeira leitura do Spotify…
                </p>
              )}
            </div>

            {proxima && (
              <div className="overflow-hidden rounded-[20px] border-[1.5px] border-brasa-500 bg-sf">
                <div className="px-3.5 pt-3 text-xs font-extrabold uppercase tracking-[.06em] text-or-t">
                  Próxima do rodízio
                </div>
                <LinhaPedido
                  className="px-3.5 py-3"
                  titulo={proxima.pedido.titulo}
                  artista={proxima.pedido.artista}
                  capaUrl={proxima.pedido.capa_url}
                  pessoa={{ nome: proxima.pedido.nome, avatarUrl: proxima.pedido.avatar_url }}
                  detalhe={proxima.naFilaDoSpotify ? 'já está na fila do Spotify' : undefined}
                  acao={
                    proxima.naFilaDoSpotify ? undefined : (
                      <BotaoCancelar onClick={() => setCancelando(proxima.pedido)} />
                    )
                  }
                />
              </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
              <div className="px-3.5 pb-1 pt-3 text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
                Fila ({resto.length})
              </div>
              {resto.map(({ pedido: p, posicao, naFilaDoSpotify }) => (
                <LinhaPedido
                  key={p.id}
                  className="border-t border-linha px-3 py-2.5"
                  posicao={posicao}
                  titulo={p.titulo}
                  artista={p.artista}
                  capaUrl={p.capa_url}
                  tamanhoCapa={48}
                  pessoa={{ nome: p.nome, avatarUrl: p.avatar_url }}
                  detalhe={naFilaDoSpotify ? 'já está na fila do Spotify' : undefined}
                  acao={naFilaDoSpotify ? undefined : <BotaoCancelar onClick={() => setCancelando(p)} />}
                />
              ))}
              {proximas.length === 0 && (
                <div className="p-3.5 text-sm text-ink3">
                  Nenhum pedido esperando: a playlist segue.
                </div>
              )}
            </div>
            <span className="text-center text-[13px] leading-snug text-ink3">
              Não precisa deixar esta tela aberta: o servidor manda as músicas para o
              Spotify sozinho.
            </span>
          </>
        )}
      </div>

      <Confirmar
        aberto={confirmarDesligar}
        titulo="Desligar o Modo DJ?"
        texto={`Os pedidos fecham para todo mundo.${
          esperando > 0
            ? ` ${esperando === 1 ? 'O pedido que ainda está esperando não vai tocar' : `Os ${esperando} pedidos que ainda estão esperando não vão tocar`}.`
            : ''
        }`}
        ok="Desligar"
        voltar="Continuar"
        ocupado={ocupado}
        alerta={false}
        onOk={() => void desligar()}
        onVoltar={() => setConfirmarDesligar(false)}
      />
      <Confirmar
        aberto={confirmarAssumir !== null}
        titulo={`${confirmarAssumir ?? ''} está de DJ agora`}
        texto="Assumindo, a sessão atual fecha e o som da noite passa para o seu Spotify."
        ok="Assumir"
        ocupado={ocupado}
        alerta={false}
        onOk={() => void ligar(true)}
        onVoltar={() => setConfirmarAssumir(null)}
      />
      <Confirmar
        aberto={cancelando !== null}
        titulo={cancelando ? `Cancelar o pedido de ${cancelando.nome.split(' ')[0]}?` : ''}
        texto={cancelando ? `“${cancelando.titulo}” sai da fila e não vai tocar hoje.` : undefined}
        ok="Cancelar pedido"
        onOk={() => cancelando && void cancelar(cancelando)}
        onVoltar={() => setCancelando(null)}
      />
    </div>
  )
}

function BotaoCancelar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 shrink-0 rounded-xl bg-chip px-2.5 text-[13px] font-extrabold text-ink2"
    >
      Cancelar
    </button>
  )
}
