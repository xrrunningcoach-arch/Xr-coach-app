import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import AthleteDashboard from './AthleteDashboard'
import AthleteProfileForm from './AthleteProfileForm'
import AnamnesisForm from '../components/AnamnesisForm'
import ChatPanel from '../components/ChatPanel'

export default function AthleteHome() {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState('plan')

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-mist overflow-x-auto">
        {[
          ['plan', 'Mi plan'],
          ['perfil', 'Mi perfil'],
          ['chat', 'Chat con mi entrenador'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-red text-red' : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <AthleteDashboard />}

      {tab === 'perfil' && (
        <div className="space-y-6">
          <AthleteProfileForm />
          <div className="bg-white border border-mist rounded-sm p-6 space-y-4">
            <h2 className="font-display text-xl text-navy">Anamnesis · cuestionario inicial</h2>
            <AnamnesisForm athleteId={user.id} basicProfile={profile} />
          </div>
        </div>
      )}

      {tab === 'chat' && <ChatPanel athleteId={user.id} otherName="tu entrenador" />}
    </div>
  )
}
