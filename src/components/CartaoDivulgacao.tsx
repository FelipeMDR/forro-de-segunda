import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNoite } from '../context/NoiteContext'
import { toISODate } from '../lib/dates'
import {
  cardOculto,
  divulgacoesNoAr,
  jaTemIngresso,
  marcarVistoHoje,
  ocultosDaSessao,
  vistoHojePendente,
  type Divulgacao,
} from '../lib/divulgacao'
import { useLembrado } from '../lib/memoriaTelas'
import type { TipoEventoDivulgacao } from '../lib/metricasDivulgacao'
import type { IngressoPerfil } from '../lib/types'
import { Icone } from './Icone'

const CORES: Record<Divulgacao['cor'], string> = {
  brasa: 'bg-brasa-500',
  verde: 'bg-verde-500',
  azul: 'bg-azul-500',
}

/**
 * Vendas da organização (festa, workshop) na tela Hoje, sem roubar a
 * tela: uma linha por oferta, com a foto em miniatura e o botão de
 * comprar. Os detalhes abrem ao tocar, e o × esconde o card só até a
 * pessoa abrir o app de novo (lib/divulgacao.ts, ocultosDaSessao).
 *
 * Quem já comprou não vê a oferta: está no desafio de ingresso dela
 * (a planilha de ingressos põe lá), ver `jaTemIngresso`.
 *
 * Cada passo vira métrica para a organização (migração 046): viu,
 * abriu os detalhes, tocou em Comprar, fechou.
 */
export function CartaoDivulgacao() {
  const { api, userId } = useAuth()
  const { agora } = useNoite()
  const ocultos = useSyncExternalStore(ocultosDaSessao.assinar, ocultosDaSessao.ler)
  const [aberta, setAberta] = useState<string | null>(null)
  // null = ainda não sabe: o card espera, para não aparecer e sumir em
  // seguida para quem já comprou
  const [ingressos, setIngressos] = useLembrado<IngressoPerfil[] | null>(
    'divulgacao:ingressos',
    null,
  )
  const ref = useRef<HTMLElement>(null)
  const hoje = toISODate(agora)
  const itens = divulgacoesNoAr(agora).filter(
    (d) => !jaTemIngresso(d, ingressos ?? [], hoje),
  )
  const oculto = ingressos === null || itens.length === 0 || cardOculto(itens, ocultos)
  const idsNoAr = itens.map((d) => d.id).join(' ')

  // A cada abertura da Hoje: a planilha pode ter acabado de sincronizar
  useEffect(() => {
    if (!userId) return
    let vivo = true
    void api
      .ingressosDoPerfil(userId)
      .then((l) => vivo && setIngressos(l))
      // Sem a migração 043 não há desafio de ingresso: mostra tudo
      .catch(() => vivo && setIngressos((atual) => atual ?? []))
    return () => {
      vivo = false
    }
  }, [api, userId, setIngressos])

  // Sem a migração 046 o insert falha: a métrica some, o card não
  const anotar = (id: string, evento: TipoEventoDivulgacao) =>
    void api.registrarEventoDivulgacao(id, evento).catch(() => {})

  // "Viu" só quando o card entra mesmo na tela, uma vez por dia
  useEffect(() => {
    const el = ref.current
    if (oculto || !el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return
        obs.disconnect()
        const dia = toISODate(new Date())
        for (const id of idsNoAr.split(' ')) {
          if (!vistoHojePendente(id, dia)) continue
          marcarVistoHoje(id, dia)
          anotar(id, 'visto')
        }
      },
      { threshold: 0.5 },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oculto, idsNoAr, api])

  if (oculto) return null

  function fechar() {
    for (const d of itens) if (!ocultos.includes(d.id)) anotar(d.id, 'fechou')
    ocultosDaSessao.fechar(itens.map((d) => d.id))
  }

  return (
    <section
      ref={ref}
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
            alternar={() => {
              if (aberta !== d.id) anotar(d.id, 'detalhes')
              setAberta((a) => (a === d.id ? null : d.id))
            }}
            comprar={() => anotar(d.id, 'clique')}
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
  comprar,
}: {
  d: Divulgacao
  aberta: boolean
  alternar: () => void
  comprar: () => void
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
          onClick={comprar}
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
