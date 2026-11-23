import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import AthleteDashboard from './AthleteDashboard'
import AnamnesisForm from '../components/AnamnesisForm'
import ConnectionsView from '../components/ConnectionsView'
import ChatPanel from '../components/ChatPanel'
import Sidebar from '../components/Sidebar'
import QuedadasView from '../components/quedadas/QuedadasView'
import IntervalsWellnessPanel from '../components/IntervalsWellnessPanel'
import { IconCalendar, IconChat, IconFlag, IconHome, IconUser } from '../components/icons'
import { IconMapPin } from '../components/icons-social'

const PROFILE_SECTIONS = ['estadisticas', 'objetivos', 'zonas', 'tests']

export default function AthleteHome() {
  const { user, profile } = useAuth()
  const t = useT()
  const [section, setSection] = useState('hoy')
  const [profileSection, setProfileSection] = useState('estadisticas')
  const [unread, setUnread] = useState(0)
  const [meetupDraftSession, setMeetupDraftSession] = useState(null)
  const isPlanSection = ['hoy', 'calendario'].includes(section) || (section === 'perfil' && PROFILE_SECTIONS.includes(profileSection))

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

  useEffect(() => {
    const openProfile = () => setSection('perfil')
    window.addEventListener('xr:open-athlete-profile', openProfile)
    return () => window.removeEventListener('xr:open-athlete-profile', openProfile)
  }, [])

  const groups = [
    {
      title: t('nav.training'),
      items: [
        { id: 'hoy', label: t('nav.today'), icon: IconHome, primary: true },
        { id: 'calendario', label: t('nav.calendar'), icon: IconCalendar, primary: true },
        { id: 'quedadas', label: t('nav.meetups'), icon: IconMapPin, primary: true },
      ],
    },
    {
      title: t('nav.account'),
      items: [
        { id: 'perfil', label: t('nav.profile'), icon: IconUser },
        { id: 'chat', label: t('nav.chat'), short: t('nav.chatShort'), icon: IconChat, primary: true, badge: unread || undefined },
        { id: 'conexiones', label: t('nav.connections'), icon: IconFlag },
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
          <AthleteDashboard
            section={section === 'perfil' ? profileSection : section}
            onNavigate={setSection}
            unread={unread}
            onProposeSession={(session) => { setMeetupDraftSession(session); setSection('quedadas') }}
          />
        </div>

        {section === 'quedadas' && <QuedadasView draftSession={meetupDraftSession} onDraftConsumed={() => setMeetupDraftSession(null)} />}

        {section === 'conexiones' && <ConnectionsView onNavigate={setSection} userId={user.id} />}

        {section === 'perfil' && <div className="space-y-5">
          <header className="flex flex-col gap-3 rounded-2xl bg-navy-deep p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div><p className="font-mono text-[11px] uppercase tracking-widest text-brand">XR · {t('nav.account')}</p><h1 className="mt-1 font-display text-2xl">{t('nav.profile')}</h1></div>
            <label className="flex items-center gap-2 text-sm"><span className="sr-only">{t('profile.section')}</span><select value={profileSection} onChange={(e) => setProfileSection(e.target.value)} className="min-h-11 rounded-lg border border-white/20 bg-white px-3 py-2 font-semibold text-navy">
              <option value="estadisticas">{t('nav.stats')}</option><option value="objetivos">{t('nav.goals')}</option><option value="zonas">{t('nav.zones')}</option><option value="tests">{t('nav.tests')}</option><option value="anamnesis">{t('sum.anamnesis')}</option><option value="bienestar">{t('wellness.title')}</option>
            </select></label>
          </header>
          {profileSection === 'anamnesis' && <div className="rounded-xl border border-mist bg-surface p-5 sm:p-6"><p className="mb-4 text-sm text-slate">{t('profile.autoNote')}</p><AnamnesisForm athleteId={user.id} basicProfile={profile} /></div>}
          {profileSection === 'bienestar' && <IntervalsWellnessPanel athleteId={user.id} />}
        </div>}

        {section === 'chat' && <ChatPanel athleteId={user.id} otherName={t('chat.theCoach')} />}
      </div>
    </div>
  )
}
