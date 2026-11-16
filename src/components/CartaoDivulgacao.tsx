import { useState } from 'react'
import { useNoite } from '../context/NoiteContext'
import {
  cardOculto,
  divulgacoesNoAr,
  guardarOcultos,
  lerOcultos,
  type Divulgacao,
} from '../lib/divulgacao'
import { Icone } from './Icone'

const CORES: Record<Divulgacao['cor'], string> = {
  brasa: 'bg-brasa-500',
  verde: 'bg-verde-500',
  azul: 'bg-azul-500',
}

/**
 * Vendas da organização (festa, workshop) na tela Hoje, sem roubar a
 * tela: uma linha por oferta, com a foto em miniatura e o botão de
 * comprar. Os detalhes abrem ao tocar, e o × esconde o card até
 * aparecer uma oferta nova.
 */
export function CartaoDivulgacao() {
  const { agora } = useNoite()
  const [ocultos, setOcultos] = useState(lerOcultos)
  const [aberta, setAberta] = useState<string | null>(null)
  const itens = divulgacoesNoAr(agora)
  if (itens.length === 0 || cardOculto(itens, ocultos)) return null

  function fechar() {
    const ids = [...new Set([...ocultos, ...itens.map((d) => d.id)])]
    guardarOcultos(ids)
    setOcultos(ids)
  }

  return (
    <section
      aria-label="Ingressos à venda"
      className="flex flex-col gap-1 rounded-[22px] border border-linha bg-sf px-4 pb-2 pt-3 text-ink"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.06em] text-or-t">
          <span className="h-2 w-2 rounded-full bg-brasa-500" />
          Ingressos à venda
        </span>
        <button
          type="button"
          onClick={fechar}
          aria-label="Esconder ingressos à venda"
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-ink3"
        >
          <Icone nome="fechar" tamanho={18} traco={2.4} />
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-linha">
        {itens.map((d) => (
          <Oferta
            key={d.id}
            d={d}
            aberta={aberta === d.id}
            alternar={() => setAberta((a) => (a === d.id ? null : d.id))}
          />
        ))}
      </ul>
    </section>
  )
}

function Oferta({
  d,
  aberta,
  alternar,
}: {
  d: Divulgacao
  aberta: boolean
  alternar: () => void
}) {
  const idDetalhes = `divulgacao-${d.id}`
  return (
    <li className="flex flex-col py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberta}
          aria-controls={idDetalhes}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <img
            src={d.imagem}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-14 shrink-0 rounded-[14px] border-2 border-preto bg-sf2 object-cover"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-bold text-ink3">{d.selo}</span>
            <span className="text-base font-extrabold leading-tight">{d.titulo}</span>
            <span className="text-[13px] leading-snug text-ink3">
              {d.destaque}
              <Icone
                nome="abaixo"
                tamanho={14}
                traco={2.6}
                className={`ml-1 inline-block align-[-2px] transition-transform ${aberta ? 'rotate-180' : ''}`}
              />
            </span>
          </span>
        </button>

        <a
          href={d.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex h-10 w-[98px] shrink-0 items-center justify-center rounded-full border-2 border-preto text-sm font-extrabold text-preto active:scale-[.97] ${CORES[d.cor]}`}
        >
          {d.botao}
          <span className="sr-only"> {d.titulo} (abre o formulário em outra aba)</span>
        </a>
      </div>

      {aberta && (
        <ul
          id={idDetalhes}
          className="ml-[68px] mt-2 flex flex-col gap-1 text-[13px] leading-snug text-ink2"
        >
          {d.linhas.map((l) => (
            <li key={l.texto} className="flex items-start gap-1.5">
              <Icone nome={l.icone} tamanho={14} traco={2.2} className="mt-[2px] shrink-0 text-ink3" />
              <span>{l.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
