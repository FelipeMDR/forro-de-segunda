import { useState } from 'react'
import { Cabecalho, Confirmar } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatRelative } from '../../lib/dates'
import type { Report } from '../../lib/types'
import { Dica, usePainel } from './contexto'

/** Fotos denunciadas: manter (a denúncia some) ou remover a publicação. */
export function DenunciasPage() {
  const { api } = useAuth()
  const toast = useToast()
  const { reports, recarregar } = usePainel()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState<Report | null>(null)

  const resolver = async (r: Report, remover: boolean) => {
    setOcupado(r.id)
    try {
      await api.resolveReport(r.id, remover)
      await recarregar.reports()
      setRemovendo(null)
      toast(remover ? 'Foto removida do feed' : 'Foto mantida')
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="anima-tela">
      <Cabecalho titulo="Denúncias" sobretitulo="Painel" fallback="/organizador" />
      <div className="flex flex-col gap-3 px-4 pt-3.5">
        {reports.length === 0 && <Dica>Nenhuma denúncia pendente. Tudo em paz por aqui.</Dica>}
        {reports.map((r) => (
          <div key={r.id} className="flex flex-col overflow-hidden rounded-[20px] border border-linha bg-sf">
            <div className="flex gap-3 p-3">
              {r.foto_url ? (
                <img src={r.foto_url} alt="Foto denunciada" className="aspect-[4/5] w-24 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <div className="listras aspect-[4/5] w-24 shrink-0 rounded-[10px] bg-marinho-600" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-base font-extrabold">{r.autor_nome ?? 'Alguém'}</span>
                <span className="text-[13px] text-ink3">{formatRelative(r.criado_em)}</span>
                <span className="mt-1 text-sm leading-snug">{r.motivo ?? 'Sem motivo informado'}</span>
                <span className="text-xs font-bold text-or-t">
                  denunciada por {r.denunciante_nome ?? 'alguém'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 px-3 pb-3">
              <button
                type="button"
                disabled={ocupado === r.id}
                onClick={() => void resolver(r, false)}
                className="h-[46px] flex-1 rounded-[14px] border-[1.5px] border-linha bg-sf text-[15px] font-bold text-ink disabled:opacity-50"
              >
                Manter
              </button>
              <button
                type="button"
                disabled={ocupado === r.id}
                onClick={() => setRemovendo(r)}
                className="h-[46px] flex-1 rounded-[14px] border-2 border-preto bg-brasa-500 text-[15px] font-extrabold text-preto disabled:opacity-50"
              >
                Remover foto
              </button>
            </div>
          </div>
        ))}
      </div>
      <Confirmar
        aberto={removendo !== null}
        titulo={`Remover a foto de ${removendo?.autor_nome ?? 'alguém'}?`}
        texto="A publicação sai do feed para todo mundo."
        ok="Remover"
        ocupado={ocupado !== null}
        onOk={() => removendo && void resolver(removendo, true)}
        onVoltar={() => setRemovendo(null)}
      />
    </div>
  )
}
