import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import AthleteDashboard from './AthleteDashboard'
import AthleteProfileForm from './AthleteProfileForm'
import AnamnesisForm from '../components/AnamnesisForm'
import ChatPanel from '../components/ChatPanel'
import Sidebar from '../components/Sidebar'
import { IconCalendar, IconChart, IconChat, IconFlag, IconHeart, IconTarget, IconUser } from '../components/icons'

const GROUPS = [
  {
    title: 'Entrenamiento',
    items: [
      { id: 'calendario', label: 'Calendario', icon: IconCalendar },
      { id: 'estadisticas', label: 'Estadísticas', icon: IconChart },
      { id: 'objetivos', label: 'Objetivos!', icon: IconTarget },
      { id: 'zonas', label: 'Zonas de FC', icon: IconHeart },
      { id: 'tests', label: 'Test y marcas', icon: IconFlag },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      { id: 'perfil', label: 'Mi perfil', icon: IconUser },
      { id: 'chat', label: 'Chat con mi entrenador', icon: IconChat },
    ],
  },
]

const PLAN_SECTIONS = ['calendario', 'estadisticas', 'objetivos', 'zonas', 'tests']

export default function AthleteHome() {
  const { user, profile } = useAuth()
  const [section, setSection] = useState('calendario')
  const isPlanSection = PLAN_SECTIONS.includes(section)

  return (
    <div className="md:flex md:gap-6 space-y-6 md:space-y-0">
      <Sidebar groups={GROUPS} active={section} onSelect={setSection} ariaLabel="Secciones del atleta" />

      <div className="flex-1 min-w-0 space-y-6">
        {/* El panel del plan se queda montado al cambiar de sección: así no se
            recargan los datos ni se pierde el mes que estabas mirando. */}
        <div className={isPlanSection ? '' : 'hidden'}>
          <AthleteDashboard section={isPlanSection ? section : 'calendario'} onNavigate={setSection} />
        </div>

        {section === 'perfil' && (
          <div className="space-y-6">
            <AthleteProfileForm />
            <div className="bg-white border border-mist rounded-sm p-6 space-y-4">
              <h2 className="font-display text-xl text-navy">Anamnesis · cuestionario inicial</h2>
              <AnamnesisForm athleteId={user.id} basicProfile={profile} />
            </div>
          </div>
        )}

        {section === 'chat' && <ChatPanel athleteId={user.id} otherName="tu entrenador" />}
      </div>
    </div>
  )
}
