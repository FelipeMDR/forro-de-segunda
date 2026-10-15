import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { podeEditarTrilha } from '../../lib/trilha'

/** Professores, monitores e organização. Aluno volta para a trilha. */
export function SoEquipeTrilha() {
  const { profile, papel } = useAuth()
  if (!profile) return null
  if (!podeEditarTrilha({ papel, cargos: profile.cargos, turmas_ensino: profile.turmas_ensino })) {
    return <Navigate to="/trilha" replace />
  }
  return <Outlet />
}
