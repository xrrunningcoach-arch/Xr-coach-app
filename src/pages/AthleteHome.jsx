import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import AthleteDashboard from './AthleteDashboard'
import AthleteProfileForm from './AthleteProfileForm'
import AnamnesisForm from '../components/AnamnesisForm'
import ChatPanel from '../components/ChatPanel'
import Sidebar from '../components/Sidebar'
import { IconCalendar, IconChart, IconChat, IconFlag, IconHeart, IconHome, IconTarget, IconUser } from '../components/icons'

const PLAN_SECTIONS = ['hoy', 'calendario', 'estadisticas', 'objetivos', 'zonas', 'tests']

export default function AthleteHome() {
  const { user, profile } = useAuth()
  const t = useT()
  const [section, setSection] = useState('hoy')
  const [unread, setUnread] = useState(0)
  const isPlanSection = PLAN_SECTIONS.includes(section)

  // Mensajes del entrenador sin leer (insignia en «Chat» y aviso en «Hoy»).
  const loadUnread = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('athlete_id', user.id)
      .neq('sender_id', user.id)
      .is('read_at', null)
    setUnread(data?.length || 0)
  }, [user])

  useEffect(() => {
    loadUnread()
  }, [loadUnread, section])

  const groups = [
    {
      title: t('nav.training'),
      items: [
        { id: 'hoy', label: t('nav.today'), icon: IconHome, primary: true },
        { id: 'calendario', label: t('nav.calendar'), icon: IconCalendar, primary: true },
        { id: 'estadisticas', label: t('nav.stats'), icon: IconChart, primary: true },
        { id: 'objetivos', label: t('nav.goals'), icon: IconTarget },
        { id: 'zonas', label: t('nav.zones'), icon: IconHeart },
        { id: 'tests', label: t('nav.tests'), icon: IconFlag },
      ],
    },
    {
      title: t('nav.account'),
      items: [
        { id: 'perfil', label: t('nav.profile'), icon: IconUser },
        { id: 'chat', label: t('nav.chat'), short: t('nav.chatShort'), icon: IconChat, primary: true, badge: unread || undefined },
      ],
    },
  ]

  return (
    <div className="md:flex md:gap-6 space-y-6 md:space-y-0">
      <Sidebar groups={groups} active={section} onSelect={setSection} ariaLabel={t('nav.athleteSections')} />

      <div className="flex-1 min-w-0 space-y-6">
        {/* El panel del plan se queda montado al cambiar de sección: así no se
            recargan los datos ni se pierde el mes que estabas mirando. */}
        <div className={isPlanSection ? '' : 'hidden'}>
          <AthleteDashboard section={isPlanSection ? section : 'hoy'} onNavigate={setSection} unread={unread} />
        </div>

        {section === 'perfil' && (
          <div className="space-y-6">
            <AthleteProfileForm />
            <div className="bg-surface border border-mist rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl text-navy">{t('profile.anamnesisTitle')}</h2>
              <AnamnesisForm athleteId={user.id} basicProfile={profile} />
            </div>
          </div>
        )}

        {section === 'chat' && <ChatPanel athleteId={user.id} otherName={t('chat.theCoach')} />}
      </div>
    </div>
  )
}
