import { useEffect, useState } from 'react'
import type { PapelDanca } from '../lib/types'
import { BotaoAcao, Folha } from './ui'

const OPCOES: { papel: PapelDanca; emoji: string }[] = [
  { papel: 'Condutor(a)', emoji: '🕺' },
  { papel: 'Conduzido(a)', emoji: '💃' },
]

/**
 * Escolher a função na dança — só para quem está sem turma (quem tem
 * turma usa o papel da turma). Vale para a Caça aos professores e vira
 * um distintivo no perfil.
 */
export function FolhaFuncao({
  aberta,
  onFechar,
  atual,
  onSalvar,
}: {
  aberta: boolean
  onFechar: () => void
  atual: PapelDanca | null
  onSalvar: (p: PapelDanca) => Promise<void>
}) {
  const [escolha, setEscolha] = useState<PapelDanca | null>(atual)
  const [salvando, setSalvando] = useState(false)

  // Cada vez que abre, parte do que está salvo
  useEffect(() => {
    if (aberta) setEscolha(atual)
  }, [aberta, atual])

  const salvar = async () => {
    if (!escolha) return
    setSalvando(true)
    try {
      await onSalvar(escolha)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha aberta={aberta} onFechar={onFechar}>
      <div
        className="flex flex-col gap-5 px-5 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-2xl font-extrabold leading-tight">Qual a sua função na dança?</h2>
          <p className="text-[15px] leading-snug text-ink2">
            Vira um distintivo no seu perfil, igual ao de quem está numa turma.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Função na dança">
          {OPCOES.map((o) => {
            const ativo = escolha === o.papel
            return (
              <button
                key={o.papel}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setEscolha(o.papel)}
                className={`flex flex-col items-center gap-2 rounded-[18px] border-2 px-3 py-4 text-[15px] font-extrabold transition-transform active:scale-[.97] ${
                  ativo ? 'border-preto bg-brasa-500 text-preto' : 'border-linha bg-sf text-ink'
                }`}
              >
                <span className="text-[34px] leading-none">{o.emoji}</span>
                {o.papel}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2.5">
          <BotaoAcao
            cor="preto"
            bloco
            sombra={false}
            disabled={!escolha || salvando}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </BotaoAcao>
          <p className="text-center text-[13px] text-ink3">Dá pra trocar quando quiser no perfil.</p>
        </div>
      </div>
    </Folha>
  )
}
