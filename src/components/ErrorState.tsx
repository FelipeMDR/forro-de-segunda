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
    <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="text-4xl">😕</span>
      <h2 className="text-base font-extrabold">{titulo}</h2>
      <p className="max-w-xs break-words text-xs text-tinta-600">{erro}</p>
      {onRetry && (
        <button className="btn-primary" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
      <p className="text-[10px] text-tinta-400">
        Se continuar, mande esta mensagem para quem cuida do app.
      </p>
    </div>
  )
}
