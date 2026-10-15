import { useState } from 'react'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/dates'
import { PONTOS_POR_CHAVE, type PassoComSituacao, type SaldoChaves } from '../lib/trilha'
import { BotaoAcao, BotaoSuave, Folha } from './ui'

const GANHOS = [
  ['Presença', 'Cada noite com check-in válido'],
  ['Parceria', 'Noite com dupla confirmada (1 por noite)'],
  ['Nova parceria', 'Primeira dança com alguém no Forródex'],
] as const

export function FolhaChave({
  alvo,
  saldo,
  onFechar,
  onLiberar,
}: {
  alvo: PassoComSituacao | null
  saldo: SaldoChaves
  onFechar: () => void
  onLiberar: (passoId: string) => Promise<void>
}) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const temChave = saldo.disponiveis > 0
  const pontosNaVez = PONTOS_POR_CHAVE - saldo.faltam

  const liberar = async () => {
    if (!alvo) return
    setSalvando(true)
    try {
      await onLiberar(alvo.passo.id)
      toast(`“${alvo.passo.nome}” liberado!`)
      onFechar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={alvo !== null} onFechar={onFechar} titulo={alvo ? `Liberar “${alvo.passo.nome}”?` : undefined}>
      <div className="flex flex-col gap-4 px-5 pb-8">
        {alvo?.data && (
          <p className="text-[15px] leading-snug text-ink2">
            {/* A data abreviada já termina em ponto ("20 de out.") */}
            A turma vê esse passo em {formatDate(alvo.data)}{' '}
            {temChave
              ? `Você usa 1 das suas ${saldo.disponiveis} ${saldo.disponiveis === 1 ? 'chave' : 'chaves'} e assiste antes.`
              : 'Você ainda não tem chave.'}
          </p>
        )}
        <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Como ganhar chaves</span>
          {GANHOS.map(([titulo, desc]) => (
            <div key={titulo} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brasa-300 font-extrabold text-preto">
                +1
              </span>
              <span className="flex flex-col text-sm">
                <b>{titulo}</b>
                <span className="text-xs text-ink2">{desc}</span>
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1.5 border-t border-linha pt-2.5">
            <div className="flex justify-between text-[13px] font-bold text-ink2">
              <span>{PONTOS_POR_CHAVE} pontos = 1 chave</span>
              <span>
                {pontosNaVez} de {PONTOS_POR_CHAVE}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-chip">
              <div
                className="h-full rounded-full bg-brasa-500"
                style={{ width: `${(pontosNaVez / PONTOS_POR_CHAVE) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <BotaoAcao cor="preto" bloco disabled={!temChave || salvando} onClick={() => void liberar()}>
          {salvando ? 'Liberando…' : temChave ? 'Usar 1 chave' : `Faltam ${saldo.faltam} pontos`}
        </BotaoAcao>
        <BotaoSuave tamanho="g" onClick={onFechar}>
          Esperar a turma
        </BotaoSuave>
      </div>
    </Folha>
  )
}
