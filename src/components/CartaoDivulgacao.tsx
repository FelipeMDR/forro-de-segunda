import { useNoite } from '../context/NoiteContext'
import { divulgacoesNoAr, type Divulgacao } from '../lib/divulgacao'
import { Icone } from './Icone'

const CORES: Record<Divulgacao['cor'], string> = {
  brasa: 'bg-brasa-500',
  verde: 'bg-verde-500',
  azul: 'bg-azul-500',
}

/**
 * Vendas da organização (festa, workshop) na tela Hoje. Cada oferta é
 * um ingresso em miniatura: o bloco da data na cor do cartaz, o
 * essencial em texto e o botão que leva ao formulário de compra.
 */
export function CartaoDivulgacao() {
  const { agora } = useNoite()
  const itens = divulgacoesNoAr(agora)
  if (itens.length === 0) return null

  return (
    <section
      aria-labelledby="divulgacao-titulo"
      className="flex flex-col gap-3 rounded-[22px] border border-linha bg-sf p-4 text-ink"
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.06em] text-or-t">
          <span className="h-2 w-2 rounded-full bg-brasa-500" />
          Ingressos à venda
        </span>
        <h2 id="divulgacao-titulo" className="text-[17px] font-extrabold leading-tight">
          Dezembro no Forró de Segunda
        </h2>
      </div>

      {itens.map((d) => (
        <Oferta key={d.id} d={d} />
      ))}
    </section>
  )
}

function Oferta({ d }: { d: Divulgacao }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-[18px] border-2 border-preto bg-sf p-3.5 shadow-[0_4px_0_#000507]">
      <div className="flex gap-3.5">
        <div
          className={`flex w-[80px] shrink-0 flex-col items-center justify-center self-start rounded-[14px] border-2 border-preto px-1 py-2 text-preto ${CORES[d.cor]}`}
        >
          <span className="text-[11px] font-extrabold uppercase leading-tight">
            {d.data.semana}
          </span>
          <span className="whitespace-nowrap text-[22px] font-extrabold leading-none tracking-[-.02em]">
            {d.data.dia}
          </span>
          <span className="text-xs font-extrabold uppercase leading-tight">{d.data.mes}</span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-col">
            <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
              {d.tipo}
            </span>
            <h3 className="text-[20px] font-extrabold leading-[1.1] tracking-[-.01em]">
              {d.titulo}
            </h3>
            <span className="text-[14px] font-semibold leading-snug text-ink2">
              {d.destaque}
            </span>
          </div>

          {(d.quando || d.onde || d.extra) && (
            <ul className="flex flex-col gap-1 text-[13px] leading-snug text-ink2">
              {d.quando && <Linha icone="agenda">{d.quando}</Linha>}
              {d.onde && <Linha icone="local">{d.onde}</Linha>}
              {d.extra && <Linha icone="estrela">{d.extra}</Linha>}
            </ul>
          )}
        </div>
      </div>

      <a
        href={d.link}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-preto text-[15px] font-extrabold text-preto active:scale-[.98] ${CORES[d.cor]}`}
      >
        {d.botao}
        <Icone nome="avancar" tamanho={18} traco={2.6} />
        <span className="sr-only">(abre o formulário em outra aba)</span>
      </a>
    </article>
  )
}

function Linha({
  icone,
  children,
}: {
  icone: 'agenda' | 'local' | 'estrela'
  children: string
}) {
  return (
    <li className="flex items-start gap-1.5">
      <Icone nome={icone} tamanho={14} traco={2.2} className="mt-[2px] shrink-0 text-ink3" />
      <span>{children}</span>
    </li>
  )
}
