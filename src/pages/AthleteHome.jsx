import { useState } from 'react'
import AthleteDashboard from './AthleteDashboard'
import AthleteProfileForm from './AthleteProfileForm'

export default function AthleteHome() {
  const [tab, setTab] = useState('plan')

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-mist">
        {[
          ['plan', 'Mi plan'],
          ['perfil', 'Mi perfil'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-red text-red' : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' ? <AthleteDashboard /> : <AthleteProfileForm />}
    </div>
  )
}
