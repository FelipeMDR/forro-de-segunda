import { useEffect, useState } from 'react'
import {
  chaveDestaque,
  colecao,
  conquistado,
  escolherDestaques,
  MAX_DESTAQUES,
} from '../lib/destaques'
import type { Badge } from '../lib/types'
import { BotaoAcao, BotaoSuave, Folha } from './ui'

/**
 * Escolher os destaques do próprio perfil: toca para pôr ou tirar, e o
 * número mostra a ordem. Parte do que está à mostra (a escolha salva ou
 * a automática), para quem abre só querer trocar um.
 */
export function FolhaDestaques({
  aberta,
  onFechar,
  badges,
  salvos,
  onSalvar,
}: {
  aberta: boolean
  onFechar: () => void
  badges: Badge[]
  salvos: string[] | null | undefined
  /** null = volta aos destaques automáticos. */
  onSalvar: (chaves: string[] | null) => Promise<void>
}) {
  const [escolha, setEscolha] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (aberta) setEscolha(escolherDestaques(badges, salvos).map(chaveDestaque))
  }, [aberta, badges, salvos])

  const opcoes = colecao(badges).filter(conquistado)
  // Marcos de um lado, o resto (especiais, caça) do outro: são conquistas
  // de natureza diferente, e assim a lista fica fácil de varrer
  const grupos = [
    { titulo: 'Conquistas', itens: opcoes.filter((b) => !b.trilha || b.caca || b.congelado) },
    { titulo: 'Marcos', itens: opcoes.filter((b) => b.trilha && !b.caca && !b.congelado) },
  ].filter((g) => g.itens.length > 0)

  const alternar = (chave: string) =>
    setEscolha((atual) =>
      atual.includes(chave)
        ? atual.filter((k) => k !== chave)
        : atual.length < MAX_DESTAQUES
          ? [...atual, chave]
          : atual,
    )

  const salvar = async (chaves: string[] | null) => {
    setSalvando(true)
    try {
      await onSalvar(chaves)
    } finally {
      setSalvando(false)
    }
  }

  const cheio = escolha.length >= MAX_DESTAQUES

  return (
    <Folha aberta={aberta} onFechar={onFechar}>
      <div
        className="flex flex-col gap-4 px-5 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-2xl font-extrabold leading-tight">Seus destaques</h2>
          <p className="text-[15px] leading-snug text-ink2">
            Escolha até {MAX_DESTAQUES} para aparecer no seu perfil. Os outros ficam em "Todos os
            distintivos".
          </p>
        </div>

        {grupos.map((g) => (
          <div key={g.titulo} className="flex flex-col gap-2">
            <span className="px-1 text-[13px] font-extrabold uppercase tracking-[.08em] text-ink3">
              {g.titulo}
            </span>
            <ul className="flex flex-col overflow-hidden rounded-[18px] border border-linha bg-sf">
              {g.itens.map((b, i) => {
                const chave = chaveDestaque(b)
                const ordem = escolha.indexOf(chave)
                const marcado = ordem >= 0
                return (
                  <li key={b.id} className={i > 0 ? 'border-t border-linha' : ''}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcado}
                      aria-disabled={!marcado && cheio}
                      onClick={() => alternar(chave)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                        !marcado && cheio ? 'opacity-45' : ''
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-chip text-[22px] leading-none">
                        {b.emoji}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-extrabold">{b.titulo}</span>
                        <span className="truncate text-xs text-ink3">{b.descricao}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                          marcado
                            ? 'bg-brasa-500 text-preto'
                            : 'border-2 border-ink3/50'
                        }`}
                      >
                        {marcado ? ordem + 1 : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <div className="flex flex-col gap-2.5 pt-1">
          <BotaoAcao
            cor="preto"
            bloco
            sombra={false}
            disabled={salvando || escolha.length === 0}
            onClick={() => void salvar(escolha)}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </BotaoAcao>
          {salvos && (
            <BotaoSuave bloco disabled={salvando} onClick={() => void salvar(null)}>
              Escolher automaticamente
            </BotaoSuave>
          )}
          <p className="text-center text-[13px] text-ink3">
            Sem escolha, aparecem os mais raros. Cargo e turma ficam no topo do perfil.
          </p>
        </div>
      </div>
    </Folha>
  )
}
