import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BotaoAcao, BotaoSuave, Cabecalho, Confirmar, LinhaInterruptor, Tela } from '../../components/ui'
import { useApi } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { ehDrive, idDoVideo, linkDoVideo, miniaturaDoVideo, NIVEIS, NOME_NIVEL } from '../../lib/trilha'
import type { NivelTrilha, PassoTrilhaInput } from '../../lib/types'
import { Avatar } from '../../components/Avatar'
import { Icone } from '../../components/Icone'
import { Campo, Dica, EscolherPessoa, usePainel } from './contexto'

const VAZIO: PassoTrilhaInput = {
  nivel: 'iniciante', ordem: 1, nome: '', video_frente: null, video_condutor: null,
  video_conduzida: null, dica: null, professores_ids: [], pode_chave: true,
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
  const [escolhendo, setEscolhendo] = useState(false)
  const { perfis } = usePainel()

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
        video_frente: p.video_frente ? linkDoVideo(p.video_frente) : '',
        video_condutor: p.video_condutor ? linkDoVideo(p.video_condutor) : '',
        video_conduzida: p.video_conduzida ? linkDoVideo(p.video_conduzida) : '',
      })
    })
  }, [api, id, novo, busca, navigate, toast])

  if (!form) return null

  const ids = {
    video_frente: links.video_frente.trim() ? idDoVideo(links.video_frente) : null,
    video_condutor: links.video_condutor.trim() ? idDoVideo(links.video_condutor) : null,
    video_conduzida: links.video_conduzida.trim() ? idDoVideo(links.video_conduzida) : null,
  }
  const linkRuim = (c: CampoVideo) => links[c].trim() !== '' && ids[c] === null

  const salvar = async () => {
    if (!form.nome.trim()) return toast('Dê um nome ao passo', 'erro')
    if ((['video_frente', 'video_condutor', 'video_conduzida'] as const).some(linkRuim)) {
      return toast('Algum link não é de um vídeo do YouTube ou do Google Drive', 'erro')
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
        placeholder="Colar link do YouTube ou do Drive"
        value={links[c]}
        onChange={(e) => setLinks({ ...links, [c]: e.target.value })}
        aria-invalid={linkRuim(c)}
      />
      {linkRuim(c) && (
        <span className="text-xs font-bold text-or-t">Esse link não é de um vídeo do YouTube nem de um arquivo do Drive.</span>
      )}
      {ids[c] && (
        <>
        <span className="mt-1 flex items-center gap-2.5">
          <img src={miniaturaDoVideo(ids[c]!)} alt="" className="h-[50px] w-[88px] rounded-lg bg-chip object-cover" />
          <span className="text-xs font-bold text-ink2">{ehDrive(ids[c]!) ? 'Google Drive' : 'YouTube'}</span>
        </span>
        {ehDrive(ids[c]!) && (
          <span className="text-xs leading-snug text-or-t">
            No Drive, compartilhe como “Qualquer pessoa com o link pode ver” e desative o download para leitores.
          </span>
        )}
        </>
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
        <Campo rotulo="Quem ensinou" dica="Foto e nome aparecem para o aluno junto do vídeo.">
          <div className="flex flex-wrap gap-2">
            {form.professores_ids.map((id) => {
              const p = perfis.find((x) => x.id === id)
              return (
                <span
                  key={id}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-linha bg-sf py-1 pr-1 pl-1"
                >
                  <Avatar nome={p?.nome ?? '?'} url={p?.avatar_url ?? null} tamanho={32} borda={false} />
                  <span className="text-sm font-extrabold">{p?.nome ?? 'Pessoa removida'}</span>
                  <button
                    type="button"
                    aria-label={`Tirar ${p?.nome ?? 'pessoa'}`}
                    onClick={() => setForm({ ...form, professores_ids: form.professores_ids.filter((x) => x !== id) })}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink3"
                  >
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                </span>
              )
            })}
            <button
              type="button"
              onClick={() => setEscolhendo(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-linha px-4 text-sm font-extrabold text-ink2"
            >
              <Icone nome="mais" className="h-4 w-4" />
              {form.professores_ids.length ? 'Outro professor' : 'Escolher professor'}
            </button>
          </div>
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
          Suba o vídeo no canal do projeto no YouTube como <b>não listado</b> e cole o link. Vídeo do Google Drive também funciona, por enquanto. O app guarda só o link.
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
      <EscolherPessoa
        aberta={escolhendo}
        titulo="Quem ensinou este passo?"
        excluir={form.professores_ids}
        onEscolher={(p) => {
          setForm({ ...form, professores_ids: [...form.professores_ids, p.id] })
          setEscolhendo(false)
        }}
        onFechar={() => setEscolhendo(false)}
      />
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
