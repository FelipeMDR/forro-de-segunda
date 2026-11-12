import type { IngressoPerfil } from '../lib/types'
import { BotaoAcao, Folha } from './ui'

/**
 * Comemoração ao abrir o app: o ingresso foi confirmado, ou a presença
 * na festa evoluiu o distintivo. Aparece uma vez por estado.
 */
export function FolhaIngresso({
  ingresso,
  onVerPerfil,
  onFechar,
}: {
  ingresso: IngressoPerfil | null
  onVerPerfil: () => void
  onFechar: () => void
}) {
  const presenca = ingresso?.estado === 'presenca'
  return (
    <Folha aberta={ingresso !== null} onFechar={onFechar}>
      {ingresso && (
        <div
          className="flex flex-col gap-5 px-5 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[56px] leading-none">{ingresso.emoji}</span>
            <h2 className="text-2xl font-extrabold leading-tight">
              {presenca
                ? `Você marcou presença no ${ingresso.titulo}! 🎉`
                : `Seu ingresso pro ${ingresso.titulo} está confirmado! 🎟️`}
            </h2>
            <p className="text-[15px] leading-snug text-ink2">
              {presenca
                ? `Seu distintivo evoluiu: ${ingresso.titulo_distintivo}.`
                : 'O distintivo já está no seu perfil.'}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <BotaoAcao cor="preto" bloco sombra={false} onClick={onVerPerfil}>
              Ver no perfil
            </BotaoAcao>
            <BotaoAcao cor="claro" bloco sombra={false} onClick={onFechar}>
              Fechar
            </BotaoAcao>
          </div>
        </div>
      )}
    </Folha>
  )
}
