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
    dias_semana: desafio?.dias_semana ?? [1],
    hora_inicio: desafio?.hora_inicio ?? '18:00',
    hora_fim: desafio?.hora_fim ?? '23:00',
  })
  const [salvando, setSalvando] = useState(false)

  const toggleDia = (dia: number) => {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(dia)
        ? f.dias_semana.filter((d) => d !== dia)
        : [...f.dias_semana, dia].sort(),
    }))
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (form.data_fim < form.data_inicio) {
      toast('A data final precisa ser depois da inicial', 'erro')
      return
    }
    if (form.dias_semana.length === 0) {
      toast('Escolha pelo menos um dia de check-in', 'erro')
      return
    }
    if (form.hora_fim === form.hora_inicio) {
      toast('O horário final precisa ser diferente do inicial', 'erro')
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
          vence. A janela pode virar a noite (ex.: 21:00–02:00). 🏆
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
        <div>
          <span className="label">Dias com check-in liberado</span>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_ABREV.map((abrev, dia) => (
              <button
                key={dia}
                type="button"
                onClick={() => toggleDia(dia)}
                aria-pressed={form.dias_semana.includes(dia)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  form.dias_semana.includes(dia)
                    ? 'bg-gradient-to-r from-brasa-400 to-brasa-600 text-white'
                    : 'bg-white/5 text-stone-400'
                }`}
              >
                {abrev}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="hinicio">
              Check-in abre às
            </label>
            <input
              id="hinicio"
              type="time"
              className="input"
              value={form.hora_inicio}
              onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
              required
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
              value={form.hora_fim}
              onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
              required
            />
          </div>
        </div>
        {form.hora_fim < form.hora_inicio && (
          <p className="text-xs text-sky-400">
            🌙 Janela vira a noite: abre às {form.hora_inicio} e fecha às{' '}
            {form.hora_fim} da madrugada seguinte. Um check-in feito de
            madrugada ainda conta como a mesma janela — só vale 1 ponto.
          </p>
        )}
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
