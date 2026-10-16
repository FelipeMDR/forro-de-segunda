import { useEffect, useState } from 'react'
import { BotaoAcao, Cabecalho, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { RegrasTrilha } from '../../lib/types'
import { Campo, Dica } from './contexto'

const DEGRAUS = ['1º', '2º', '3º', '4º', '5º+']

type Form = {
  pontos: string
  presenca: string
  parceria: string
  degraus: string[]
  umNivel: string
  doisNiveis: string
  aumento: string
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
      const degraus = DEGRAUS.map((_, i) => String(r.preco_degraus[Math.min(i, r.preco_degraus.length - 1)]))
      setForm({
        pontos: String(r.pontos_por_chave),
        presenca: String(r.peso_presenca),
        parceria: String(r.peso_parceria),
        degraus,
        umNivel: String(r.preco_um_nivel),
        doisNiveis: String(r.preco_dois_niveis),
        aumento: String(r.preco_aumento_nivel),
      })
    })
  }, [api])

  if (!form) return null

  const regras = (): RegrasTrilha | null => {
    const pontos = inteiro(form.pontos, 1, 20)
    const presenca = inteiro(form.presenca, 0, 10)
    const parceria = inteiro(form.parceria, 0, 10)
    const degraus = form.degraus.map((d) => inteiro(d, 1, 100))
    const umNivel = inteiro(form.umNivel, 1, 100)
    const doisNiveis = inteiro(form.doisNiveis, 1, 100)
    const aumento = inteiro(form.aumento, 0, 20)
    if (pontos === null || presenca === null || parceria === null || umNivel === null || doisNiveis === null || aumento === null) return null
    if (degraus.some((d) => d === null)) return null
    return {
      pontos_por_chave: pontos,
      peso_presenca: presenca,
      peso_parceria: parceria,
      preco_degraus: degraus as number[],
      preco_um_nivel: umNivel,
      preco_dois_niveis: doisNiveis,
      preco_aumento_nivel: aumento,
    }
  }
  const r = regras()

  const salvar = async () => {
    if (!r) return toast('Confira os valores: pontos por chave de 1 a 20, pesos de 0 a 10, preços de 1 a 100', 'erro')
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
          <span className="text-sm font-extrabold">Preço no próprio nível (passos à frente da turma)</span>
          <div className="grid grid-cols-5 gap-2">
            {DEGRAUS.map((rotulo, i) => (
              <Campo key={rotulo} rotulo={rotulo}>
                {numero(
                  form.degraus[i],
                  (v) => setForm({ ...form, degraus: form.degraus.map((d, j) => (j === i ? v : d)) }),
                  100,
                  1,
                )}
              </Campo>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-[18px] border border-linha bg-sf p-4">
          <span className="text-sm font-extrabold">Preço nos níveis de cima</span>
          <div className="grid grid-cols-3 gap-2.5">
            <Campo rotulo="1º passo, um acima">{numero(form.umNivel, (v) => setForm({ ...form, umNivel: v }), 100, 1)}</Campo>
            <Campo rotulo="1º passo, dois acima">{numero(form.doisNiveis, (v) => setForm({ ...form, doisNiveis: v }), 100, 1)}</Campo>
            <Campo rotulo="+ por passo">{numero(form.aumento, (v) => setForm({ ...form, aumento: v }), 20)}</Campo>
          </div>
          {r && (
            <span className="text-xs text-ink2">
              Ex.: um aluno do Iniciante paga {r.preco_um_nivel} no 1º passo do Intermediário e{' '}
              {Math.min(100, r.preco_um_nivel + 14 * r.preco_aumento_nivel)} no 15º; {r.preco_dois_niveis} no 1º do Avançado e{' '}
              {Math.min(100, r.preco_dois_niveis + 11 * r.preco_aumento_nivel)} no 12º.
            </span>
          )}
        </section>

        <Dica>
          O aluno compra qualquer passo à frente, sem precisar dos anteriores. No próprio nível, o preço depende da distância
          da turma e para no último degrau; nos níveis de cima, sobe a cada aula daquele nível. Quando a turma avança, o preço cai.
        </Dica>
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </BotaoAcao>
      </div>
    </Tela>
  )
}
