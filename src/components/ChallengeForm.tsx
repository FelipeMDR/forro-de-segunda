import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toISODate } from '../lib/dates'
import { DIAS_ABREV, type Challenge, type ChallengeInput } from '../lib/types'

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
  })
  const [salvando, setSalvando] = useState(false)

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
        className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl border-t border-white/10 bg-noite-900 p-5 sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        <h2 className="text-lg font-extrabold">
          {desafio ? 'Editar desafio' : 'Novo desafio'}
        </h2>
        <p className="text-xs text-stone-500">
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
            <p className="text-xs text-stone-500">
              Nenhum dia configurado ainda — monte abaixo.
            </p>
          ) : (
            <div className="space-y-1.5">
              {form.janelas.map((j) => (
                <div
                  key={j.dia_semana}
                  className="flex items-center justify-between rounded-lg bg-noite-950 px-3 py-2 text-sm"
                >
                  <span className="font-bold">{DIAS_ABREV[j.dia_semana]}</span>
                  <span className="text-stone-400">
                    {j.hora_inicio}–{j.hora_fim}
                    {j.hora_fim < j.hora_inicio && (
                      <span className="ml-1 text-sky-400">🌙 +1 dia</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerJanela(j.dia_semana)}
                    className="text-stone-500 hover:text-red-400"
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
        <div className="space-y-3 rounded-xl bg-noite-950 p-3">
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
                    ? 'bg-gradient-to-r from-brasa-400 to-brasa-600 text-white'
                    : 'bg-white/5 text-stone-400'
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
            <p className="text-xs text-sky-400">
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
          <p className="text-[11px] text-stone-500">
            Repita quantas vezes precisar — se um dia já tiver horário, o
            novo substitui.
          </p>
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
