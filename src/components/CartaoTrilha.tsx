import { useState } from 'react'
import { Link } from 'react-router-dom'
import { comoAbriu, quandoLibera } from '../lib/textosTrilha'
import {
  miniaturaDoYoutube,
  NOME_NIVEL,
  REGRAS_PADRAO,
  nivelInicial,
  situacaoDoNivel,
  type PassoComSituacao,
} from '../lib/trilha'
import { professoresDo, useTrilha } from '../lib/useTrilha'
import { FolhaChave } from './FolhaChave'
import { Icone } from './Icone'

/**
 * Cartão "Sua trilha" na tela Hoje: o passo mais recente aberto (com a
 * miniatura do vídeo) e o próximo, com a chave à mão.
 *
 * Abre no mesmo nível que a tela da trilha (`nivelInicial`): a equipe sem
 * turma também vê o cartão, que é como a organização confere a trilha.
 */
export function CartaoTrilha() {
  const { dados, liberar } = useTrilha()
  const [alvo, setAlvo] = useState<PassoComSituacao | null>(null)
  if (!dados) return null
  const nivel = nivelInicial(dados.ctx)
  if (!nivel) return null
  const lista = situacaoDoNivel(nivel, dados.ctx)
  const atual = [...lista].reverse().find((s) => s.estado === 'aberto' && s.passo.video_frente)
  const proximo = lista.find((s) => s.estado !== 'aberto')
  if (!atual && !proximo) return null
  const { saldo } = dados
  const pontosNaVez = saldo.pontosPorChave - saldo.faltam

  return (
    <section className="flex flex-col gap-3.5 rounded-[22px] border border-linha bg-sf p-4 text-ink">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-extrabold uppercase tracking-[.06em] text-or-t">
            Sua trilha · {NOME_NIVEL[nivel]}
          </span>
          <span className="text-xl font-extrabold leading-tight">Passos desta semana</span>
        </div>
        <Link to="/trilha" className="flex min-h-11 items-center text-sm font-extrabold text-or-t">
          Ver trilha
        </Link>
      </div>

      {atual && (
        <Link to={`/trilha/${atual.passo.id}`} className="flex items-center gap-3">
          <span className="relative h-[72px] w-[112px] shrink-0 overflow-hidden rounded-[14px] bg-marinho-500">
            <img
              src={miniaturaDoYoutube(atual.passo.video_frente!)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-preto/25">
              <Icone nome="play" preenchido className="h-7 w-7 text-branco" />
            </span>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <b className="text-base leading-tight">{atual.passo.nome}</b>
            <span className="text-[13px] text-ink2">{comoAbriu(atual, professoresDo(atual.passo, dados).map((p) => p.nome))}</span>
            <span className="flex items-center gap-1 text-xs font-extrabold text-gr-t">
              <Icone nome="check" className="h-3.5 w-3.5" />
              Liberado
            </span>
          </span>
        </Link>
      )}

      {proximo && (
        <div className="flex items-center gap-3 rounded-2xl bg-fundo px-3.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-ink2">
            <Icone nome="cadeado" className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-sm leading-tight">Próximo: {proximo.passo.nome}</b>
            <span className="text-xs text-ink2">{quandoLibera(proximo, dados.ctx.hoje)}</span>
          </span>
          {proximo.estado === 'chave' && (
            <button
              type="button"
              onClick={() => setAlvo(proximo)}
              aria-label={`Liberar por ${proximo.custo ?? 1}. Você tem ${saldo.disponiveis}`}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-preto px-3.5 text-[13px] font-extrabold text-branco"
            >
              <Icone nome="chave" className="h-4 w-4 text-brasa-400" />
              {proximo.custo ?? 1}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs font-bold text-ink2">
          <span>Presença e parceria até a próxima chave</span>
          <span>
            {pontosNaVez} de {saldo.pontosPorChave}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-chip">
          <div
            className="h-full rounded-full bg-brasa-500"
            style={{ width: `${(pontosNaVez / saldo.pontosPorChave) * 100}%` }}
          />
        </div>
      </div>

      <FolhaChave alvo={alvo} saldo={saldo} desafio={dados.desafio} regras={dados.ctx.regras ?? REGRAS_PADRAO} onFechar={() => setAlvo(null)} onLiberar={liberar} />
    </section>
  )
}
