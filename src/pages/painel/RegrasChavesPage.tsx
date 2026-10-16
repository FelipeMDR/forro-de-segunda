import { useEffect, useState } from 'react'
import { BotaoAcao, Cabecalho, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { chaves } from '../../lib/textosTrilha'
import { Campo, Dica } from './contexto'

const GANHOS = [
  ['Presença', '1 ponto por noite que valeu no desafio'],
  ['Parceria', 'cada carta da Forródex vale pelo nível (1 a 4)'],
] as const

/**
 * Regras das chaves da trilha de vídeos. Só os pontos por chave são
 * editáveis: o custo em dobro de cada passo à frente é fixo, porque é ele
 * que segura quem quer queimar a largada.
 */
export function RegrasChavesPage() {
  const api = useApi()
  const toast = useToast()
  const [pontos, setPontos] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    void api.regrasTrilha().then((r) => setPontos(String(r.pontos_por_chave)))
  }, [api])

  if (pontos === null) return null
  const porChave = Number(pontos)
  const valido = Number.isInteger(porChave) && porChave >= 1 && porChave <= 20

  const salvar = async () => {
    if (!valido) return toast('Pontos por chave: de 1 a 20', 'erro')
    setSalvando(true)
    try {
      await api.salvarRegrasTrilha({ pontos_por_chave: porChave })
      toast('Regras salvas. Valem na hora para todo mundo.')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Tela>
      <Cabecalho titulo="Regras das chaves" sobretitulo="Vídeo-aulas" fallback="/organizador/videoaulas" />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        <div className="flex flex-col gap-2.5 rounded-[18px] border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Pontos do desafio principal (o da Forródex)</span>
          {GANHOS.map(([titulo, desc]) => (
            <span key={titulo} className="text-sm text-ink2">
              <b className="text-ink">{titulo}:</b> {desc}
            </span>
          ))}
        </div>

        <Campo rotulo="Pontos por chave">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            className="input"
            value={pontos}
            onChange={(e) => setPontos(e.target.value)}
          />
        </Campo>

        <div className="flex flex-col gap-2 rounded-[18px] border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Quanto custa adiantar</span>
          {[1, 2, 3, 4].map((n) => {
            const custo = 2 ** (n - 1)
            return (
              <div key={n} className="flex justify-between text-sm">
                <span className="text-ink2">{n}º passo à frente da turma</span>
                <b>
                  {chaves(custo)}
                  {valido && <span className="font-normal text-ink3"> · {custo * porChave} pontos</span>}
                </b>
              </div>
            )
          })}
        </div>

        <Dica>
          O custo dobra a cada passo à frente da turma e não muda por nível. A compra é sempre na ordem, e depois do último passo do nível o aluno segue para o nível seguinte.
        </Dica>
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </BotaoAcao>
      </div>
    </Tela>
  )
}
