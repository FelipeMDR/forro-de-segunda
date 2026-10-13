import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Avatar } from './Avatar'
import { Icone } from './Icone'
import { BotaoAcao, BotaoSuave, CampoBusca, RotuloSecao } from './ui'
import { combinaBusca } from '../lib/busca'
import type { ParceiroPossivel } from '../lib/types'

/**
 * "Com quem você dançou hoje?" — tela cheia, logo depois da foto.
 *
 * A lista é só de quem também fez check-in na noite: é isso que
 * transforma "achar 10 pessoas entre 300" em "tocar em 5 nomes que já
 * estão na tela", e de quebra impede marcar quem nem apareceu.
 *
 * As marcações são escolhidas aqui e enviadas juntas no fim, e não a
 * cada toque: assim dá para errar e desfazer sem a outra pessoa receber
 * e perder um aviso. Quem já estava marcado começa marcado; desmarcar
 * e enviar retira a marcação. A dupla só se confirma quando a outra
 * pessoa marca de volta.
 */
export function TelaDuplas({
  data,
  etiqueta,
  onSair,
}: {
  /** Dia da noite (ISO). */
  data: string
  /** "Presença registrada · 21:52" — o comprovante, em cima do título. */
  etiqueta: string | null
  onSair: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const [pessoas, setPessoas] = useState<ParceiroPossivel[] | null>(null)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const ps = await api.parceirosPossiveis(data)
      setPessoas(ps)
      setEscolhidos(new Set(ps.filter((p) => p.marcado).map((p) => p.user_id)))
    } catch (e) {
      // Sem a migração 016 a tabela não existe — a tela fica vazia
      console.error('[duplas] falha ao carregar', e)
      setPessoas([])
    }
  }, [api, data])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const ordenadas = useMemo(
    () => [...(pessoas ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [pessoas],
  )
  const encontradas = useMemo(
    () => ordenadas.filter((p) => combinaBusca(busca, [p.nome, p.turma ?? ''])),
    [ordenadas, busca],
  )
  const marcadas = ordenadas.filter((p) => escolhidos.has(p.user_id))

  const novas = ordenadas.filter((p) => escolhidos.has(p.user_id) && !p.marcado)
  const retiradas = ordenadas.filter((p) => !escolhidos.has(p.user_id) && p.marcado)
  const mudancas = novas.length + retiradas.length

  const alternar = (id: string) =>
    setEscolhidos((atual) => {
      const n = new Set(atual)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const enviar = async () => {
    if (mudancas === 0) {
      onSair()
      return
    }
    setEnviando(true)
    try {
      for (const p of novas) await api.marcarDupla(p.user_id, data)
      for (const p of retiradas) await api.desmarcarDupla(p.user_id, data)
      toast(
        novas.length > 0
          ? `${novas.length === 1 ? 'Marcação enviada' : `${novas.length} marcações enviadas`}. A dupla vale quando a outra pessoa confirmar.`
          : 'Marcação retirada.',
      )
      onSair()
    } catch (e) {
      toast((e as Error).message, 'erro')
      // Parte pode ter ido: recarrega para a tela mostrar a verdade
      await carregar()
    } finally {
      setEnviando(false)
    }
  }

  const rotuloEnviar = enviando
    ? 'Enviando…'
    : novas.length > 0
      ? `Enviar ${novas.length} ${novas.length === 1 ? 'marcação' : 'marcações'}`
      : retiradas.length > 0
        ? 'Salvar'
        : 'Enviar marcações'

  return (
    <div
      className="anima-tela fixed inset-0 z-40 mx-auto flex max-w-md flex-col bg-fundo"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      <div className="flex flex-col gap-1.5 px-5 pb-3 pt-1">
        {etiqueta && (
          <span className="self-start rounded-full border-[1.5px] border-preto bg-verde-500 px-2.5 py-1 text-[13px] font-extrabold text-preto">
            {etiqueta}
          </span>
        )}
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-.03em]">
          Com quem você dançou hoje?
        </h1>
        <span className="text-sm leading-snug text-ink3">
          {pessoas === null
            ? 'Carregando quem está no salão…'
            : `${pessoas.length + 1} ${pessoas.length === 0 ? 'pessoa fez' : 'pessoas fizeram'} check-in hoje. A dupla só vale quando a outra pessoa confirma.`}
        </span>
      </div>

      {pessoas && pessoas.length > 0 && (
        <div className="px-4 pb-2.5">
          <CampoBusca
            placeholder="Buscar entre os presentes"
            aria-label="Buscar entre os presentes"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      )}

      {marcadas.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pb-2.5">
          <RotuloSecao className="px-0 tracking-[.06em]">
            Marcados · {marcadas.length}
          </RotuloSecao>
          <div className="flex flex-wrap gap-1.5">
            {marcadas.map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => alternar(p.user_id)}
                aria-label={`Desmarcar ${p.nome}`}
                className="flex h-9 items-center gap-1.5 rounded-full border-2 border-preto bg-brasa-300 pl-1 pr-1.5 text-sm font-extrabold text-preto"
              >
                <Avatar nome={p.nome} url={p.avatar_url} tamanho={26} borda={false} />
                {p.nome.split(/\s+/)[0]}
                <Icone nome="fechar" tamanho={14} traco={3} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sem-barra min-h-0 flex-1 overflow-y-auto border-t border-linha px-3">
        {pessoas !== null && pessoas.length === 0 && (
          <p className="px-2 py-8 text-center text-[15px] leading-snug text-ink3">
            Ninguém mais fez check-in nesta noite ainda. Volte aqui depois —
            dá para marcar até o fim da noite.
          </p>
        )}
        {encontradas.map((p) => {
          const on = escolhidos.has(p.user_id)
          return (
            <button
              key={p.user_id}
              type="button"
              onClick={() => alternar(p.user_id)}
              aria-pressed={on}
              className="flex min-h-14 w-full items-center gap-3 border-b border-linha bg-transparent p-2 text-left text-ink"
            >
              <Avatar nome={p.nome} url={p.avatar_url} tamanho={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-bold">{p.nome}</span>
                <span className="truncate text-[13px] text-ink3">
                  {p.confirmada ? 'Dupla confirmada' : p.turma}
                </span>
              </span>
              <span
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 text-preto ${
                  on ? 'border-preto bg-brasa-500' : 'border-linha bg-transparent'
                }`}
              >
                {on && <Icone nome="check" tamanho={16} traco={3.4} />}
              </span>
            </button>
          )
        })}
        {busca.trim() !== '' && encontradas.length === 0 && (
          <p className="px-2 py-6 text-center text-[15px] text-ink3">
            Ninguém com esse nome fez check-in hoje.
          </p>
        )}
      </div>

      <div
        className="flex gap-2.5 border-t border-linha bg-fundo px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <BotaoSuave tamanho="g" className="flex-1" onClick={onSair} disabled={enviando}>
          Agora não
        </BotaoSuave>
        <BotaoAcao
          tamanho="g"
          className="flex-[1.6]"
          disabled={enviando || mudancas === 0}
          onClick={() => void enviar()}
        >
          {rotuloEnviar}
        </BotaoAcao>
      </div>
    </div>
  )
}
