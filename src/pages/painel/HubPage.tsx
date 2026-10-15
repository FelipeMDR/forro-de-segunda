import { useNavigate } from 'react-router-dom'
import { Cabecalho, CartaoAtalho } from '../../components/ui'
import { usePainel } from './contexto'

/**
 * Entrada do painel no celular: cinco áreas, cada uma com o que tem
 * dentro escrito por extenso — quem abre o painel uma vez por semana
 * não precisa lembrar onde ficava cada coisa.
 */
export function PainelHome() {
  const navigate = useNavigate()
  const { reports } = usePainel()
  return (
    <div className="anima-tela">
      <Cabecalho titulo="Painel" sobretitulo="Organização" fallback="/perfil" />
      <div className="flex flex-col gap-2.5 px-4 pt-4">
        <CartaoAtalho
          icone="pessoas"
          cor="#FFB98C"
          titulo="Pessoas"
          descricao="Alunos · importar lista · turmas · cargos · encerrar semestre"
          onClick={() => navigate('/organizador/pessoas')}
        />
        <CartaoAtalho
          icone="agenda"
          cor="#0391D5"
          titulo="Agenda"
          descricao="Aulas e eventos · cancelamentos e feriados · desafios"
          onClick={() => navigate('/organizador/agenda')}
        />
        <CartaoAtalho
          icone="play"
          cor="#0391D5"
          titulo="Vídeo-aulas"
          descricao="Trilhas por nível · cronograma das turmas"
          onClick={() => navigate('/trilha/gerenciar')}
        />
        <CartaoAtalho
          icone="medalha"
          cor="#CBE288"
          titulo="Distintivos"
          descricao="Catálogo · entregar por pessoa, turma ou Top N"
          onClick={() => navigate('/organizador/distintivos')}
        />
        <CartaoAtalho
          icone="frequencia"
          cor="#9BC22D"
          titulo="Frequência"
          descricao="Resumo do mês · tabela · revisão de fotos · exportar CSV"
          onClick={() => navigate('/organizador/frequencia')}
        />
        <CartaoAtalho
          icone="bandeira"
          cor="#DE5300"
          titulo="Denúncias"
          descricao="Fotos denunciadas para moderar"
          contador={reports.length}
          onClick={() => navigate('/organizador/denuncias')}
        />
      </div>
    </div>
  )
}

export function PessoasHub() {
  const navigate = useNavigate()
  const { perfis } = usePainel()
  const comTurma = perfis.filter((p) => p.turmas.length > 0).length
  return (
    <div className="anima-tela">
      <Cabecalho titulo="Pessoas" sobretitulo="Painel" fallback="/organizador" />
      <div className="flex flex-col gap-2.5 px-4 pt-4">
        <CartaoAtalho
          icone="pessoa"
          cor="#FFB98C"
          titulo="Alunos"
          descricao={`${comTurma} com turma no semestre · buscar e editar`}
          onClick={() => navigate('/organizador/alunos')}
        />
        <CartaoAtalho
          icone="enviar"
          cor="#7CC6EE"
          titulo="Importar lista"
          descricao="Lista de chamada ou matrícula (CSV)"
          onClick={() => navigate('/organizador/importar')}
        />
        <CartaoAtalho
          icone="camadas"
          cor="#CBE288"
          titulo="Turmas do semestre"
          descricao="Turmas e quem dá aula em cada uma"
          onClick={() => navigate('/organizador/turmas')}
        />
        <CartaoAtalho
          icone="estrela"
          cor="#F97316"
          titulo="Cargos do projeto"
          descricao="Presidência, diretorias, professores, monitores, DJs"
          onClick={() => navigate('/organizador/cargos')}
        />
        <CartaoAtalho
          icone="cadeado"
          cor="#F5F4F2"
          titulo="Encerrar semestre"
          descricao="Tira todo mundo das turmas e libera a Retrospectiva"
          onClick={() => navigate('/organizador/semestre')}
        />
      </div>
    </div>
  )
}
