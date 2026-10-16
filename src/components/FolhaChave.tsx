import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/dates'
import { chaves } from '../lib/textosTrilha'
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
  onLiberar: (passoId: string, custo: number) => Promise<void>
}) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [liberado, setLiberado] = useState<PassoComSituacao | null>(null)

  useEffect(() => {
    if (alvo) setLiberado(null)
  }, [alvo])

  const custo = alvo?.custo ?? 1
  const temChave = saldo.disponiveis >= custo
  // Pontos que ainda faltam para pagar este passo
  const livres = saldo.pontos - saldo.usadas * saldo.pontosPorChave
  const faltamPontos = Math.max(0, custo * saldo.pontosPorChave - livres)

  const liberar = async () => {
    if (!alvo) return
    setSalvando(true)
    try {
      await onLiberar(alvo.passo.id, custo)
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
            {alvo && !alvo.data && (
              <p className="text-[15px] leading-snug text-ink2">
                É um passo do nível seguinte. Custa {chaves(custo)}
                {temChave ? `, das suas ${saldo.disponiveis}.` : `, e você tem ${saldo.disponiveis}.`}
              </p>
            )}
            {alvo?.data && (
              <p className="text-[15px] leading-snug text-ink2">
                {/* A data abreviada já termina em ponto ("20 de out.") */}
                A turma vê esse passo em {formatDate(alvo.data)}{' '}
                {temChave
                  ? `Custa ${chaves(custo)}, das suas ${saldo.disponiveis}, e você assiste antes.`
                  : `Custa ${chaves(custo)}, e você tem ${saldo.disponiveis}.`}
              </p>
            )}
          </div>

          <ComoGanharChaves saldo={saldo} />

          <div className="flex flex-col gap-2">
            <BotaoAcao cor="preto" bloco sombra={false} disabled={!temChave || salvando} onClick={() => void liberar()}>
              {salvando ? 'Liberando…' : temChave ? `Usar ${chaves(custo)}` : `Faltam ${faltamPontos} pontos`}
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

/** Como se ganha ponto e quanto falta para a próxima chave (folhas da trilha). */
export function ComoGanharChaves({ saldo }: { saldo: SaldoChaves }) {
  const porChave = saldo.pontosPorChave
  const pontosNaVez = porChave - saldo.faltam
  return (
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
  )
}

/** Toque no contador de chaves: o saldo e as regras, sem gastar nada. */
export function FolhaRegrasChaves({
  aberta,
  saldo,
  onFechar,
}: {
  aberta: boolean
  saldo: SaldoChaves
  onFechar: () => void
}) {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
  return (
    <Folha aberta={aberta} onFechar={onFechar}>
      <div className="flex flex-col gap-4 px-5 pb-8">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-preto text-brasa-400">
            <Icone nome="chave" className="h-8 w-8" />
          </span>
          <h2 className="text-2xl font-extrabold leading-tight">
            Você tem {plural(saldo.disponiveis, 'chave', 'chaves')}
          </h2>
          <p className="text-[15px] leading-snug text-ink2">
            O primeiro passo que a sua turma ainda não viu custa 1 chave. Cada passo depois dele custa o dobro: 2, 4, 8…
          </p>
        </div>

        <ComoGanharChaves saldo={saldo} />

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [saldo.pontos, saldo.pontos === 1 ? 'ponto no semestre' : 'pontos no semestre'],
            [saldo.ganhas, saldo.ganhas === 1 ? 'chave ganha' : 'chaves ganhas'],
            [saldo.usadas, saldo.usadas === 1 ? 'chave usada' : 'chaves usadas'],
          ].map(([n, rotulo]) => (
            <div key={String(rotulo)} className="flex flex-col gap-0.5 rounded-2xl bg-chip px-2 py-3">
              <span className="text-xl font-extrabold leading-none">{n}</span>
              <span className="text-[11px] leading-tight text-ink2">{rotulo}</span>
            </div>
          ))}
        </div>

        <ul className="flex flex-col gap-2 rounded-2xl bg-chip px-4 py-3 text-[13px] leading-snug text-ink2">
          <li>
            A compra é sempre <b className="text-ink">na ordem</b>: para chegar a um passo, compre os de antes. Quando a turma avança, o preço cai.
          </li>
          <li>Depois do último passo do seu nível, dá para seguir comprando os do nível seguinte, ainda pelo dobro.</li>
          <li>Os pontos contam desde o início do semestre e zeram quando ele termina.</li>
          <li>O passo liberado continua aberto para você, mesmo depois.</li>
        </ul>

        <BotaoSuave tamanho="g" onClick={onFechar}>
          Entendi
        </BotaoSuave>
      </div>
    </Folha>
  )
}
