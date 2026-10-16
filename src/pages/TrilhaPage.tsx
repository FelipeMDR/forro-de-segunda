import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolhaChave, FolhaRegrasChaves } from '../components/FolhaChave'
import { Icone } from '../components/Icone'
import { Interruptor, Segmentado, Tela, useVoltar } from '../components/ui'
import { lerPraticados } from '../lib/praticados'
import { comoAbriu, quandoLibera } from '../lib/textosTrilha'
import {
  NIVEIS,
  NOME_NIVEL,
  nivelDoAluno,
  nivelInicial,
  niveisVisiveis,
  situacaoDoNivel,
  type PassoComSituacao,
} from '../lib/trilha'
import type { NivelTrilha } from '../lib/types'
import { professoresDo, useTrilha } from '../lib/useTrilha'

type Visual = 'praticado' | 'aberto' | 'chave' | 'bloqueado'

const ICONE: Record<Visual, { fundo: string; nome: 'check' | 'play' | 'chave' | 'cadeado' }> = {
  praticado: { fundo: 'bg-verde-700 text-branco', nome: 'check' },
  aberto: { fundo: 'bg-marinho-500 text-branco', nome: 'play' },
  chave: { fundo: 'bg-brasa-300 text-or-t', nome: 'chave' },
  bloqueado: { fundo: 'bg-chip text-ink3', nome: 'cadeado' },
}

export function TrilhaPage() {
  const { dados, erro, liberar, comoAluno, verComoAluno } = useTrilha()
  const voltar = useVoltar('/')
  const [nivel, setNivel] = useState<NivelTrilha | null>(null)
  const [alvo, setAlvo] = useState<PassoComSituacao | null>(null)
  const [regrasAbertas, setRegrasAbertas] = useState(false)
  const [praticados] = useState(lerPraticados)

  // Ao ligar/desligar "ver como aluno", a aba volta para o nível de quem vê
  const equipe = dados?.ctx.equipe
  useEffect(() => {
    setNivel(null)
  }, [equipe])
  useEffect(() => {
    if (dados && nivel === null) setNivel(nivelInicial(dados.ctx))
  }, [dados, nivel])

  const niveis = dados ? niveisVisiveis(dados.ctx) : []
  const meu = dados ? nivelDoAluno(dados.ctx) : null
  const lista = dados && nivel ? situacaoDoNivel(nivel, dados.ctx) : []
  const saldo = dados?.saldo

  const visual = (s: PassoComSituacao): Visual =>
    s.estado === 'aberto' ? (praticados.has(s.passo.id) ? 'praticado' : 'aberto') : s.estado

  const detalhe = (s: PassoComSituacao): string => {
    if (s.estado !== 'aberto') return quandoLibera(s, dados!.ctx.hoje)
    if (!s.passo.video_frente) return 'Vídeo em breve'
    const texto = comoAbriu(s, professoresDo(s.passo, dados!).map((p) => p.nome))
    return praticados.has(s.passo.id) ? `${texto} · praticado` : texto
  }

  return (
    <Tela>
      <div className="flex items-center justify-between px-2 pt-3">
        <button
          type="button"
          onClick={voltar}
          aria-label="Voltar"
          className="flex h-11 w-11 items-center justify-center text-ink"
        >
          <Icone nome="voltar" className="h-6 w-6" />
        </button>
        {saldo && (
          <button
            type="button"
            onClick={() => setRegrasAbertas(true)}
            aria-label={`Você tem ${saldo.disponiveis} ${saldo.disponiveis === 1 ? 'chave' : 'chaves'}. Ver como funcionam`}
            className="mr-2 flex h-11 items-center gap-2 rounded-full bg-preto px-3.5 text-sm font-extrabold text-branco"
          >
            <Icone nome="chave" className="h-[18px] w-[18px] text-brasa-400" />
            {saldo.disponiveis} {saldo.disponiveis === 1 ? 'chave' : 'chaves'}
            <Icone nome="info" className="h-4 w-4 text-[#c3c8cb]" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-5 pt-1 pb-4">
        <h1 className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">Trilha de passos</h1>
        <p className="text-[15px] leading-snug text-ink2">
          Os vídeos abrem conforme a turma avança. Veio às aulas e dançou com a turma? Ganhe chaves e veja o próximo passo antes.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {dados?.equipeReal && (
          <button
            type="button"
            role="switch"
            aria-checked={comoAluno}
            onClick={() => {
              verComoAluno(!comoAluno)
            }}
            className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-linha bg-sf px-4 py-2 text-left"
          >
            <span className="flex flex-col">
              <span className="text-[15px] font-extrabold">Ver como aluno</span>
              <span className="text-xs text-ink2">
                {comoAluno
                  ? 'Você está vendo como um aluno da sua turma: cadeados, chaves e preços.'
                  : 'Como equipe, você vê tudo aberto. Ligue para ver o que o aluno vê.'}
              </span>
            </span>
            <Interruptor ligado={comoAluno} />
          </button>
        )}
        {erro && <p className="text-sm text-or-t">{erro}</p>}

        {dados && niveis.length === 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            {dados.ctx.minhasTurmas.length === 0
              ? 'Você ainda não está em nenhuma turma. Quando a organização te colocar numa, a trilha dela aparece aqui.'
              : 'A trilha da sua turma ainda não foi configurada. Assim que os professores subirem os vídeos, eles aparecem aqui.'}
          </p>
        )}
        {dados && meu && !dados.ctx.equipe && niveis.length > 0 && !niveis.includes(meu) && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-sm text-ink2">
            Os vídeos do seu nível ainda não subiram. Enquanto isso, dá para revisar os níveis anteriores.
          </p>
        )}

        {niveis.length > 1 && nivel && (
          <Segmentado
            opcoes={niveis.map((n) => ({
              valor: n,
              rotulo:
                meu && !dados?.ctx.equipe && NIVEIS.indexOf(n) < NIVEIS.indexOf(meu)
                  ? `${NOME_NIVEL[n]} · revisão`
                  : NOME_NIVEL[n],
            }))}
            valor={nivel}
            onChange={setNivel}
          />
        )}

        {lista[0]?.motivo === 'revisao' && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-verde-300 px-3.5 py-3 text-sm leading-snug text-preto">
            <Icone nome="girar" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <b>Modo revisão:</b> você já passou por esse nível, então todos os vídeos estão abertos.
            </span>
          </div>
        )}

        {nivel && lista.length > 0 && (
          <section className="flex flex-col gap-2 pt-1">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[19px] font-extrabold">{NOME_NIVEL[nivel]}</h2>
              <span className="text-xs font-bold text-ink3">
                {lista.length} {lista.length === 1 ? 'passo' : 'passos'}
              </span>
            </div>
            <div className="overflow-hidden rounded-[20px] border border-linha bg-sf">
              {lista.map((s, i) => {
                const v = visual(s)
                const conteudo = (
                  <>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICONE[v].fundo}`}>
                      <Icone
                        nome={ICONE[v].nome}
                        preenchido={v === 'aberto'}
                        traco={v === 'praticado' ? 2.6 : undefined}
                        className="h-5 w-5"
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`text-[15px] font-extrabold leading-tight ${v === 'bloqueado' ? 'text-ink3' : ''}`}>
                        {s.passo.nome}
                      </span>
                      <span className="text-xs text-ink2">{detalhe(s)}</span>
                    </span>
                    {s.estado === 'chave' && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-brasa-500 px-3 py-1.5 text-[13px] font-extrabold text-or-t">
                        Liberar · {s.custo ?? 1}
                      </span>
                    )}
                    {s.estado === 'aberto' && s.passo.video_frente && (
                      <Icone nome="avancar" className="h-5 w-5 shrink-0 text-ink3" />
                    )}
                  </>
                )
                const classe = `flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3 text-left ${i > 0 ? 'border-t border-linha' : ''}`
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
          </section>
        )}

        {lista.length > 0 && (
          <p className="rounded-2xl bg-chip px-4 py-3 text-[13px] leading-snug text-ink2">
            O próximo passo custa 1 chave e cada um depois dele custa <b className="text-ink">o dobro</b>. Compre na ordem; quando a turma avança, o preço cai.
          </p>
        )}
      </div>
      {saldo && <FolhaChave alvo={alvo} saldo={saldo} desafio={dados?.desafio ?? null} onFechar={() => setAlvo(null)} onLiberar={liberar} />}
      {saldo && (
        <FolhaRegrasChaves
          aberta={regrasAbertas}
          saldo={saldo}
          desafio={dados?.desafio ?? null}
          onFechar={() => setRegrasAbertas(false)}
        />
      )}
    </Tela>
  )
}
