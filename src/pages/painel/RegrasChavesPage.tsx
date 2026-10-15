import { useEffect, useState } from 'react'
import { BotaoAcao, Cabecalho, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { RegrasTrilha } from '../../lib/types'
import { Campo, Dica } from './contexto'

const GANHOS = [
  ['Presença', 'cada noite com check-in válido'],
  ['Parceria', 'noite com dupla confirmada (1 por noite)'],
  ['Nova parceria', 'primeira dança com alguém no Forródex'],
] as const

/**
 * Regras das chaves da trilha de vídeos. "Só o próximo passo" não é
 * editável: é o que impede o aluno de queimar a largada.
 */
export function RegrasChavesPage() {
  const api = useApi()
  const toast = useToast()
  const [form, setForm] = useState<{ pontos: string; dias: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    void api.regrasTrilha().then((r) =>
      setForm({ pontos: String(r.pontos_por_chave), dias: String(r.antecedencia_dias) }),
    )
  }, [api])

  if (!form) return null

  const salvar = async () => {
    const regras: RegrasTrilha = {
      pontos_por_chave: Number(form.pontos),
      antecedencia_dias: Number(form.dias),
    }
    if (!Number.isInteger(regras.pontos_por_chave) || regras.pontos_por_chave < 1 || regras.pontos_por_chave > 20) {
      return toast('Pontos por chave: de 1 a 20', 'erro')
    }
    if (!Number.isInteger(regras.antecedencia_dias) || regras.antecedencia_dias < 0 || regras.antecedencia_dias > 30) {
      return toast('Antecedência: de 0 a 30 dias', 'erro')
    }
    setSalvando(true)
    try {
      await api.salvarRegrasTrilha(regras)
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
          <span className="text-sm font-extrabold">Cada um vale 1 ponto</span>
          {GANHOS.map(([titulo, desc]) => (
            <span key={titulo} className="text-sm text-ink2">
              <b className="text-ink">{titulo}:</b> {desc}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo rotulo="Pontos por chave">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              className="input"
              value={form.pontos}
              onChange={(e) => setForm({ ...form, pontos: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Dias antes da turma">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              className="input"
              value={form.dias}
              onChange={(e) => setForm({ ...form, dias: e.target.value })}
            />
          </Campo>
        </div>
        <Dica>
          A chave sempre abre só o <b>próximo passo</b> da trilha do aluno. Os dias dizem quanto antes da aula da turma ela pode ser usada (0 = só no dia).
        </Dica>
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </BotaoAcao>
      </div>
    </Tela>
  )
}
