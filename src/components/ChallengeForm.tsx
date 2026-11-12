import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { toISODate } from '../lib/dates'
import { mensagemForrodexOcupada } from '../lib/forrodex'
import { obterPosicao } from '../lib/geo'
import { alvosDaNoiteExtra, fimQueCobreAFesta, textosPadraoIngresso } from '../lib/ingresso'
import {
  DIAS_ABREV,
  MODALIDADES,
  RAIO_LOCAL_PADRAO_M,
  type Challenge,
  type ChallengeInput,
  type IngressoConfig,
  type Modalidade,
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
    modalidades: desafio?.modalidades ?? ['checkin'],
    ingresso: desafio?.ingresso ?? null,
  })
  // Fora do ChallengeInput: só vai ao banco se mudar, então editar um
  // desafio continua funcionando antes de a migração 035 rodar
  const [forrodex, setForrodex] = useState(desafio?.forrodex ?? false)
  const [conferindoForrodex, setConferindoForrodex] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [precisao, setPrecisao] = useState<number | null>(null)

  // Desafio de ingresso (clube): os textos dos distintivos acompanham o
  // título até o organizador mexer neles; a lista de desafios que ganham
  // a noite da festa vem pré-marcada até ele mexer nela.
  const ingresso = form.ingresso
  const [textosEditados, setTextosEditados] = useState(() => {
    const cfg = desafio?.ingresso
    if (!cfg) return false
    const padrao = textosPadraoIngresso(desafio.titulo)
    return (
      cfg.garantido.emoji !== padrao.garantido.emoji ||
      cfg.garantido.titulo !== padrao.garantido.titulo ||
      cfg.presenca.emoji !== padrao.presenca.emoji ||
      cfg.presenca.titulo !== padrao.presenca.titulo
    )
  })
  const [alvosEditados, setAlvosEditados] = useState(!!desafio?.ingresso)
  const [outrosDesafios, setOutrosDesafios] = useState<Challenge[]>([])
  const alvos = ingresso
    ? alvosDaNoiteExtra(outrosDesafios, ingresso.evento_data, desafio?.id)
    : []
  const idsAlvos = alvos.map((c) => c.id).join(',')

  useEffect(() => {
    if (!ingresso || outrosDesafios.length > 0) return
    let cancelado = false
    void api
      .listChallenges()
      .then((l) => {
        if (!cancelado) setOutrosDesafios(l)
      })
      .catch((e) => toast((e as Error).message, 'erro'))
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ingresso !== null])

  useEffect(() => {
    if (alvosEditados) return
    setForm((f) =>
      f.ingresso
        ? {
            ...f,
            ingresso: { ...f.ingresso, noite_extra_para: idsAlvos ? idsAlvos.split(',') : [] },
          }
        : f,
    )
  }, [idsAlvos, alvosEditados])

  const mudarIngresso = (patch: Partial<IngressoConfig>) =>
    setForm((f) => (f.ingresso ? { ...f, ingresso: { ...f.ingresso, ...patch } } : f))

  const mudarTitulo = (titulo: string) =>
    setForm((f) => ({
      ...f,
      titulo,
      ingresso:
        f.ingresso && !textosEditados
          ? { ...f.ingresso, ...textosPadraoIngresso(titulo) }
          : f.ingresso,
    }))

  // O que ligar o desafio de ingresso apaga do formulário (janelas, local,
  // disputas, entrada): guardado para voltar igual se a organização
  // desligar antes de salvar
  const antesDoIngresso = useRef<Pick<
    ChallengeInput,
    'janelas' | 'local' | 'modalidades' | 'entrada_restrita'
  > | null>(null)

  const alternarIngresso = (ligar: boolean) => {
    if (!ligar) {
      // Sem o que guardar (o desafio já era de ingresso): volta ao
      // desafio comum de partida
      const antes = antesDoIngresso.current ?? {
        janelas: [],
        local: null,
        modalidades: ['checkin'] as Modalidade[],
        entrada_restrita: false,
      }
      antesDoIngresso.current = null
      setForm((f) => ({ ...f, ...antes, ingresso: null }))
      return
    }
    if (!form.ingresso) {
      antesDoIngresso.current = {
        janelas: form.janelas,
        local: form.local,
        modalidades: form.modalidades,
        entrada_restrita: form.entrada_restrita,
      }
    }
    setForm((f) => {
      return {
        ...f,
        ingresso: desafio?.ingresso ?? {
          evento_data: f.data_inicio,
          evento_inicio: '18:00',
          evento_fim: '04:00',
          noite_extra_para: [],
          ...textosPadraoIngresso(f.titulo),
        },
        entrada_restrita: true,
        janelas: [],
        local: null,
        modalidades: ['checkin'],
      }
    })
  }

  const alternarAlvo = (id: string) => {
    setAlvosEditados(true)
    setForm((f) => {
      if (!f.ingresso) return f
      const lista = f.ingresso.noite_extra_para
      return {
        ...f,
        ingresso: {
          ...f.ingresso,
          noite_extra_para: lista.includes(id)
            ? lista.filter((x) => x !== id)
            : [...lista, id],
        },
      }
    })
  }

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

  /**
   * Liga/desliga uma disputa. Nunca deixa zerar: sem modalidade o
   * desafio não teria ranking nenhum, e o banco recusaria de qualquer
   * forma (constraint da migração 024) — melhor a última não desmarcar
   * do que salvar e receber um erro de banco.
   */
  const alternarModalidade = (id: Modalidade) => {
    setForm((f) => {
      const tem = f.modalidades.includes(id)
      if (tem && f.modalidades.length === 1) return f
      return {
        ...f,
        modalidades: tem
          ? f.modalidades.filter((m) => m !== id)
          : [...f.modalidades, id],
      }
    })
  }

  const removerJanela = (dia_semana: number) => {
    setForm((f) => ({
      ...f,
      janelas: f.janelas.filter((j) => j.dia_semana !== dia_semana),
    }))
  }

  // Ligar confere na hora se outro desafio já está com a Forródex: ela
  // não muda de desafio sozinha, a organização desliga lá primeiro
  const mudarForrodex = async (ligar: boolean) => {
    if (!ligar) {
      setForrodex(false)
      return
    }
    setConferindoForrodex(true)
    try {
      const outro = await api.desafioComForrodex(desafio?.id)
      if (outro) toast(mensagemForrodexOcupada(outro.titulo), 'erro')
      else setForrodex(true)
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setConferindoForrodex(false)
    }
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (form.data_fim < form.data_inicio) {
      toast('A data final precisa ser depois da inicial', 'erro')
      return
    }
    if (ingresso) {
      if (ingresso.evento_data < form.data_inicio || ingresso.evento_data > form.data_fim) {
        toast('A data da festa precisa estar dentro do período do desafio', 'erro')
        return
      }
      if (!ingresso.evento_inicio || !ingresso.evento_fim || ingresso.evento_inicio === ingresso.evento_fim) {
        toast('Informe o horário da festa (início e fim diferentes)', 'erro')
        return
      }
      if (!ingresso.garantido.titulo.trim() || !ingresso.presenca.titulo.trim()) {
        toast('Os dois distintivos precisam de título', 'erro')
        return
      }
    } else if (form.janelas.length === 0) {
      toast(
        'Configure pelo menos um dia com horário de check-in',
        'erro',
      )
      return
    }
    if (!ingresso && form.local && form.local.lat === 0 && form.local.lng === 0) {
      toast('Marque o local no botão "Marcar onde estou agora"', 'erro')
      return
    }
    if (!ingresso && form.local && form.local.raio_m < 50) {
      toast('O raio precisa ser de pelo menos 50 metros', 'erro')
      return
    }
    setSalvando(true)
    try {
      const entrada: ChallengeInput = ingresso
        ? {
            ...form,
            // Festa que vira a noite no último dia: o desafio vai até a
            // madrugada, senão à 00:00 ele já conta como encerrado
            data_fim: fimQueCobreAFesta(form.data_fim, ingresso),
            entrada_restrita: true,
            janelas: [],
            local: null,
            modalidades: ['checkin'],
            ingresso: {
              ...ingresso,
              // só os que ainda cobrem a data (se a lista chegou)
              noite_extra_para:
                outrosDesafios.length > 0
                  ? ingresso.noite_extra_para.filter((id) => idsAlvos.split(',').includes(id))
                  : ingresso.noite_extra_para,
            },
          }
        : form
      const id = await api.saveChallenge(entrada)
      if (forrodex !== (desafio?.forrodex ?? false)) {
        await api.definirForrodex(id, forrodex)
      }
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
      className="fixed inset-0 z-40 flex items-end justify-center bg-preto/60 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={submeter}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl border-t border-linha bg-papel p-5 sm:rounded-3xl sm:border"
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
            onChange={(e) => mudarTitulo(e.target.value)}
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
        <div className="flex flex-col gap-3">
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

        {/* Clube de ingresso: sem ranking, sem janelas. Quem está na lista
            ganha o distintivo, que evolui com o check-in na noite da festa. */}
        <div className="space-y-3 rounded-2xl bg-chip p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">
                🎟️ Desafio de ingresso (clube, sem ranking)
              </p>
              <p className="text-[11px] text-tinta-500">
                Quem está na lista de ingressos ganha um distintivo, que
                evolui quando a pessoa marca presença na noite da festa.
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brasa-500"
              aria-label="Desafio de ingresso"
              checked={ingresso !== null}
              onChange={(e) => alternarIngresso(e.target.checked)}
            />
          </div>

          {ingresso && (
            <>
              <div>
                <label className="label" htmlFor="evento-data">
                  Data da festa
                </label>
                <input
                  id="evento-data"
                  type="date"
                  className="input"
                  value={ingresso.evento_data}
                  min={form.data_inicio}
                  max={form.data_fim}
                  onChange={(e) => mudarIngresso({ evento_data: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="evento-inicio">
                    Começa às
                  </label>
                  <input
                    id="evento-inicio"
                    type="time"
                    className="input"
                    value={ingresso.evento_inicio}
                    onChange={(e) => mudarIngresso({ evento_inicio: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="evento-fim">
                    Termina às
                  </label>
                  <input
                    id="evento-fim"
                    type="time"
                    className="input"
                    value={ingresso.evento_fim}
                    onChange={(e) => mudarIngresso({ evento_fim: e.target.value })}
                    required
                  />
                </div>
              </div>
              {ingresso.evento_fim < ingresso.evento_inicio && (
                <p className="text-xs text-bl-t">
                  🌙 Vira a noite: termina às {ingresso.evento_fim} da madrugada
                  seguinte.
                  {fimQueCobreAFesta(form.data_fim, ingresso) !== form.data_fim &&
                    ' O fim do desafio passa para o dia seguinte ao salvar, para cobrir a madrugada.'}
                </p>
              )}

              {(['garantido', 'presenca'] as const).map((estado) => (
                <div key={estado} className="space-y-1">
                  <span className="label">
                    {estado === 'garantido'
                      ? 'Distintivo de quem está na lista'
                      : 'Distintivo de quem marcou presença'}
                  </span>
                  <div className="grid grid-cols-[64px_1fr] gap-2">
                    <input
                      className="input text-center"
                      aria-label="Emoji do distintivo"
                      maxLength={8}
                      value={ingresso[estado].emoji}
                      onChange={(e) => {
                        setTextosEditados(true)
                        mudarIngresso({
                          [estado]: { ...ingresso[estado], emoji: e.target.value },
                        })
                      }}
                    />
                    <input
                      className="input"
                      aria-label="Título do distintivo"
                      value={ingresso[estado].titulo}
                      onChange={(e) => {
                        setTextosEditados(true)
                        mudarIngresso({
                          [estado]: { ...ingresso[estado], titulo: e.target.value },
                        })
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="space-y-1">
                <span className="label">A noite da festa também vale em:</span>
                {alvos.length === 0 ? (
                  <p className="text-[11px] text-tinta-500">
                    Nenhum outro desafio cobre essa data.
                  </p>
                ) : (
                  alvos.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-3 py-1">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-brasa-500"
                        checked={ingresso.noite_extra_para.includes(c.id)}
                        onChange={() => alternarAlvo(c.id)}
                      />
                      <span className="text-sm font-bold">{c.titulo}</span>
                    </label>
                  ))
                )}
                <p className="text-[11px] text-tinta-500">
                  Check-in na festa, no horário acima, conta como presença nesses
                  desafios também.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Quais disputas rodam neste desafio. Duas ou mais convivem no
            mesmo período, com a mesma inscrição — o aluno compete em
            todas sem fazer nada a mais. */}
        {!ingresso && (
        <>
        <div className="space-y-2 rounded-2xl bg-chip p-3">
          <span className="label">Disputas deste desafio</span>
          {MODALIDADES.map((m) => {
            const marcada = form.modalidades.includes(m.id)
            const ultima = marcada && form.modalidades.length === 1
            return (
              <label
                key={m.id}
                className={`flex items-start gap-3 rounded-xl px-2 py-2 ${
                  ultima ? '' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brasa-500"
                  checked={marcada}
                  disabled={ultima}
                  onChange={() => alternarModalidade(m.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">
                    {m.emoji} {m.nome}
                  </span>
                  <span className="block text-[11px] text-tinta-500">
                    {m.regra}
                  </span>
                </span>
              </label>
            )
          })}
          <p className="text-[11px] text-tinta-500">
            Cada disputa vira uma aba de ranking na página do desafio.
            Ligar as parcerias num desafio que já começou não zera nada — as
            duplas já marcadas no período entram junto.
          </p>
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
                  className="flex items-center justify-between rounded-lg bg-chip px-3 py-2 text-sm"
                >
                  <span className="font-bold">{DIAS_ABREV[j.dia_semana]}</span>
                  <span className="text-tinta-600">
                    {j.hora_inicio}–{j.hora_fim}
                    {j.hora_fim < j.hora_inicio && (
                      <span className="ml-1 text-bl-t">🌙 +1 dia</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerJanela(j.dia_semana)}
                    className="text-tinta-500 hover:text-or-t"
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
        <div className="space-y-3 rounded-xl bg-chip p-3">
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
                    ? 'border-2 border-preto bg-brasa-500 text-preto'
                    : 'bg-chip text-tinta-600'
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
            <p className="text-xs text-bl-t">
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
        </>
        )}

        <div className="space-y-3 rounded-2xl bg-chip p-4">
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
              disabled={ingresso !== null}
              onChange={(e) =>
                setForm((f) => ({ ...f, entrada_restrita: e.target.checked }))
              }
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-chip p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">🃏 Forródex segue este desafio</p>
              <p className="text-[11px] text-tinta-500">
                A Forródex de todo mundo mostra só quem participa e as
                duplas do período. Os alunos não veem esse vínculo. Só um
                desafio por vez.
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-brasa-500"
              aria-label="Forródex segue este desafio"
              checked={forrodex}
              disabled={conferindoForrodex}
              onChange={(e) => void mudarForrodex(e.target.checked)}
            />
          </div>
        </div>

        {!ingresso && (
        <div className="space-y-3 rounded-2xl bg-chip p-4">
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
                <p className="text-xs text-or-t">
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
