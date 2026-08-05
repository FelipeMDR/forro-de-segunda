import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toISODate } from '../lib/dates'
import { obterPosicao } from '../lib/geo'
import {
  DIAS_ABREV,
  RAIO_LOCAL_PADRAO_M,
  type Challenge,
  type ChallengeInput,
} from '../lib/types'

export function ChallengeForm({
  desafio,
  onClose,
  onSaved,
}: {
  desafio?: Challenge
  onClose: () => void
  onSaved: () => void
}) {
  const { api } = useAuth()
  const toast = useToast()
  const hoje = toISODate(new Date())
  const [form, setForm] = useState<ChallengeInput>({
    id: desafio?.id,
    titulo: desafio?.titulo ?? '',
    descricao: desafio?.descricao ?? '',
    data_inicio: desafio?.data_inicio ?? hoje,
    data_fim: desafio?.data_fim ?? hoje,
    janelas: desafio?.janelas ?? [],
    local: desafio?.local ?? null,
    entrada_restrita: desafio?.entrada_restrita ?? false,
  })
  const [salvando, setSalvando] = useState(false)
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [precisao, setPrecisao] = useState<number | null>(null)

  // O organizador marca o ponto estando no lugar — bem mais simples do
  // que pedir coordenada, e é o que ele já vai fazer numa aula.
  const usarLocalAtual = async () => {
    setBuscandoLocal(true)
    try {
      const p = await obterPosicao()
      setPrecisao(p.precisao)
      setForm((f) => ({
        ...f,
        local: {
          nome: f.local?.nome ?? '',
          lat: p.lat,
          lng: p.lng,
          raio_m: f.local?.raio_m ?? RAIO_LOCAL_PADRAO_M,
          desde: f.local?.desde ?? null, // quem define é o banco
        },
      }))
      toast('Local marcado onde você está agora 📍')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBuscandoLocal(false)
    }
  }

  // Controle auxiliar pra montar/editar as janelas: escolhe os dias,
  // define um horário e aplica — cada espaço tem seu próprio horário,
  // então dias diferentes podem receber horários diferentes.
  const [diasEscolhidos, setDiasEscolhidos] = useState<number[]>([])
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFim, setHoraFim] = useState('23:00')

  const toggleDiaEscolhido = (dia: number) => {
    setDiasEscolhidos((dias) =>
      dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort(),
    )
  }

  const aplicarHorario = () => {
    if (diasEscolhidos.length === 0) {
      toast('Marque pelo menos um dia para aplicar esse horário', 'erro')
      return
    }
    if (horaFim === horaInicio) {
      toast('O horário final precisa ser diferente do inicial', 'erro')
      return
    }
    setForm((f) => ({
      ...f,
      janelas: [
        ...f.janelas.filter((j) => !diasEscolhidos.includes(j.dia_semana)),
        ...diasEscolhidos.map((dia_semana) => ({
          dia_semana,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
        })),
      ].sort((a, b) => a.dia_semana - b.dia_semana),
    }))
    setDiasEscolhidos([])
  }

  const removerJanela = (dia_semana: number) => {
    setForm((f) => ({
      ...f,
      janelas: f.janelas.filter((j) => j.dia_semana !== dia_semana),
    }))
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (form.data_fim < form.data_inicio) {
      toast('A data final precisa ser depois da inicial', 'erro')
      return
    }
    if (form.janelas.length === 0) {
      toast(
        'Configure pelo menos um dia com horário de check-in',
        'erro',
      )
      return
    }
    if (form.local && form.local.lat === 0 && form.local.lng === 0) {
      toast('Marque o local no botão "Marcar onde estou agora"', 'erro')
      return
    }
    if (form.local && form.local.raio_m < 50) {
      toast('O raio precisa ser de pelo menos 50 metros', 'erro')
      return
    }
    setSalvando(true)
    try {
      await api.saveChallenge(form)
      toast(desafio ? 'Desafio atualizado!' : 'Desafio criado! 🏆')
      onSaved()
      onClose()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={submeter}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl border-t border-preto/10 bg-papel p-5 sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <h2 className="text-lg font-extrabold">
          {desafio ? 'Editar desafio' : 'Novo desafio'}
        </h2>
        <p className="text-xs text-tinta-500">
          Desafio é competição: cada janela com check-in vale 1 ponto (várias
          fotos na mesma janela contam uma vez) — quem somar mais pontos
          vence. Cada dia da semana pode ter seu próprio horário, útil
          quando o espaço muda de horário de um dia pro outro. 🏆
        </p>
        <div>
          <label className="label" htmlFor="titulo">
            Título
          </label>
          <input
            id="titulo"
            className="input"
            placeholder='Ex.: "Copa de agosto"'
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="descricao">
            Descrição
          </label>
          <textarea
            id="descricao"
            className="input resize-none"
            rows={3}
            placeholder="Qual é a regra? Tem prêmio simbólico?"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="inicio">
              Início
            </label>
            <input
              id="inicio"
              type="date"
              className="input"
              value={form.data_inicio}
              onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="fim">
              Fim
            </label>
            <input
              id="fim"
              type="date"
              className="input"
              value={form.data_fim}
              onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Horário configurado por dia */}
        <div>
          <span className="label">Horário de check-in por dia</span>
          {form.janelas.length === 0 ? (
            <p className="text-xs text-tinta-500">
              Nenhum dia configurado ainda — monte abaixo.
            </p>
          ) : (
            <div className="space-y-1.5">
              {form.janelas.map((j) => (
                <div
                  key={j.dia_semana}
                  className="flex items-center justify-between rounded-lg bg-fundo px-3 py-2 text-sm"
                >
                  <span className="font-bold">{DIAS_ABREV[j.dia_semana]}</span>
                  <span className="text-tinta-600">
                    {j.hora_inicio}–{j.hora_fim}
                    {j.hora_fim < j.hora_inicio && (
                      <span className="ml-1 text-azul-600">🌙 +1 dia</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerJanela(j.dia_semana)}
                    className="text-tinta-500 hover:text-red-600"
                    aria-label={`Remover ${DIAS_ABREV[j.dia_semana]}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Montagem: escolhe dias + horário e aplica */}
        <div className="space-y-3 rounded-xl bg-fundo p-3">
          <span className="label">
            Marque os dias e defina o horário pra eles
          </span>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_ABREV.map((abrev, dia) => (
              <button
                key={dia}
                type="button"
                onClick={() => toggleDiaEscolhido(dia)}
                aria-pressed={diasEscolhidos.includes(dia)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  diasEscolhidos.includes(dia)
                    ? 'bg-gradient-to-r from-brasa-600 to-brasa-700 text-white'
                    : 'bg-preto/5 text-tinta-600'
                }`}
              >
                {abrev}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="hinicio">
                Abre às
              </label>
              <input
                id="hinicio"
                type="time"
                className="input"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="hfim">
                Fecha às
              </label>
              <input
                id="hfim"
                type="time"
                className="input"
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
              />
            </div>
          </div>
          {horaFim < horaInicio && (
            <p className="text-xs text-azul-600">
              🌙 Vira a noite: abre às {horaInicio} e fecha às {horaFim} da
              madrugada seguinte. Mais de um check-in na mesma janela ainda
              vale só 1 ponto.
            </p>
          )}
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={aplicarHorario}
          >
            Aplicar aos dias marcados
          </button>
          <p className="text-[11px] text-tinta-500">
            Repita quantas vezes precisar — se um dia já tiver horário, o
            novo substitui.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-fundo p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">🎟️ Entrada só pela organização</p>
              <p className="text-[11px] text-tinta-500">
                Evento restrito: o aluno não entra sozinho. Depois de
                salvar, adicione os participantes na página do desafio —
                dá para importar a lista de ingressos por CSV.
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brasa-500"
              aria-label="Entrada só pela organização"
              checked={form.entrada_restrita}
              onChange={(e) =>
                setForm((f) => ({ ...f, entrada_restrita: e.target.checked }))
              }
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-fundo p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">📍 Exigir estar no local</p>
              <p className="text-[11px] text-tinta-500">
                Só conta ponto quem tirar a foto ali. Bom para amarrar o
                desafio ao salão da aula ou à casa da festa.
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brasa-500"
              aria-label="Exigir estar no local"
              checked={form.local !== null}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  local: e.target.checked
                    ? {
                        nome: '',
                        lat: 0,
                        lng: 0,
                        raio_m: RAIO_LOCAL_PADRAO_M,
                        desde: null, // o banco preenche (migração 009)
                      }
                    : null,
                }))
              }
            />
          </div>

          {form.local && (
            <>
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={buscandoLocal}
                onClick={() => void usarLocalAtual()}
              >
                {buscandoLocal
                  ? 'Buscando GPS…'
                  : '📍 Marcar onde estou agora'}
              </button>

              {form.local.lat === 0 && form.local.lng === 0 ? (
                <p className="text-xs text-amber-700">
                  Vá até o local e toque no botão acima. Sem isso o desafio
                  não pode ser salvo com a trava ligada.
                </p>
              ) : (
                <p className="text-[11px] text-tinta-500">
                  Ponto marcado: {form.local.lat.toFixed(5)},{' '}
                  {form.local.lng.toFixed(5)}
                  {precisao !== null && ` · GPS com ${Math.round(precisao)} m de precisão`}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="local-nome">
                    Nome do lugar
                  </label>
                  <input
                    id="local-nome"
                    className="input"
                    placeholder="Espaço Livre"
                    value={form.local.nome ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        local: f.local && { ...f.local, nome: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="local-raio">
                    Raio (metros)
                  </label>
                  <input
                    id="local-raio"
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    className="input"
                    value={form.local.raio_m}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        local: f.local && {
                          ...f.local,
                          raio_m: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <p className="text-[11px] text-tinta-500">
                Raio muito curto reprova quem está no salão (o GPS erra
                dezenas de metros dentro de prédio). 200 m costuma ser um
                bom começo.
              </p>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
