import type { ReactNode } from 'react'
import { Avatar } from './Avatar'

/**
 * Capa do álbum. Sem capa (o demo, uma faixa sem arte no Spotify), um
 * quadrado com a nota — do mesmo tamanho, para a lista não desalinhar.
 */
export function CapaAlbum({ url, tamanho = 48 }: { url: string | null; tamanho?: number }) {
  const style = { width: tamanho, height: tamanho }
  return url ? (
    <img
      src={url}
      alt=""
      style={style}
      className="shrink-0 rounded-lg border border-preto/10 object-cover shadow-sm"
    />
  ) : (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brasa-500/20 to-azul-500/20 text-lg"
    >
      🎵
    </span>
  )
}

/**
 * Capa com a foto de quem pediu sobreposta no canto. Na linha de texto
 * a foto ficava com 18 px e não dava para reconhecer ninguém; aqui ela
 * cobre o quarto de baixo à direita da capa (60% do lado, passando um
 * pouco da borda), com borda branca para destacar do álbum.
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
    <span
      className="relative shrink-0"
      style={{ width: tamanho + sobra, height: tamanho + sobra }}
    >
      <CapaAlbum url={capaUrl} tamanho={tamanho} />
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-white">
        <Avatar nome={pessoa.nome} url={pessoa.avatarUrl} tamanho={foto} />
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
}: {
  titulo: string
  artista: string
  capaUrl: string | null
  /** Quem pediu. Sem isto, a linha não mostra pessoa (ex.: "Meus pedidos"). */
  pessoa?: { nome: string; avatarUrl: string | null } | null
  posicao?: number
  /** Uma informação extra em destaque (ex.: "é a próxima!"). */
  detalhe?: string
  tamanhoCapa?: number
  acao?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      {posicao !== undefined && (
        <span className="w-5 shrink-0 text-center text-sm font-bold text-tinta-500">
          {posicao}
        </span>
      )}
      {pessoa ? (
        <CapaComPessoa capaUrl={capaUrl} pessoa={pessoa} tamanho={tamanhoCapa} />
      ) : (
        <CapaAlbum url={capaUrl} tamanho={tamanhoCapa} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{titulo}</p>
        <p className="truncate text-xs text-tinta-500">{artista}</p>
        {pessoa && (
          <p className="mt-0.5 truncate text-xs text-tinta-600">pedida por {pessoa.nome}</p>
        )}
        {detalhe && <p className="mt-0.5 text-xs font-semibold text-brasa-700">{detalhe}</p>}
      </div>
      {acao}
    </div>
  )
}
