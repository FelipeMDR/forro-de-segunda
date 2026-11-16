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
 * um mini-cartaz: a foto do cartaz com o selo da data, o essencial em
 * texto e o botão que leva ao formulário de compra.
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

      {/* Um ao lado do outro, com o próximo aparecendo na borda: o card
          ocupa a altura de uma oferta só e não empurra o resto da tela. */}
      <div className="sem-barra -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1.5">
        {itens.map((d) => (
          <Oferta key={d.id} d={d} sozinha={itens.length === 1} />
        ))}
      </div>
    </section>
  )
}

function Oferta({ d, sozinha }: { d: Divulgacao; sozinha: boolean }) {
  return (
    <article
      className={`flex shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border-2 border-preto bg-sf shadow-[0_4px_0_#000507] ${
        sozinha ? 'w-full' : 'w-[84%] max-w-[340px]'
      }`}
    >
      <div className="relative aspect-[16/10] bg-sf2">
        <img
          src={d.imagem}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <span
          className={`absolute left-3 top-3 rounded-full border-2 border-preto px-2.5 py-1 text-xs font-extrabold text-preto ${CORES[d.cor]}`}
        >
          {d.selo}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-extrabold uppercase tracking-[.06em] text-ink3">
            {d.tipo}
          </span>
          <h3 className="text-[22px] font-extrabold leading-[1.05] tracking-[-.01em]">
            {d.titulo}
          </h3>
          <span className="text-[15px] font-semibold leading-snug text-ink2">{d.destaque}</span>
        </div>

        <ul className="flex flex-col gap-1.5 text-[14px] leading-snug text-ink2">
          <Linha icone="agenda">{d.quando}</Linha>
          {d.onde && <Linha icone="local">{d.onde}</Linha>}
          {d.extra && <Linha icone="estrela">{d.extra}</Linha>}
        </ul>

        <a
          href={d.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-auto flex h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-preto text-base font-extrabold text-preto active:scale-[.98] ${CORES[d.cor]}`}
        >
          {d.botao}
          <Icone nome="avancar" tamanho={18} traco={2.6} />
          <span className="sr-only">(abre o formulário em outra aba)</span>
        </a>
      </div>
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
    <li className="flex items-start gap-2">
      <Icone nome={icone} tamanho={16} traco={2.2} className="mt-[2px] shrink-0 text-ink3" />
      <span>{children}</span>
    </li>
  )
}
