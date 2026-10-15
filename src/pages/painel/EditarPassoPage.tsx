import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BotaoAcao, BotaoSuave, Cabecalho, Confirmar, LinhaInterruptor, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { idDoYoutube, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilhaInput } from '../../lib/types'
import { Campo, Dica } from './contexto'

const VAZIO: PassoTrilhaInput = {
  nivel: 'iniciante', ordem: 1, nome: '', video_frente: null, video_condutor: null,
  video_conduzida: null, dica: null, pode_chave: true,
}

type CampoVideo = 'video_frente' | 'video_condutor' | 'video_conduzida'

export function EditarPassoPage() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const { id } = useParams()
  const [busca] = useSearchParams()
  const novo = id === 'novo'
  const [form, setForm] = useState<PassoTrilhaInput | null>(null)
  const [links, setLinks] = useState<Record<CampoVideo, string>>({ video_frente: '', video_condutor: '', video_conduzida: '' })
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  useEffect(() => {
    void api.listPassosTrilha().then((todos) => {
      if (novo) {
        const nivel = (busca.get('nivel') as NivelTrilha | null) ?? 'iniciante'
        const ultima = Math.max(0, ...todos.filter((p) => p.nivel === nivel).map((p) => p.ordem))
        setForm({ ...VAZIO, nivel, ordem: ultima + 1 })
        return
      }
      const p = todos.find((x) => x.id === id)
      if (!p) {
        toast('Esse passo não existe mais', 'erro')
        navigate('/organizador/videoaulas', { replace: true })
        return
      }
      setForm(p)
      setLinks({
        video_frente: p.video_frente ? `https://youtu.be/${p.video_frente}` : '',
        video_condutor: p.video_condutor ? `https://youtu.be/${p.video_condutor}` : '',
        video_conduzida: p.video_conduzida ? `https://youtu.be/${p.video_conduzida}` : '',
      })
    })
  }, [api, id, novo, busca, navigate, toast])

  if (!form) return null

  const ids = {
    video_frente: links.video_frente.trim() ? idDoYoutube(links.video_frente) : null,
    video_condutor: links.video_condutor.trim() ? idDoYoutube(links.video_condutor) : null,
    video_conduzida: links.video_conduzida.trim() ? idDoYoutube(links.video_conduzida) : null,
  }
  const linkRuim = (c: CampoVideo) => links[c].trim() !== '' && ids[c] === null

  const salvar = async () => {
    if (!form.nome.trim()) return toast('Dê um nome ao passo', 'erro')
    if ((['video_frente', 'video_condutor', 'video_conduzida'] as const).some(linkRuim)) {
      return toast('Algum link não é de um vídeo do YouTube', 'erro')
    }
    setSalvando(true)
    try {
      await api.salvarPassoTrilha({ ...form, ...ids })
      toast('Passo salvo')
      navigate('/organizador/videoaulas')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const campoVideo = (c: CampoVideo, rotulo: string) => (
    <Campo rotulo={rotulo}>
      <input
        type="url"
        inputMode="url"
        className="input"
        placeholder="Colar link do YouTube"
        value={links[c]}
        onChange={(e) => setLinks({ ...links, [c]: e.target.value })}
        aria-invalid={linkRuim(c)}
      />
      {linkRuim(c) && <span className="text-xs font-bold text-or-t">Esse link não é de um vídeo do YouTube.</span>}
      {ids[c] && (
        <img
          src={`https://i.ytimg.com/vi/${ids[c]}/mqdefault.jpg`}
          alt=""
          className="mt-1 h-[50px] w-[88px] rounded-lg object-cover"
        />
      )}
    </Campo>
  )

  return (
    <Tela>
      <Cabecalho titulo={novo ? 'Novo passo' : 'Editar passo'} fallback="/organizador/videoaulas" />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        <Campo rotulo="Nome do passo">
          <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo rotulo="Nível">
            <select
              className="input"
              value={form.nivel}
              onChange={(e) => setForm({ ...form, nivel: e.target.value as NivelTrilha })}
            >
              {NIVEIS.map((n) => (
                <option key={n} value={n}>
                  {NOME_NIVEL[n]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Aula nº na trilha">
            <input
              type="number"
              min={1}
              className="input"
              value={form.ordem}
              onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 1 })}
            />
          </Campo>
        </div>
        <Dica>A data de cada turma vem do cronograma dela (Agenda). Níveis acima veem este passo como revisão.</Dica>
        <Dica>
          Suba o vídeo no canal do projeto como <b>não listado</b> e cole o link. O app guarda só o link.
        </Dica>
        {campoVideo('video_frente', 'Vídeo de frente')}
        {campoVideo('video_condutor', 'Visão do condutor (opcional)')}
        {campoVideo('video_conduzida', 'Visão da conduzida (opcional)')}
        <Campo rotulo="Dica do professor">
          <textarea
            rows={3}
            className="input"
            value={form.dica ?? ''}
            onChange={(e) => setForm({ ...form, dica: e.target.value })}
          />
        </Campo>
        <LinhaInterruptor
          titulo="Pode liberar com chave"
          descricao="Desligue para passos que só fazem sentido depois da aula"
          ligado={form.pode_chave}
          onChange={(v) => setForm({ ...form, pode_chave: v })}
        />
        <BotaoAcao cor="preto" bloco disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar passo'}
        </BotaoAcao>
        {!novo && (
          <BotaoSuave tamanho="g" onClick={() => setRemovendo(true)}>
            Remover da trilha
          </BotaoSuave>
        )}
      </div>
      <Confirmar
        aberto={removendo}
        titulo="Remover este passo?"
        texto="Quem gastou chave nele recebe a chave de volta."
        ok="Remover"
        onVoltar={() => setRemovendo(false)}
        onOk={() => {
          void api.removerPassoTrilha(form.id!).then(() => navigate('/organizador/videoaulas'))
        }}
      />
    </Tela>
  )
}
