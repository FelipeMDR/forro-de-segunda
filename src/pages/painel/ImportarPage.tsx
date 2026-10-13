import { useRef, useState } from 'react'
import { Icone } from '../../components/Icone'
import { Spinner } from '../../components/Spinner'
import {
  BotaoAcao,
  BotaoSuave,
  Cabecalho,
  CampoBusca,
  ChipEscolha,
  Confirmar,
  Segmentado,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { combinaBusca } from '../../lib/busca'
import { agruparChamada, filtrarPorTurma, semConta, SEM_TURMA, type PessoaNaChamada } from '../../lib/chamada'
import { parseAlunosCSV, type ResultadoParse } from '../../lib/csvImport'
import { ordenarTurmas } from '../../lib/forrodex'
import { planejarMatricula, turmasDaLinha } from '../../lib/matricula'
import { Dica, usePainel } from './contexto'

/**
 * Importar a matrícula (CSV) e cuidar da lista de chamada — a lista que
 * libera o cadastro: o aluno cria a conta informando o telefone e já
 * entra nas turmas certas.
 */
export function ImportarPage() {
  const [aba, setAba] = useState<'importar' | 'chamada'>('importar')
  return (
    <div className="anima-tela">
      <Cabecalho titulo="Importar lista" sobretitulo="Pessoas" fallback="/organizador/pessoas" />
      <Segmentado
        className="mx-4 mb-1 mt-3"
        valor={aba}
        onChange={setAba}
        opcoes={[
          { valor: 'importar', rotulo: 'Importar CSV' },
          { valor: 'chamada', rotulo: 'Lista de chamada' },
        ]}
      />
      {aba === 'importar' ? <Importar /> : <Chamada />}
    </div>
  )
}

function Importar() {
  const { api } = useAuth()
  const toast = useToast()
  const { turmas, alunos, perfis, recarregar } = usePainel()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [importacao, setImportacao] = useState<ResultadoParse | null>(null)
  const [arquivo, setArquivo] = useState('')
  const [importando, setImportando] = useState(false)

  const escolherArquivo = async (file: File | undefined) => {
    if (!file) return
    const texto = await file.text()
    setArquivo(file.name)
    setImportacao(parseAlunosCSV(texto, turmas.map((t) => t.nome)))
    if (arquivoRef.current) arquivoRef.current.value = ''
  }

  // O plano só existe enquanto há um arquivo escolhido; é ele que a tela
  // mostra antes de confirmar e o que a API executa.
  const plano = importacao ? planejarMatricula(importacao.linhas, alunos ?? [], perfis) : []
  const comConta = plano.filter((p) => p.userId).length

  const confirmar = async () => {
    if (plano.length === 0) return
    setImportando(true)
    try {
      const { perfis: p, chamada } = await api.matricularAlunos(plano)
      toast(
        [
          p > 0 && `${p} já no app tiveram a turma atualizada`,
          chamada > 0 && `${chamada} entraram na lista de chamada`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Nada mudou',
      )
      setImportacao(null)
      await recarregar.pessoas()
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-3.5">
      <input
        ref={arquivoRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => void escolherArquivo(e.target.files?.[0])}
      />
      {!importacao ? (
        <>
          <p className="px-1 text-[15px] leading-relaxed text-ink2">
            O CSV precisa das colunas <b className="text-ink">nome</b>, <b className="text-ink">celular</b>{' '}
            e <b className="text-ink">turma</b> (papel = Condutor/Conduzido, opcional; com ou sem
            cabeçalho). Aluno em várias turmas = uma linha por turma.
          </p>
          <button
            type="button"
            onClick={() => arquivoRef.current?.click()}
            className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-linha bg-sf text-ink"
          >
            <Icone nome="enviar" tamanho={28} traco={2} />
            <span className="text-base font-extrabold">Escolher arquivo CSV</span>
            <span className="text-[13px] text-ink3">do celular ou do Drive</span>
          </button>
          <Dica>
            As turmas do arquivo substituem as de agora, pessoa por pessoa. Quem não está no
            arquivo não é tocado — dá para importar uma turma de cada vez. Ao virar o semestre,
            encerre o semestre antes de importar.
          </Dica>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-[20px] border border-linha bg-sf p-4">
            <span className="truncate text-sm font-extrabold text-ink3">{arquivo}</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold">{plano.length}</span>
                <span className="text-xs text-ink3">pessoas</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold text-gr-t">{plano.length - comConta}</span>
                <span className="text-xs text-ink3">novas na chamada</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold text-or-t">{importacao.avisos.length}</span>
                <span className="text-xs text-ink3">com aviso</span>
              </div>
            </div>
            {plano.length > 0 && (
              <div className="sem-barra flex max-h-64 flex-col overflow-y-auto border-t border-linha">
                {plano.map((p) => (
                  <div key={p.chave} className="flex justify-between gap-2.5 border-b border-linha py-2.5 text-sm">
                    <span className="min-w-0 truncate font-bold">{p.nome ?? '—'}</span>
                    <span className="shrink-0 text-right font-bold text-ink3">{turmasDaLinha(p)}</span>
                  </div>
                ))}
              </div>
            )}
            {importacao.avisos.length > 0 && (
              <ul className="sem-barra flex max-h-28 flex-col gap-1 overflow-y-auto text-[13px] font-bold text-or-t">
                {importacao.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>
          <BotaoAcao tamanho="g" bloco disabled={importando || plano.length === 0} onClick={() => void confirmar()}>
            {importando
              ? 'Matriculando…'
              : `Importar ${plano.length} ${plano.length === 1 ? 'pessoa' : 'pessoas'}`}
          </BotaoAcao>
          <BotaoSuave bloco onClick={() => setImportacao(null)}>
            Escolher outro arquivo
          </BotaoSuave>
        </>
      )}
    </div>
  )
}

/** A lista de chamada: quem pode criar conta, uma linha por pessoa. */
function Chamada() {
  const { api } = useAuth()
  const toast = useToast()
  const { turmas, alunos, perfis, recarregar } = usePainel()
  const [busca, setBusca] = useState('')
  const [turma, setTurma] = useState('')
  const [removendo, setRemovendo] = useState<PessoaNaChamada | null>(null)
  const [limpando, setLimpando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  if (alunos === null) return <Spinner />

  // Uma linha por pessoa, não por (pessoa, turma)
  const pessoas = agruparChamada(alunos, perfis)
  const filtradas = filtrarPorTurma(pessoas, turma).filter((p) =>
    combinaBusca(busca, [p.nome, p.telefone, ...p.turmas]),
  )
  const faltamConta = semConta(pessoas)
  const jaTemConta = pessoas.length - faltamConta

  const removerPessoa = async (p: PessoaNaChamada) => {
    setOcupado(true)
    try {
      for (const linha of p.linhas) await api.deleteAlunoCadastrado(linha.id)
      await recarregar.pessoas()
      setRemovendo(null)
      toast(
        p.temConta
          ? 'Tirado da lista de chamada. A conta no app continua ativa.'
          : 'Tirado da lista de chamada.',
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const removerLinha = async (id: string) => {
    try {
      await api.deleteAlunoCadastrado(id)
      await recarregar.pessoas()
    } catch (err) {
      toast((err as Error).message, 'erro')
    }
  }

  const limpar = async () => {
    setOcupado(true)
    try {
      const n = await api.limparChamadaComConta()
      await recarregar.pessoas()
      setLimpando(false)
      toast(
        n === 0
          ? 'Nada a limpar — ninguém na lista tem conta ainda'
          : `${n} linha(s) removidas. O acesso de quem já tem conta continua igual.`,
      )
    } catch (err) {
      toast((err as Error).message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pt-3.5">
      <div className="px-4">
        <Dica>
          Tirar alguém daqui não tira o acesso de quem já criou conta — a lista vale só na
          hora do cadastro.
        </Dica>
      </div>
      <div className="px-4">
        <CampoBusca
          placeholder="Nome ou celular"
          aria-label="Buscar na lista de chamada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="sem-barra flex gap-2 overflow-x-auto px-4">
        <ChipEscolha ativo={turma === ''} cor="preto" className="h-[38px]" onClick={() => setTurma('')}>
          Todas
        </ChipEscolha>
        {ordenarTurmas(turmas.map((t) => t.nome)).map((t) => (
          <ChipEscolha key={t} ativo={turma === t} cor="preto" className="h-[38px]" onClick={() => setTurma(t)}>
            {t}
          </ChipEscolha>
        ))}
        <ChipEscolha ativo={turma === SEM_TURMA} cor="preto" className="h-[38px]" onClick={() => setTurma(SEM_TURMA)}>
          Sem turma
        </ChipEscolha>
      </div>
      <div className="px-5 text-[13px] font-extrabold text-ink3">
        {filtradas.length}
        {filtradas.length !== pessoas.length && ` de ${pessoas.length}`}{' '}
        {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
        {faltamConta > 0 && ` · ${faltamConta} ainda sem conta`}
      </div>
      {jaTemConta > 0 && (
        <div className="px-4">
          <BotaoSuave bloco tamanho="p" onClick={() => setLimpando(true)}>
            Tirar da lista quem já tem conta ({jaTemConta})
          </BotaoSuave>
        </div>
      )}
      <div className="px-3">
        {filtradas.map((p) => (
          <div key={p.chave} className="flex flex-col gap-1.5 border-b border-linha p-2">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate text-base font-extrabold">
                  {p.nome ?? '—'}
                  {!p.temConta && (
                    <span className="shrink-0 rounded-full border-[1.5px] border-preto bg-brasa-300 px-2 py-0.5 text-[11px] font-extrabold text-preto">
                      sem conta
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-ink3">{p.telefone}</span>
              </div>
              <button
                type="button"
                onClick={() => setRemovendo(p)}
                aria-label={`Tirar ${p.nome ?? p.telefone} da chamada`}
                className="flex h-11 w-11 items-center justify-center text-ink3"
              >
                <Icone nome="lixo" tamanho={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.linhas.map((linha) => (
                <span key={linha.id} className="inline-flex items-center gap-1 rounded-full bg-chip py-1 pl-2.5 pr-1 text-[13px] font-bold">
                  {linha.turma ?? 'sem turma'}
                  {linha.papel_danca && ` · ${linha.papel_danca === 'Condutor(a)' ? 'cond.' : 'conduz.'}`}
                  <button
                    type="button"
                    onClick={() => void removerLinha(linha.id)}
                    aria-label={`Tirar ${p.nome ?? p.telefone} de ${linha.turma ?? 'sem turma'}`}
                    className="flex h-6 w-6 items-center justify-center text-ink3"
                  >
                    <Icone nome="fechar" tamanho={12} traco={3} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
        {filtradas.length === 0 && (
          <p className="px-2 py-8 text-center text-[15px] text-ink3">Ninguém encontrado.</p>
        )}
      </div>

      <Confirmar
        aberto={removendo !== null}
        titulo={`Tirar ${removendo?.nome ?? removendo?.telefone ?? ''} da chamada?`}
        texto={
          removendo?.temConta
            ? 'A conta no app continua ativa — a chamada só libera o cadastro. Para tirar das turmas, edite o aluno.'
            : 'A pessoa não vai mais conseguir criar conta com esse celular.'
        }
        ok="Tirar da chamada"
        ocupado={ocupado}
        onOk={() => removendo && void removerPessoa(removendo)}
        onVoltar={() => setRemovendo(null)}
      />
      <Confirmar
        aberto={limpando}
        titulo={`Tirar ${jaTemConta} da lista?`}
        texto="São as pessoas que já criaram conta. Elas continuam com o mesmo acesso e as mesmas turmas — a chamada só é lida na hora do cadastro."
        ok="Limpar"
        ocupado={ocupado}
        onOk={() => void limpar()}
        onVoltar={() => setLimpando(false)}
      />
    </div>
  )
}
