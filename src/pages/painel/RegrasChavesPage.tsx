import { useEffect, useState } from 'react'
import { BotaoAcao, Cabecalho, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { RegrasTrilha } from '../../lib/types'
import { Campo, Dica } from './contexto'

type Form = {
  pontos: string
  presenca: string
  parceria: string
  porPasso: string
}

const inteiro = (v: string, de: number, ate: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= de && n <= ate ? n : null
}

/**
 * Regras das chaves da trilha de vídeos, todas editáveis pelo celular:
 * quanto vale cada coisa, quantos pontos fazem uma chave e quanto custa
 * cada passo. O padrão foi calibrado com o ranking do Espaço Livre 2026.2.
 */
export function RegrasChavesPage() {
  const api = useApi()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    void api.regrasTrilha().then((r) => {
      setForm({
        pontos: String(r.pontos_por_chave),
        presenca: String(r.peso_presenca),
        parceria: String(r.peso_parceria),
        porPasso: String(r.preco_por_passo),
      })
    })
  }, [api])

  if (!form) return null

  const regras = (): RegrasTrilha | null => {
    const pontos = inteiro(form.pontos, 1, 20)
    const presenca = inteiro(form.presenca, 0, 10)
    const parceria = inteiro(form.parceria, 0, 10)
    const porPasso = inteiro(form.porPasso, 1, 10)
    if (pontos === null || presenca === null || parceria === null || porPasso === null) return null
    return {
      pontos_por_chave: pontos,
      peso_presenca: presenca,
      peso_parceria: parceria,
      preco_por_passo: porPasso,
    }
  }
  const r = regras()

  const salvar = async () => {
    if (!r) return toast('Confira os valores: pontos por chave de 1 a 20, pesos de 0 a 10, chaves por passo de 1 a 10', 'erro')
    setSalvando(true)
    try {
      await api.salvarRegrasTrilha(r)
      toast('Regras salvas. Valem na hora para todo mundo.')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const numero = (valor: string, onChange: (v: string) => void, max: number, min = 0) => (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      className="input"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
    />
  )

  // Uma noite típica do iniciante: presença + ~3 pontos de parceria
  const noite = r ? r.peso_presenca + 3 * r.peso_parceria : null

  return (
    <Tela>
      <Cabecalho titulo="Regras das chaves" sobretitulo="Vídeo-aulas" fallback="/organizador/videoaulas" />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        <section className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Pontos (do desafio principal, o da Forródex)</span>
          <div className="grid grid-cols-3 gap-2.5">
            <Campo rotulo="Por presença">{numero(form.presenca, (v) => setForm({ ...form, presenca: v }), 10)}</Campo>
            <Campo rotulo="Por parceria">{numero(form.parceria, (v) => setForm({ ...form, parceria: v }), 10)}</Campo>
            <Campo rotulo="Por chave">{numero(form.pontos, (v) => setForm({ ...form, pontos: v }), 20, 1)}</Campo>
          </div>
          {r && noite !== null && (
            <span className="text-xs text-ink2">
              Uma noite típica (presença + 3 de parceria) rende {noite} pontos: cerca de 1 chave a cada{' '}
              {(r.pontos_por_chave / Math.max(noite, 1)).toFixed(1).replace('.', ',')} noites.
            </span>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Preço dos passos</span>
          <Campo rotulo="Chaves por passo de distância da turma">
            {numero(form.porPasso, (v) => setForm({ ...form, porPasso: v }), 10, 1)}
          </Campo>
          {r && (
            <span className="text-xs leading-snug text-ink2">
              O 1º passo à frente da turma custa {r.preco_por_passo}, o 2º {2 * r.preco_por_passo}, o 5º{' '}
              {5 * r.preco_por_passo}. Um aluno cuja turma está na 3ª aula do Iniciante (13 passos) paga{' '}
              {Math.min(100, 11 * r.preco_por_passo)} pelo 1º passo do Intermediário e{' '}
              {Math.min(100, 25 * r.preco_por_passo)} pelo último.
            </span>
          )}
        </section>

        <Dica>
          O aluno compra qualquer passo à frente, sem precisar dos anteriores. O preço é a distância da turma, contando a
          trilha em sequência (o resto do nível, depois os de cima), até no máximo 100. Quando a turma avança, o preço cai.
        </Dica>
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </BotaoAcao>
      </div>
    </Tela>
  )
}
