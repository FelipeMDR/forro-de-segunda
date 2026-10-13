/**
 * Falha ao carregar dados. Mostra a mensagem real do erro — sem isso,
 * um problema de rede/configuração vira um spinner infinito e ninguém
 * consegue diagnosticar de longe.
 */
export function ErrorState({
  titulo = 'Não consegui carregar',
  erro,
  onRetry,
}: {
  titulo?: string
  erro: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[22px] border border-linha bg-sf px-6 py-8 text-center">
      <h2 className="text-lg font-extrabold">{titulo}</h2>
      <p className="max-w-xs break-words text-[13px] text-ink3">{erro}</p>
      {onRetry && (
        <button className="btn-primary" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
      <p className="text-xs text-ink3">
        Se continuar, mande esta mensagem para quem cuida do app.
      </p>
    </div>
  )
}
