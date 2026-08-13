import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Avatar } from './Avatar'
import { combinaBusca } from '../lib/busca'
import type { ParceiroPossivel } from '../lib/types'

/**
 * Quantos rostos aparecem antes de "ver todos" — três linhas de quatro.
 *
 * Numa noite cheia de espaço livre são 50 pessoas: a grade inteira
 * passaria de 900px e empurraria a câmera, o aviso e o botão de publicar
 * para fora da tela. Quem dança com 5 pessoas não precisa das outras 45
 * na cara; quem precisa, busca pelo nome.
 */
const LIMITE_ROSTOS = 12

/**
 * Grade de rostos de quem também fez check-in na noite, para marcar
 * com quem se dançou.
 *
 * A lista é só de quem esteve lá — é isso que transforma "achar 10
 * pessoas entre 300" em "tocar em 5 rostos que já estão na tela". E de
 * quebra impede marcar quem nem apareceu.
 *
 * Marcação de mão única já aparece; quando os dois se marcam, a dupla
 * se confirma sozinha e passa a contar para distintivo.
 */
export function MarcarDuplas({ data }: { data: string }) {
  const { api } = useAuth()
  const toast = useToast()
  const [pessoas, setPessoas] = useState<ParceiroPossivel[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [verTodos, setVerTodos] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setPessoas(await api.parceirosPossiveis(data))
    } catch (e) {
      // Sem a migração 016 a tabela não existe — some sem quebrar a tela
      console.error('[duplas] falha ao carregar', e)
      setPessoas([])
    }
  }, [api, data])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /**
   * Marcados na frente: são a resposta que a pessoa acabou de dar, e no
   * meio de 50 rostos eles sumiriam — inclusive para desmarcar.
   */
  const ordenadas = useMemo(
    () =>
      [...(pessoas ?? [])].sort(
        (a, b) =>
          Number(b.marcado) - Number(a.marcado) || a.nome.localeCompare(b.nome),
      ),
    [pessoas],
  )

  const encontradas = useMemo(
    () => ordenadas.filter((p) => combinaBusca(busca, [p.nome])),
    [ordenadas, busca],
  )

  if (!pessoas || pessoas.length === 0) return null

  // Buscar já é pedir para ver o que casa — não faz sentido cortar aí
  const mostrarTodas = verTodos || busca.trim() !== ''
  const visiveis = mostrarTodas
    ? encontradas
    : encontradas.slice(0, LIMITE_ROSTOS)
  const escondidas = encontradas.length - visiveis.length

  const alternar = async (p: ParceiroPossivel) => {
    setOcupado(p.user_id)
    try {
      if (p.marcado) await api.desmarcarDupla(p.user_id, data)
      else await api.marcarDupla(p.user_id, data)
      await carregar()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  const marcados = pessoas.filter((p) => p.marcado).length

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-bold">Com quem você dançou hoje? 💃</h2>
        <p className="mt-0.5 text-xs text-tinta-500">
          Quem também deu check-in hoje. Toque nos rostos — é opcional, e
          quando a pessoa marcar você de volta a dupla se confirma.
        </p>
      </div>

      {/* A busca só aparece quando a grade não cabe inteira: numa noite
          de 8 pessoas ela seria um campo a mais sem ter o que filtrar. */}
      {pessoas.length > LIMITE_ROSTOS && (
        <input
          type="search"
          className="input"
          placeholder={`Buscar entre ${pessoas.length} pessoas…`}
          aria-label="Buscar quem deu check-in hoje"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {visiveis.map((p) => (
          <button
            key={p.user_id}
            onClick={() => void alternar(p)}
            disabled={ocupado === p.user_id}
            aria-pressed={p.marcado}
            className={`flex flex-col items-center gap-1 rounded-xl p-2 transition disabled:opacity-50 ${
              p.marcado ? 'bg-verde-500/15' : 'hover:bg-preto/5'
            }`}
          >
            <span className="relative">
              <Avatar nome={p.nome} url={p.avatar_url} tamanho={44} />
              {p.marcado && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-verde-700 text-[10px] text-white ring-2 ring-papel">
                  ✓
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] font-bold text-tinta-700">
              {p.nome.split(/\s+/)[0]}
            </span>
          </button>
        ))}
      </div>

      {busca.trim() !== '' && encontradas.length === 0 && (
        <p className="text-xs text-tinta-500">
          Ninguém com esse nome deu check-in hoje. Só dá para marcar quem
          esteve lá.
        </p>
      )}

      {escondidas > 0 && (
        <button
          type="button"
          className="w-full text-center text-xs font-bold text-tinta-600 underline"
          onClick={() => setVerTodos(true)}
        >
          Ver todos ({encontradas.length})
        </button>
      )}

      {marcados > 0 && (
        <p className="text-xs text-tinta-500">
          {marcados} {marcados === 1 ? 'pessoa marcada' : 'pessoas marcadas'}.
          Só conta para os distintivos quando a outra pessoa confirmar.
        </p>
      )}
    </div>
  )
}
