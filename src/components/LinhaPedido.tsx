import type { ReactNode } from 'react'
import { Avatar } from './Avatar'

/**
 * Capa do álbum. Sem capa (o demo, uma faixa sem arte no Spotify), um
 * quadrado listrado com a nota — do mesmo tamanho, para a lista não
 * desalinhar.
 */
export function CapaAlbum({ url, tamanho = 48 }: { url: string | null; tamanho?: number }) {
  const style = { width: tamanho, height: tamanho }
  return url ? (
    <img
      src={url}
      alt=""
      style={style}
      className="shrink-0 rounded-[10px] border-[1.5px] border-preto object-cover"
    />
  ) : (
    <span
      style={{ ...style, fontSize: tamanho * 0.38 }}
      className="listras flex shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-preto bg-marinho-500"
    >
      🎵
    </span>
  )
}

/**
 * Capa com a foto de quem pediu sobreposta no canto de baixo: na linha
 * de texto a foto ficava pequena demais para reconhecer alguém.
 */
function CapaComPessoa({
  capaUrl,
  pessoa,
  tamanho,
}: {
  capaUrl: string | null
  pessoa: { nome: string; avatarUrl: string | null }
  tamanho: number
}) {
  const foto = Math.round(tamanho * 0.6)
  const sobra = Math.round(tamanho * 0.12)
  return (
    <span className="relative shrink-0" style={{ width: tamanho + sobra, height: tamanho + sobra }}>
      <CapaAlbum url={capaUrl} tamanho={tamanho} />
      <span className="absolute bottom-0 right-0 rounded-full shadow-[0_0_0_2.5px_var(--sf)]">
        <Avatar nome={pessoa.nome} url={pessoa.avatarUrl} tamanho={foto} borda={false} />
      </span>
    </span>
  )
}

/**
 * Uma música pedida: capa, título e artista, e — quando importa quem
 * pediu — a foto da pessoa no canto da capa e o nome dela. É a mesma
 * linha na fila do aluno, na do DJ e no "Tocando agora", para as três
 * telas falarem igual.
 */
export function LinhaPedido({
  titulo,
  artista,
  capaUrl,
  pessoa,
  posicao,
  detalhe,
  tamanhoCapa = 52,
  acao,
  className = '',
}: {
  titulo: string
  artista: string
  capaUrl: string | null
  /** Quem pediu. Sem isto, a linha não mostra pessoa. */
  pessoa?: { nome: string; avatarUrl: string | null } | null
  posicao?: number
  /** Uma informação extra em destaque (ex.: "é a próxima!"). */
  detalhe?: string
  tamanhoCapa?: number
  acao?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {posicao !== undefined && (
        <span className="w-5 shrink-0 text-center text-sm font-extrabold text-ink3">
          {posicao}
        </span>
      )}
      {pessoa ? (
        <CapaComPessoa capaUrl={capaUrl} pessoa={pessoa} tamanho={tamanhoCapa} />
      ) : (
        <CapaAlbum url={capaUrl} tamanho={tamanhoCapa} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-base font-extrabold">{titulo}</span>
        <span className="truncate text-[13px] text-ink3">{artista}</span>
        {pessoa && <span className="truncate text-[13px] text-ink2">pedida por {pessoa.nome}</span>}
        {detalhe && <span className="text-[13px] font-extrabold text-or-t">{detalhe}</span>}
      </div>
      {acao}
    </div>
  )
}
