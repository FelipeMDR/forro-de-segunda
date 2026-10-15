import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolhaChave } from '../components/FolhaChave'
import { Icone } from '../components/Icone'
import { Cabecalho, Segmentado, Tela } from '../components/ui'
import { formatDate } from '../lib/dates'
import {
  NOME_NIVEL,
  nivelDoAluno,
  niveisVisiveis,
  situacaoDoNivel,
  type PassoComSituacao,
} from '../lib/trilha'
import type { NivelTrilha } from '../lib/types'
import { useTrilha } from '../lib/useTrilha'

function detalhe(s: PassoComSituacao): string {
  if (s.estado === 'aberto') {
    if (!s.passo.video_frente) return 'Vídeo em breve'
    if (s.motivo === 'revisao') return 'Revisão'
    if (s.motivo === 'chave') return 'Liberado com chave'
    return s.data ? `Aula de ${formatDate(s.data)}` : 'Aberto'
  }
  if (s.estado === 'chave') return `Libera ${formatDate(s.data!)} · ou 1 chave`
  return s.data ? `Libera ${formatDate(s.data)}` : 'Abre com a turma'
}

export function TrilhaPage() {
  const { dados, erro, liberar } = useTrilha()
  const [nivel, setNivel] = useState<NivelTrilha | null>(null)
  const [alvo, setAlvo] = useState<PassoComSituacao | null>(null)

  const niveis = dados ? niveisVisiveis(dados.ctx) : []
  useEffect(() => {
    if (dados && nivel === null) setNivel(nivelDoAluno(dados.ctx) ?? niveis[0] ?? null)
  }, [dados, nivel, niveis])

  const lista = dados && nivel ? situacaoDoNivel(nivel, dados.ctx) : []
  const meu = dados ? nivelDoAluno(dados.ctx) : null

  return (
    <Tela>
      <Cabecalho
        titulo="Trilha de passos"
        fallback="/"
        acao={
          dados && (
            <span className="flex h-11 items-center gap-2 rounded-full bg-preto px-3.5 text-sm font-extrabold text-branco">
              <Icone nome="chave" className="h-[18px] w-[18px] text-brasa-400" />
              {dados.saldo.disponiveis} {dados.saldo.disponiveis === 1 ? 'chave' : 'chaves'}
            </span>
          )
        }
      />
      <div className="flex flex-col gap-3 px-4 pt-2">
        {erro && <p className="text-sm text-or-t">{erro}</p>}
        {dados && niveis.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            A trilha da sua turma ainda não foi configurada. Assim que os professores subirem os vídeos, eles aparecem aqui.
          </p>
        )}
        {niveis.length > 1 && nivel && (
          <Segmentado
            opcoes={niveis.map((n) => ({
              valor: n,
              rotulo: n !== meu && !dados?.ctx.equipe ? `${NOME_NIVEL[n]} · revisão` : NOME_NIVEL[n],
            }))}
            valor={nivel}
            onChange={setNivel}
          />
        )}
        {lista[0]?.motivo === 'revisao' && (
          <p className="rounded-2xl bg-verde-300 px-4 py-3 text-sm text-preto">
            <b>Modo revisão:</b> você já passou por esse nível, então todos os vídeos estão abertos.
          </p>
        )}
        <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
          {lista.map((s, i) => {
            const conteudo = (
              <>
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    s.estado === 'aberto' ? 'bg-marinho-500 text-branco' : s.estado === 'chave' ? 'bg-brasa-300 text-or-t' : 'bg-chip text-ink3'
                  }`}
                >
                  <Icone nome={s.estado === 'aberto' ? 'play' : s.estado === 'chave' ? 'chave' : 'cadeado'} className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-[15px] font-extrabold ${s.estado === 'bloqueado' ? 'text-ink3' : ''}`}>
                    {s.numero}. {s.passo.nome}
                  </span>
                  <span className="text-xs text-ink2">{detalhe(s)}</span>
                </span>
                {s.estado === 'chave' && (
                  <span className="rounded-full border-[1.5px] border-brasa-500 px-3 py-1.5 text-[13px] font-extrabold text-or-t">
                    Liberar
                  </span>
                )}
              </>
            )
            const classe = `flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left ${i > 0 ? 'border-t border-linha' : ''}`
            if (s.estado === 'aberto' && s.passo.video_frente) {
              return (
                <Link key={s.passo.id} to={`/trilha/${s.passo.id}`} className={classe}>
                  {conteudo}
                </Link>
              )
            }
            if (s.estado === 'chave') {
              return (
                <button key={s.passo.id} type="button" className={classe} onClick={() => setAlvo(s)}>
                  {conteudo}
                </button>
              )
            }
            return (
              <div key={s.passo.id} className={classe}>
                {conteudo}
              </div>
            )
          })}
        </div>
        {lista.length > 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-[13px] leading-snug text-ink2">
            Chaves só abrem o <b className="text-ink">próximo passo</b> da trilha, até 7 dias antes da turma. Assim ninguém queima a largada.
          </p>
        )}
      </div>
      {dados && <FolhaChave alvo={alvo} saldo={dados.saldo} onFechar={() => setAlvo(null)} onLiberar={liberar} />}
    </Tela>
  )
}
