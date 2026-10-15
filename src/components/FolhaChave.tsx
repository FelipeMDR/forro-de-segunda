import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/dates'
import type { PassoComSituacao, SaldoChaves } from '../lib/trilha'
import { Icone } from './Icone'
import { BotaoAcao, BotaoSuave, Folha } from './ui'

const GANHOS = [
  ['Presença', 'Cada noite com check-in válido'],
  ['Parceria', 'Noite com dupla confirmada (1 por noite)'],
  ['Nova parceria', 'Primeira dança com alguém no Forródex'],
] as const

/** "Liberar com chave": confirma, gasta a chave e mostra o passo aberto. */
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
  const [liberado, setLiberado] = useState<PassoComSituacao | null>(null)

  useEffect(() => {
    if (alvo) setLiberado(null)
  }, [alvo])

  const temChave = saldo.disponiveis > 0
  const porChave = saldo.pontosPorChave
  const pontosNaVez = porChave - saldo.faltam

  const liberar = async () => {
    if (!alvo) return
    setSalvando(true)
    try {
      await onLiberar(alvo.passo.id)
      setLiberado(alvo)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={alvo !== null} onFechar={onFechar}>
      {liberado ? (
        <div className="flex flex-col items-center gap-4 px-5 pt-2 pb-8 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-verde-700 text-branco">
            <Icone nome="check" traco={2.6} className="h-9 w-9" />
          </span>
          <h2 className="text-[26px] font-extrabold leading-tight">Passo liberado!</h2>
          <p className="text-[15px] leading-snug text-ink2">
            “{liberado.passo.nome}” já está na sua trilha.{' '}
            {saldo.disponiveis > 0
              ? `Sobrou ${saldo.disponiveis} ${saldo.disponiveis === 1 ? 'chave' : 'chaves'}.`
              : 'Suas chaves acabaram por enquanto.'}
          </p>
          <Link
            to={`/trilha/${liberado.passo.id}`}
            className="flex min-h-[54px] w-full items-center justify-center rounded-2xl border-2 border-preto bg-brasa-500 text-base font-extrabold text-preto shadow-[0_4px_0_#000507]"
          >
            Assistir agora
          </Link>
          <BotaoSuave tamanho="g" className="w-full" onClick={onFechar}>
            Depois
          </BotaoSuave>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-8">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-preto text-brasa-400">
              <Icone nome="chave" className="h-8 w-8" />
            </span>
            <h2 className="text-2xl font-extrabold leading-tight">Liberar “{alvo?.passo.nome}” agora?</h2>
            {alvo?.data && (
              <p className="text-[15px] leading-snug text-ink2">
                {/* A data abreviada já termina em ponto ("20 de out.") */}
                A turma vê esse passo em {formatDate(alvo.data)}{' '}
                {temChave
                  ? `Você usa 1 das suas ${saldo.disponiveis} ${saldo.disponiveis === 1 ? 'chave' : 'chaves'} e assiste antes.`
                  : 'Você ainda não tem chave.'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
            <span className="text-sm font-extrabold">Como ganhar chaves</span>
            {GANHOS.map(([titulo, desc]) => (
              <div key={titulo} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brasa-300 font-extrabold text-or-t">
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
                <span>
                  {porChave} {porChave === 1 ? 'ponto' : 'pontos'} = 1 chave
                </span>
                <span>
                  {pontosNaVez} de {porChave}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-chip">
                <div className="h-full rounded-full bg-brasa-500" style={{ width: `${(pontosNaVez / porChave) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <BotaoAcao cor="preto" bloco sombra={false} disabled={!temChave || salvando} onClick={() => void liberar()}>
              {salvando ? 'Liberando…' : temChave ? 'Usar 1 chave' : `Faltam ${saldo.faltam} pontos`}
            </BotaoAcao>
            <button
              type="button"
              onClick={onFechar}
              className="flex min-h-11 items-center justify-center text-[15px] font-bold text-ink2"
            >
              Esperar a turma
            </button>
          </div>
        </div>
      )}
    </Folha>
  )
}
