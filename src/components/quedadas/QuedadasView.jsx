import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useLang } from '../../i18n'
import { ui } from '../../ui/ui'
import LoadingScreen from '../LoadingScreen'
import SocialOptIn from './SocialOptIn'
import MeetupCard from './MeetupCard'
import MeetupForm from './MeetupForm'
import { disciplineName, fetchDisciplines } from '../../lib/disciplines'
import { filterMeetups } from '../../lib/meetups'
import { deactivateSocial, fetchMeetingPoints, fetchMeetups, fetchSocialProfile } from '../../lib/quedadasApi'

const selectCls = 'border border-mist rounded-md px-3 py-2 text-sm bg-surface'

// Sección «Quedadas»: perfil social (opt-in) y, una vez activado, lista de
// próximas quedadas, las mías y crear una nueva.
export default function QuedadasView() {
  const { user, profile } = useAuth()
  const { t } = useLang()
  const [state, setState] = useState({ loading: true, social: null, missing: false, error: null })

  const loadSocial = useCallback(async () => {
    const r = await fetchSocialProfile(user.id)
    setState({
      loading: false,
      social: r.profile && r.profile.is_active ? r.profile : null,
      missing: !!r.missing,
      error: r.error && !r.missing ? r.error : null,
    })
  }, [user.id])

  useEffect(() => {
    loadSocial()
  }, [loadSocial])

  if (state.loading) return <LoadingScreen />
  if (state.missing) return <p className="text-sm text-slate bg-surface border border-mist rounded-xl p-5">{t('qd.needMigration')}</p>
  if (state.error) return <p className="text-sm text-red">{state.error}</p>
  if (!state.social) return <SocialOptIn user={user} profile={profile} onDone={loadSocial} />
  return <Quedadas social={state.social} onDeactivated={loadSocial} />
}

function Quedadas({ social, onDeactivated }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [tab, setTab] = useState('next')
  const [loading, setLoading] = useState(true)
  const [meetups, setMeetups] = useState([])
  const [points, setPoints] = useState([])
  const [disciplines, setDisciplines] = useState([])
  const [filters, setFilters] = useState({ day: 'all', discipline: 'all', level: 'all' })
  const [error, setError] = useState(null)
  const community = social.communities

  const reload = useCallback(async () => {
    try {
      const [list, pts] = await Promise.all([fetchMeetups(social.community_id), fetchMeetingPoints(social.community_id)])
      setMeetups(list)
      setPoints(pts)
      setError(null)
    } catch (e) {
      if (/permission denied for table meetups/i.test(e.message)) setError(t('qd.permissionMismatch'))
      else if (/list_community_meetups|function.*not found|schema cache/i.test(e.message)) setError(t('qd.needMigration'))
      else setError(e.message)
    }
    setLoading(false)
  }, [social.community_id, t])

  useEffect(() => {
    reload()
    fetchDisciplines().then(setDisciplines)
  }, [reload])

  const upcoming = useMemo(() => meetups.filter((m) => m.status === 'open' && new Date(m.starts_at).getTime() > Date.now()), [meetups])
  const filtered = useMemo(() => filterMeetups(upcoming, filters), [upcoming, filters])
  const mine = useMemo(() => meetups.filter((m) => m.people.some((p) => p.user_id === user.id)), [meetups, user.id])

  async function handleDeactivate() {
    if (!(await ui.confirm(t('qd.optin.confirmDeactivate'), { confirmLabel: t('qd.optin.deactivate') }))) return
    try {
      await deactivateSocial(user.id)
      ui.success(t('qd.optin.deactivated'))
      await onDeactivated()
    } catch (e) {
      ui.error(t('qd.err.generic', { msg: e.message }))
    }
  }

  const tabs = [
    ['next', t('qd.tab.next')],
    ['mine', t('qd.tab.mine')],
    ['create', t('qd.tab.create')],
  ]

  const renderList = (list, emptyKey) =>
    list.length === 0 ? (
      <div className="bg-surface border border-mist rounded-xl p-6 text-center text-sm text-slate">{t(emptyKey)}</div>
    ) : (
      <div className="space-y-4 max-w-3xl">
        {list.map((m) => (
          <MeetupCard key={m.id} meetup={m} me={user.id} community={community} disciplines={disciplines} onChanged={reload} />
        ))}
      </div>
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-navy">{t('qd.title')}</h1>
          <p className="text-sm text-slate max-w-2xl">{t('qd.intro', { community: community?.name || '' })}</p>
        </div>
        <button type="button" onClick={handleDeactivate} className="text-xs text-slate hover:text-red">
          {t('qd.optin.deactivate')}
        </button>
      </div>

      <div role="group" aria-label={t('qd.title')} className="flex w-full sm:w-auto border border-mist rounded-sm bg-surface overflow-hidden">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`flex-1 px-2 sm:px-3 py-2 text-[11px] sm:text-sm leading-tight transition-colors ${tab === id ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      {loading ? (
        <LoadingScreen />
      ) : (
        <>
          {tab === 'next' && (
            <div className="space-y-4">
              <div className="bg-surface border border-mist rounded-xl p-3 sm:p-4 space-y-3">
                <p className="text-sm font-semibold text-navy">{t('qd.discover.title')}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <select value={filters.day} onChange={(e) => setFilters({ ...filters, day: e.target.value })} aria-label={t('qd.filter.day.all')} className={selectCls}>
                    <option value="all">{t('qd.filter.day.all')}</option>
                    <option value="today">{t('qd.filter.day.today')}</option>
                    <option value="week">{t('qd.filter.day.week')}</option>
                  </select>
                  <select value={filters.discipline} onChange={(e) => setFilters({ ...filters, discipline: e.target.value })} aria-label={t('qd.filter.discipline')} className={selectCls}>
                    <option value="all">{t('qd.filter.allDisciplines')}</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.code}>
                        {disciplineName(d)}
                      </option>
                    ))}
                  </select>
                  <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} aria-label={t('qd.filter.level')} className={selectCls}>
                    <option value="all">{t('qd.filter.allLevels')}</option>
                    {['beginner', 'intermediate', 'advanced'].map((level) => (
                      <option key={level} value={level}>{t(`qd.level.${level}`)}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate">{t('qd.discover.help')}</p>
              </div>
              {renderList(filtered, 'qd.empty')}
            </div>
          )}

          {tab === 'mine' && renderList(mine, 'qd.emptyMine')}

          {tab === 'create' && (
            <MeetupForm
              user={user}
              social={social}
              points={points}
              disciplines={disciplines}
              onCreated={() => {
                reload()
                setTab('next')
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
