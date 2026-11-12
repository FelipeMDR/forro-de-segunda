import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { idDaPlanilha, montarScriptPlanilha } from '../lib/scriptPlanilha'
import type { Challenge, StatusSincronizacao } from '../lib/types'
import { BotaoAcao, BotaoSuave, Confirmar, RotuloSecao } from './ui'

const LIMITE_ATRASO_MIN = 30

const PASSOS = [
  'Abra script.google.com e crie um projeto novo.',
  'Apague o conteúdo do arquivo e cole o script.',
  'Salve o projeto.',
  'Escolha a função "instalar" e clique em Executar.',
  'Autorize com a conta do Google que tem acesso à planilha.',
]

/**
 * Painel da organização para ligar a planilha de ingressos ao desafio:
 * gera o Apps Script com o segredo e mostra como a sincronização anda.
 * O segredo só aparece aqui, na hora de gerar, e nunca vai para o log.
 */
export function SincronizacaoPlanilha({ desafio }: { desafio: Challenge }) {
  const { api } = useAuth()
  const toast = useToast()

  const [status, setStatus] = useState<StatusSincronizacao | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [link, setLink] = useState('')
  const [script, setScript] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmaGerar, setConfirmaGerar] = useState(false)
  const [confirmaRemocao, setConfirmaRemocao] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())

  const carregar = async () => {
    try {
      setStatus(await api.statusSincronizacao(desafio.id))
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setCarregado(true)
      setAgora(Date.now())
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desafio.id])

  const planilhaId = idDaPlanilha(link)
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const semBanco = !url || !chave

  const gerar = async () => {
    if (!planilhaId) return
    setConfirmaGerar(false)
    setOcupado(true)
    try {
      const segredo = await api.gerarSegredoIngresso(desafio.id)
      setScript(
        montarScriptPlanilha({
          supabaseUrl: url || 'https://SEU-PROJETO.supabase.co',
          anonKey: chave || 'SUA-CHAVE-ANON',
          segredo,
          planilhaId,
        }),
      )
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const aoGerar = () => {
    // Gerar de novo derruba o script que já está rodando
    if (status) setConfirmaGerar(true)
    else void gerar()
  }

  const copiar = async () => {
    if (!script) return
    try {
      await navigator.clipboard.writeText(script)
      toast('Script copiado.')
    } catch {
      toast('Não consegui copiar. Selecione o texto e copie à mão.', 'erro')
    }
  }

  const confirmarRemocao = async () => {
    if (!status) return
    setOcupado(true)
    try {
      const n = await api.confirmarRemocoesIngresso(desafio.id, status.remocoes_travadas)
      toast(n === 1 ? '1 pessoa removida.' : `${n} pessoas removidas.`)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setConfirmaRemocao(false)
      setOcupado(false)
      await carregar()
    }
  }

  const minutos = status ? Math.max(0, Math.floor((agora - new Date(status.em).getTime()) / 60000)) : 0
  const atrasada = !!status && status.status !== 'congelado' && minutos > LIMITE_ATRASO_MIN

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-linha bg-sf p-4">
      <RotuloSecao className="px-0">Planilha de ingressos</RotuloSecao>

      {!carregado ? null : (
        <>
          {atrasada && (
            <p className="rounded-[14px] bg-brasa-500/15 p-3 text-[14px] font-bold text-or-t">
              Sem sincronizar há {minutos} min. Confira se o gatilho ainda está ligado no Apps Script.
            </p>
          )}

          {status ? (
            <div className="flex flex-col gap-1.5 text-[14px]">
              <p className="font-bold">
                Última sincronização há {minutos} min
              </p>
              {status.status === 'congelado' && (
                <p className="text-ink2">
                  A festa já passou: a sincronização parou. Pode desligar o gatilho no Apps Script.
                </p>
              )}
              {status.status === 'sem_cabecalho' && (
                <p className="text-or-t">
                  Não achei o cabeçalho na planilha (colunas de nome e telefone).
                </p>
              )}
              <p className="text-ink2">
                {status.dentro} dentro · {status.aguardando} aguardando conta
              </p>

              {status.invalidos.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-ink2">
                  {status.invalidos.map((l) => (
                    <li key={`i${l.linha}`}>
                      {/* O resumo não diz o motivo: vazio, curto e sem DDD
                          caem todos aqui */}
                      Linha {l.linha} — {l.nome}: telefone inválido (sem DDD ou incompleto)
                    </li>
                  ))}
                </ul>
              )}
              {status.ambiguos.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-ink2">
                  {status.ambiguos.map((l) => (
                    <li key={`a${l.linha}`}>
                      Linha {l.linha} — {l.nome}: telefone bate com mais de uma conta, adicione à mão
                    </li>
                  ))}
                </ul>
              )}

              {status.remocoes_travadas > 0 && (
                <div className="mt-1 flex flex-col gap-2 rounded-[14px] bg-brasa-500/15 p-3">
                  <p className="font-bold text-or-t">
                    {status.remocoes_travadas === 1
                      ? '1 pessoa sumiu da planilha e a remoção está travada.'
                      : `${status.remocoes_travadas} pessoas sumiram da planilha e a remoção está travada.`}{' '}
                    Confira se a planilha está certa antes de confirmar.
                  </p>
                  <BotaoSuave perigo onClick={() => setConfirmaRemocao(true)}>
                    Confirmar remoção
                  </BotaoSuave>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[14px] text-ink2">
              Ainda não sincronizou. Gere o script abaixo e instale na conta do Google que acessa a planilha.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-[13px] font-bold text-ink3">
              Link da planilha
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                inputMode="url"
                className="min-h-11 rounded-[14px] border-[1.5px] border-linha bg-fundo px-3 text-[15px] font-normal text-ink"
              />
            </label>
            {link.trim() && !planilhaId && (
              <p className="text-[13px] text-or-t">Esse não parece um link do Google Planilhas.</p>
            )}
            {semBanco && (
              <p className="text-[13px] text-ink3">
                Modo demonstração: o script sai com endereço e chave de exemplo.
              </p>
            )}
            <BotaoAcao tamanho="p" sombra={false} disabled={!planilhaId || ocupado} onClick={aoGerar}>
              {ocupado ? 'Um momento…' : 'Gerar script'}
            </BotaoAcao>
          </div>

          {script && (
            <div className="flex flex-col gap-3">
              <textarea
                readOnly
                value={script}
                rows={8}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-[14px] border-[1.5px] border-linha bg-fundo p-3 font-mono text-[12px] text-ink"
              />
              <BotaoSuave onClick={() => void copiar()}>Copiar</BotaoSuave>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[14px] text-ink2">
                {PASSOS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      <Confirmar
        aberto={confirmaGerar}
        titulo="Gerar um script novo?"
        texto="O script que já está instalado na planilha para de funcionar. Você vai precisar instalar o novo."
        ok="Gerar novo"
        ocupado={ocupado}
        onOk={() => void gerar()}
        onVoltar={() => setConfirmaGerar(false)}
      />
      <Confirmar
        aberto={confirmaRemocao}
        titulo="Confirmar a remoção?"
        texto={`${status?.remocoes_travadas ?? 0} pessoa(s) saem do desafio e perdem o ingresso garantido. Isso segue a planilha como está agora.`}
        ok="Remover"
        ocupado={ocupado}
        onOk={() => void confirmarRemocao()}
        onVoltar={() => setConfirmaRemocao(false)}
      />
    </section>
  )
}
