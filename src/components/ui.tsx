import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Icone, type NomeIcone } from './Icone'

/*
 * Peças do redesign. A regra visual vem do logo: o que é AÇÃO (check-in,
 * publicar, confirmar) leva contorno preto de 2px, sombra dura e cor da
 * marca com texto preto; o resto é superfície calma (cartão do tema,
 * borda fina) para não competir.
 */

export type CorAcao = 'brasa' | 'verde' | 'azul' | 'preto' | 'claro' | 'pessego' | 'verde-claro' | 'laranja'

const FUNDO_ACAO: Record<CorAcao, string> = {
  brasa: 'bg-brasa-500 text-preto',
  verde: 'bg-verde-500 text-preto',
  azul: 'bg-azul-500 text-preto',
  preto: 'bg-preto text-branco',
  claro: 'bg-branco text-preto',
  pessego: 'bg-brasa-300 text-preto',
  'verde-claro': 'bg-verde-300 text-preto',
  laranja: 'bg-brasa-400 text-preto',
}

const ALTURA = {
  g: 'min-h-[58px] rounded-[18px] px-5 text-[17px]',
  m: 'min-h-12 rounded-2xl px-4 text-base',
  p: 'min-h-11 rounded-[14px] px-3.5 text-[15px]',
} as const

/** Botão de ação: contorno preto, cor da marca, sombra dura opcional. */
export function BotaoAcao({
  cor = 'brasa',
  tamanho = 'g',
  sombra = true,
  bloco = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  cor?: CorAcao
  tamanho?: keyof typeof ALTURA
  sombra?: boolean
  /** Ocupa a largura toda. */
  bloco?: boolean
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex select-none items-center justify-center gap-2 border-2 border-preto font-extrabold transition-transform active:scale-[.97] disabled:pointer-events-none disabled:opacity-45 ${
        ALTURA[tamanho]
      } ${FUNDO_ACAO[cor]} ${sombra ? 'shadow-[0_4px_0_#000507]' : ''} ${
        bloco ? 'w-full' : ''
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Botão secundário: superfície do tema, borda fina. */
export function BotaoSuave({
  tamanho = 'm',
  bloco = false,
  perigo = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tamanho?: keyof typeof ALTURA
  bloco?: boolean
  /** Texto laranja: sair, remover, excluir. */
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex select-none items-center justify-center gap-2 border-[1.5px] border-linha bg-sf font-bold transition-transform active:scale-[.97] disabled:pointer-events-none disabled:opacity-45 ${
        ALTURA[tamanho]
      } ${perigo ? 'font-extrabold text-or-t' : 'text-ink'} ${
        bloco ? 'w-full' : ''
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Botão redondo só com ícone (voltar, fechar, buscar). */
export function BotaoIcone({
  icone,
  rotulo,
  variante = 'nu',
  tamanhoIcone = 24,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icone: NomeIcone
  rotulo: string
  /** nu = sem fundo; chip = fundo leve; cartao = superfície com borda */
  variante?: 'nu' | 'chip' | 'cartao'
  tamanhoIcone?: number
}) {
  const fundo =
    variante === 'chip'
      ? 'bg-chip'
      : variante === 'cartao'
        ? 'border border-linha bg-sf'
        : 'bg-transparent'
  return (
    <button
      type="button"
      aria-label={rotulo}
      {...props}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-transform active:scale-90 ${fundo} ${className}`}
    >
      <Icone nome={icone} tamanho={tamanhoIcone} />
    </button>
  )
}

/** Volta para a tela anterior; sem histórico (link aberto direto), vai para `fallback`. */
export function useVoltar(fallback = '/') {
  const navigate = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

/**
 * Cabeçalho de tela interna: voltar + título. Com `sobretitulo`, vira o
 * cabeçalho do painel (rótulo azul pequeno em cima, título menor).
 */
export function Cabecalho({
  titulo,
  sobretitulo,
  voltar,
  fallback = '/',
  acao,
}: {
  titulo: ReactNode
  sobretitulo?: string
  /** Substitui o "voltar" padrão (histórico do navegador). */
  voltar?: () => void
  fallback?: string
  /** Botão à direita. */
  acao?: ReactNode
}) {
  const voltarPadrao = useVoltar(fallback)
  return (
    <div className="flex items-center gap-1 px-3 pb-2 pt-1">
      <BotaoIcone icone="voltar" rotulo="Voltar" onClick={voltar ?? voltarPadrao} />
      {sobretitulo ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-extrabold uppercase tracking-[.06em] text-bl-t">
            {sobretitulo}
          </span>
          <h1 className="m-0 truncate text-[26px] font-extrabold leading-[1.05] tracking-[-.03em]">
            {titulo}
          </h1>
        </div>
      ) : (
        <h1 className="m-0 min-w-0 flex-1 truncate text-[30px] font-extrabold tracking-[-.03em]">
          {titulo}
        </h1>
      )}
      {acao}
    </div>
  )
}

/** Título grande das telas de topo (Feed, Avisos, Desafios). */
export function TituloRaiz({
  children,
  acao,
}: {
  children: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1.5">
      <h1 className="m-0 text-[34px] font-extrabold tracking-[-.03em]">
        {children}
      </h1>
      {acao}
    </div>
  )
}

/** Controle segmentado: pílula (filtros) ou bloco (abas largas). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
  forma = 'bloco',
  className = '',
}: {
  opcoes: readonly { valor: T; rotulo: ReactNode }[]
  valor: T
  onChange: (v: T) => void
  forma?: 'pilula' | 'bloco'
  className?: string
}) {
  const pilula = forma === 'pilula'
  return (
    <div
      role="tablist"
      className={`flex bg-chip p-1 ${pilula ? 'rounded-full' : 'rounded-2xl'} ${className}`}
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.valor)}
            className={`whitespace-nowrap font-extrabold transition-colors ${
              pilula
                ? 'h-9 rounded-full px-3.5 text-sm'
                : 'h-11 flex-1 rounded-xl px-2 text-[15px]'
            } ${ativo ? 'bg-ink text-fundo' : 'bg-transparent text-ink2'}`}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}

/** Chip de escolha (turmas, dias, modalidades). */
export function ChipEscolha({
  ativo,
  children,
  cor = 'brasa',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ativo: boolean
  cor?: 'brasa' | 'preto'
}) {
  const ligado =
    cor === 'preto'
      ? 'border-ink bg-ink text-fundo'
      : 'border-preto bg-brasa-500 text-preto'
  return (
    <button
      type="button"
      aria-pressed={ativo}
      {...props}
      className={`h-[42px] shrink-0 rounded-full border-[1.5px] px-3.5 text-sm font-extrabold transition-colors ${
        ativo ? ligado : 'border-linha bg-transparent text-ink'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Etiqueta pequena (cargo, "Participando", "novo"). */
export function Etiqueta({
  children,
  cor = 'chip',
  className = '',
}: {
  children: ReactNode
  cor?: 'chip' | 'pessego' | 'verde' | 'brasa' | 'azul' | 'preto'
  className?: string
}) {
  const estilos = {
    chip: 'bg-chip text-ink',
    pessego: 'border-[1.5px] border-preto bg-brasa-300 text-preto',
    verde: 'border-[1.5px] border-preto bg-verde-500 text-preto',
    brasa: 'border-[1.5px] border-preto bg-brasa-500 text-preto',
    azul: 'border-[1.5px] border-preto bg-azul-500 text-preto',
    preto: 'bg-preto text-branco',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-extrabold leading-none ${estilos[cor]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Bolinha laranja de contagem (não lidas, denúncias). */
export function Contador({ n, className = '' }: { n: number; className?: string }) {
  if (n <= 0) return null
  return (
    <span
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] border-preto bg-brasa-500 px-1.5 text-xs font-extrabold text-preto ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

/** Campo de busca com a lupa. */
export const CampoBusca = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function CampoBusca({ className = '', ...props }, ref) {
  return (
    <label
      className={`flex h-[52px] items-center gap-2.5 rounded-2xl border-2 border-linha bg-sf px-3.5 focus-within:border-brasa-500 ${className}`}
    >
      <Icone nome="buscar" tamanho={20} className="shrink-0 text-ink3" />
      <input
        ref={ref}
        type="search"
        {...props}
        className="min-w-0 flex-1 border-none bg-transparent text-[17px] font-semibold text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  )
})

/** Interruptor liga/desliga. */
export function Interruptor({ ligado }: { ligado: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${
        ligado ? 'bg-brasa-500' : 'bg-sf2'
      }`}
    >
      <span
        className="absolute top-[3px] h-[26px] w-[26px] rounded-full bg-branco shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-[left]"
        style={{ left: ligado ? 23 : 3 }}
      />
    </span>
  )
}

/** Linha com interruptor, para opções de liga/desliga. */
export function LinhaInterruptor({
  titulo,
  descricao,
  ligado,
  onChange,
  disabled,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  ligado: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-2xl border border-linha bg-sf px-4 py-2.5 text-left text-ink disabled:opacity-50"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-bold">{titulo}</span>
        {descricao && <span className="text-[13px] text-ink3">{descricao}</span>}
      </span>
      <Interruptor ligado={ligado} />
    </button>
  )
}

/** Atalho do painel/perfil: ícone colorido, título, descrição e seta. */
export function CartaoAtalho({
  icone,
  cor,
  titulo,
  descricao,
  contador = 0,
  onClick,
}: {
  icone: NomeIcone
  /** Fundo do quadrado do ícone (cor da marca). */
  cor: string
  titulo: string
  descricao?: string
  contador?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-[20px] border border-linha bg-sf p-3.5 text-left text-ink transition-transform active:scale-[.99]"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-preto text-preto"
        style={{ background: cor }}
      >
        <Icone nome={icone} tamanho={21} traco={2.3} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-extrabold">{titulo}</span>
        {descricao && (
          <span className="text-[13px] leading-snug text-ink3">{descricao}</span>
        )}
      </span>
      <Contador n={contador} />
      <Icone nome="avancar" tamanho={18} className="shrink-0 text-ink3" />
    </button>
  )
}

/** Linha de lista com avatar (busca, salão, painel). */
export function LinhaPessoa({
  avatar,
  nome,
  sub,
  direita,
  seta = true,
  onClick,
}: {
  avatar: ReactNode
  nome: ReactNode
  sub?: ReactNode
  direita?: ReactNode
  seta?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 border-b border-linha bg-transparent p-2 text-left text-ink"
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-extrabold">{nome}</span>
        {sub && <span className="truncate text-[13px] text-ink3">{sub}</span>}
      </span>
      {direita}
      {seta && <Icone nome="avancar" tamanho={18} className="shrink-0 text-ink3" />}
    </button>
  )
}

/** Fundo escurecido das folhas e diálogos. */
function Veu({ onClick, z = 70 }: { onClick: () => void; z?: number }) {
  return (
    <div
      onClick={onClick}
      className="anima-aparece fixed inset-0 bg-preto/55"
      style={{ zIndex: z }}
    />
  )
}

/** Trava a rolagem da página enquanto uma folha está aberta. */
function useTravaRolagem(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [ativo])
}

/** Folha que sobe de baixo (comentários, escolher pessoa…). */
export function Folha({
  aberta,
  onFechar,
  titulo,
  alta = false,
  rodape,
  children,
}: {
  aberta: boolean
  onFechar: () => void
  titulo?: ReactNode
  /** Ocupa ~3/4 da tela, para listas longas. */
  alta?: boolean
  rodape?: ReactNode
  children: ReactNode
}) {
  useTravaRolagem(aberta)
  useEffect(() => {
    if (!aberta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta, onFechar])
  if (!aberta) return null
  return createPortal(
    <>
      <Veu onClick={onFechar} />
      <div
        role="dialog"
        aria-modal="true"
        className={`anima-folha fixed inset-x-0 bottom-0 z-[71] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] bg-sf text-ink ${
          alta ? 'h-[76dvh]' : 'max-h-[82dvh]'
        }`}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-[5px] w-10 rounded-full bg-linha" />
        </div>
        {titulo && (
          <div className="shrink-0 px-5 pb-2 pt-1.5 text-lg font-extrabold">
            {titulo}
          </div>
        )}
        <div className="sem-barra min-h-0 flex-1 overflow-y-auto">{children}</div>
        {rodape && (
          <div
            className="shrink-0 border-t border-linha px-4 pt-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            {rodape}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

/** Menu de ações em cartão flutuante (estilo folha de ações do iOS). */
export function MenuAcoes({
  aberto,
  onFechar,
  acoes,
}: {
  aberto: boolean
  onFechar: () => void
  acoes: { rotulo: string; onClick: () => void; perigo?: boolean }[]
}) {
  useTravaRolagem(aberto)
  if (!aberto) return null
  return createPortal(
    <>
      <Veu onClick={onFechar} />
      <div
        className="anima-folha fixed inset-x-3 z-[71] mx-auto flex max-w-[calc(28rem-24px)] flex-col gap-2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex flex-col overflow-hidden rounded-[22px] bg-sf">
          {acoes.map((a, i) => (
            <button
              key={a.rotulo}
              type="button"
              onClick={a.onClick}
              className={`h-14 text-[17px] ${
                i < acoes.length - 1 ? 'border-b border-linha' : ''
              } ${a.perigo ? 'font-extrabold text-or-t' : 'font-bold text-ink'}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="h-14 rounded-[22px] bg-sf text-[17px] font-extrabold text-ink"
        >
          Cancelar
        </button>
      </div>
    </>,
    document.body,
  )
}

/** Diálogo de confirmação para ação séria (excluir, desligar, cancelar pedido). */
export function Confirmar({
  aberto,
  titulo,
  texto,
  ok,
  voltar = 'Voltar',
  ocupado = false,
  alerta = true,
  onOk,
  onVoltar,
}: {
  aberto: boolean
  titulo: ReactNode
  texto?: ReactNode
  ok: string
  voltar?: string
  ocupado?: boolean
  /** Mostra o triângulo de alerta. */
  alerta?: boolean
  onOk: () => void
  onVoltar: () => void
}) {
  useTravaRolagem(aberto)
  if (!aberto) return null
  return createPortal(
    <>
      <Veu onClick={onVoltar} z={75} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="anima-folha fixed inset-x-3 z-[76] mx-auto flex max-w-[calc(28rem-24px)] flex-col gap-3 rounded-3xl bg-sf p-5 text-ink"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        {alerta && (
          <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brasa-500/15 text-or-t">
            <Icone nome="alerta" tamanho={24} traco={2.4} />
          </span>
        )}
        <span className="text-[21px] font-extrabold leading-tight">{titulo}</span>
        {texto && (
          <span className="text-[15px] leading-relaxed text-ink2">{texto}</span>
        )}
        <div className="mt-1 flex gap-2.5">
          <BotaoSuave tamanho="g" className="flex-1" onClick={onVoltar} disabled={ocupado}>
            {voltar}
          </BotaoSuave>
          <BotaoAcao
            tamanho="g"
            sombra={false}
            className="flex-[1.2]"
            onClick={onOk}
            disabled={ocupado}
          >
            {ocupado ? 'Um momento…' : ok}
          </BotaoAcao>
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Rótulo de seção em caixa alta (RODANDO AGORA, MARCADOS · 3). */
export function RotuloSecao({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`px-1 text-[13px] font-extrabold uppercase tracking-[.08em] text-ink3 ${className}`}
    >
      {children}
    </span>
  )
}

/** Moldura padrão de tela: fundo, entrada suave e respiro para a barra. */
export function Tela({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`anima-tela pb-4 ${className}`}>{children}</div>
}
