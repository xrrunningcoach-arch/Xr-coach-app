import QuedadasView from '../components/quedadas/QuedadasView'
import CommunityRequestsPanel from '../components/quedadas/CommunityRequestsPanel'

// El entrenador también puede participar en las quedadas (por ejemplo, el administrador).
export default function CoachQuedadas() {
  return <><CommunityRequestsPanel /><QuedadasView /></>
}
