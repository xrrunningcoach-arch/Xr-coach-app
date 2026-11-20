import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { getLang, useT } from '../i18n'
import { IconCalendar, IconChat, IconClose, IconPlus } from './icons'

const MEDIA_BUCKET = 'xr-chat-media'
const MAX_MEDIA_BYTES = 50 * 1024 * 1024

function formatTime(iso) {
  const date = new Date(iso)
  const locale = getLang() === 'eu' ? 'eu-ES' : 'es-ES'
  return `${date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}

function formatTrainingDate(value) {
  if (!value) return ''
  return new Date(`${value}T12:00:00`).toLocaleDateString(getLang() === 'eu' ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'short' })
}

function safeFileName(name) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-90) || 'media'
}

// Conversación privada atleta-entrenador con mensajes en tiempo real,
// archivos multimedia y sesiones de entrenamiento compartidas.
export default function ChatPanel({ athleteId, otherName }) {
  const { user, role } = useAuth()
  const t = useT()
  const [messages, setMessages] = useState([])
  const [sessions, setSessions] = useState([])
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [coachNoteMode, setCoachNoteMode] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!athleteId || !user) return
    const [{ data, error: messageError }, { data: plan }] = await Promise.all([
      supabase.from('messages').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(300),
      supabase.from('training_plans').select('id').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (messageError) {
      setError(messageError.message)
      setLoading(false)
      return
    }

    const ordered = (data || []).slice().reverse()
    const linkedIds = [...new Set(ordered.map((message) => message.linked_session_id).filter(Boolean))]
    const [linkedResult, upcomingResult] = plan?.id
      ? await Promise.all([
          linkedIds.length ? supabase.from('sessions').select('id,session_date,week_number,day_number,session_type,description,km_estimated,duration_planned_min,status').in('id', linkedIds) : Promise.resolve({ data: [] }),
          supabase.from('sessions').select('id,session_date,week_number,day_number,session_type,description,km_estimated,duration_planned_min,status').eq('plan_id', plan.id).order('session_date', { ascending: true }).limit(80),
        ])
      : [{ data: [] }, { data: [] }]
    const sessionMap = Object.fromEntries((linkedResult.data || []).map((session) => [session.id, session]))
    setSessions(upcomingResult.data || [])

    const attachmentMessages = ordered.filter((message) => message.attachment_path)
    const signedResults = await Promise.all(attachmentMessages.map(async (message) => {
      const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(message.attachment_path, 3600)
      return [message.id, signed?.signedUrl || null]
    }))
    const urlMap = Object.fromEntries(signedResults)
    setMessages(ordered.map((message) => ({ ...message, training: sessionMap[message.linked_session_id] || null, mediaUrl: urlMap[message.id] || null })))
    setError(null)
    setLoading(false)

    const unread = ordered.filter((message) => message.sender_id !== user.id && !message.read_at)
    if (unread.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread.map((message) => message.id))
    }
  }, [athleteId, user])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`chat-${athleteId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athleteId}` }, () => load())
      .subscribe()
    const timer = setInterval(load, 15000)
    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [athleteId, load])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  function chooseFile(event) {
    const candidate = event.target.files?.[0]
    event.target.value = ''
    if (!candidate) return
    if (!candidate.type.startsWith('image/') && !candidate.type.startsWith('video/')) {
      setError(t('chat.mediaTypeError'))
      return
    }
    if (candidate.size > MAX_MEDIA_BYTES) {
      setError(t('chat.mediaSizeError'))
      return
    }
    setError(null)
    setSelectedSession(null)
    setFile(candidate)
  }

  async function handleSend(event) {
    if (event) event.preventDefault()
    const body = text.trim()
    if (sending || (!body && !file && !selectedSession)) return
    setSending(true)
    setError(null)
    let attachmentPath = null
    let messageType = 'text'

    try {
      if (file) {
        const path = `${athleteId}/${user.id}/${Date.now()}-${safeFileName(file.name)}`
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError
        attachmentPath = path
        messageType = file.type.startsWith('video/') ? 'video' : 'image'
      } else if (selectedSession) {
        messageType = 'training'
      }

      const defaultBody = file
        ? (file.type.startsWith('video/') ? t('chat.videoMessage') : t('chat.photoMessage'))
        : selectedSession
          ? (selectedSession.session_type || t('chat.training'))
          : ''
      const payload = {
        athlete_id: athleteId,
        sender_id: user.id,
        body: body || defaultBody,
        message_type: coachNoteMode && role === 'coach' && messageType === 'text' ? 'coach_note' : messageType,
        attachment_path: attachmentPath,
        attachment_mime: file?.type || null,
        linked_session_id: selectedSession?.id || null,
      }
      const { data: sentMessage, error: insertError } = await supabase.from('messages').insert(payload).select('id').single()
      if (insertError) throw insertError

      setText('')
      setFile(null)
      setSelectedSession(null)
      setCoachNoteMode(false)
      setShowSessions(false)
      if (sentMessage?.id) {
        supabase.functions.invoke('send-push', { body: { messageId: sentMessage.id } }).catch((pushError) => console.info('Push notification is not configured yet:', pushError.message))
      }
      await load()
    } catch (sendError) {
      if (attachmentPath) {
        await supabase.storage.from(MEDIA_BUCKET).remove([attachmentPath]).catch(() => {})
      }
      setError(sendError.message || t('common.error'))
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const otherInitial = (otherName || t('chat.theCoach')).trim().slice(0, 1).toUpperCase()

  return (
    <section aria-label={t('chat.title', { name: otherName || t('chat.theCoach') })} className="mx-auto flex h-[min(72dvh,760px)] min-h-[460px] max-w-3xl flex-col overflow-hidden rounded-2xl border border-mist bg-surface shadow-sm">
      <header className="flex items-center gap-3 border-b border-mist bg-surface px-4 py-3 sm:px-5">
        <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-navy">{otherInitial}<span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-emerald-500" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold text-navy">{otherName || t('chat.theCoach')}</h3>
          <p className="flex items-center gap-1.5 text-xs text-slate"><IconChat width={14} height={14} />{t('chat.privateLive')}</p>
        </div>
        <span className="hidden rounded-full bg-bg-dim px-3 py-1 text-[11px] font-semibold text-slate sm:inline">{t('chat.coachingChat')}</span>
      </header>

      <div ref={listRef} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto bg-bg px-3 py-4 sm:px-5">
        {loading && <p className="py-4 text-center text-sm text-slate">{t('chat.loading')}</p>}
        {!loading && messages.length === 0 && (
          <div className="mx-auto my-10 max-w-xs rounded-2xl border border-mist bg-surface p-5 text-center shadow-sm">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand/20 text-navy"><IconChat width={22} height={22} /></span>
            <p className="font-semibold text-navy">{t('chat.emptyTitle')}</p>
            <p className="mt-1 text-sm text-slate">{t('chat.empty')}</p>
          </div>
        )}

        {messages.map((message) => {
          const mine = message.sender_id === user?.id
          const isCoachNote = message.message_type === 'coach_note'
          return (
            <article key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[78%] ${mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-mist bg-surface text-ink'}`}>
                {isCoachNote && <p className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${mine ? 'text-white/80' : 'text-brand-deep'}`}>{t('chat.coachNote')}</p>}
                {message.message_type === 'training' && message.training && (
                  <div className={`mb-2 min-w-[220px] rounded-xl p-3 ${mine ? 'bg-white/10' : 'bg-bg-dim'}`}>
                    <div className="mb-2 flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${mine ? 'bg-white/15' : 'bg-brand/25'}`}><IconCalendar width={17} height={17} /></span><div><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{t('chat.sharedTraining')}</p><p className="font-semibold leading-tight">{message.training.session_type || t('chat.training')}</p></div></div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
                      {message.training.session_date && <span>{formatTrainingDate(message.training.session_date)}</span>}
                      {message.training.km_estimated != null && <span>{message.training.km_estimated} km</span>}
                      {message.training.duration_planned_min != null && <span>{message.training.duration_planned_min} min</span>}
                    </div>
                    {message.training.description && <p className="mt-2 whitespace-pre-wrap text-sm">{message.training.description}</p>}
                    {message.body && message.body !== message.training.session_type && <p className="mt-2 border-t border-current/15 pt-2 text-sm">{message.body}</p>}
                  </div>
                )}
                {(message.message_type === 'image' || message.message_type === 'video') && message.mediaUrl && (
                  <div className="mb-2 overflow-hidden rounded-xl">
                    {message.message_type === 'video'
                      ? <video src={message.mediaUrl} controls playsInline preload="metadata" className="max-h-80 max-w-full bg-black" />
                      : <a href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt={t('chat.sharedPhoto')} loading="lazy" className="max-h-80 max-w-full object-contain" /></a>}
                  </div>
                )}
                {message.body && !(message.message_type === 'training' && message.training && message.body === message.training.session_type) && !(message.message_type === 'image' && message.body === t('chat.photoMessage')) && !(message.message_type === 'video' && message.body === t('chat.videoMessage')) && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
                <p className={`mt-1 text-right font-mono text-[10px] ${mine ? 'text-white/65' : 'text-slate'}`}>{formatTime(message.created_at)}{mine && message.read_at ? t('chat.read') : ''}</p>
              </div>
            </article>
          )
        })}
      </div>

      {error && <p role="alert" className="border-t border-red/20 bg-red/5 px-4 py-2 text-sm text-red">{error}</p>}

      {(file || selectedSession) && (
        <div className="flex items-center gap-2 border-t border-mist bg-bg-dim px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-navy">{file ? `${file.type.startsWith('video/') ? t('chat.video') : t('chat.photo')}: ${file.name}` : `${t('chat.sharedTraining')}: ${selectedSession.session_type || t('chat.training')}`}</span>
          <button type="button" onClick={() => { setFile(null); setSelectedSession(null) }} aria-label={t('common.close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-mist"><IconClose width={17} height={17} /></button>
        </div>
      )}

      {coachNoteMode && <p className="border-t border-brand/25 bg-brand/10 px-4 py-2 text-xs font-semibold text-navy">{t('chat.coachNoteMode')}</p>}

      {showSessions && (
        <div className="max-h-48 overflow-y-auto border-t border-mist bg-surface p-2" role="listbox" aria-label={t('chat.selectTraining')}>
          {sessions.length === 0 ? <p className="p-3 text-sm text-slate">{t('chat.noTraining')}</p> : sessions.map((session) => (
            <button key={session.id} type="button" onClick={() => { setSelectedSession(session); setFile(null); setShowSessions(false) }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-dim">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-navy">{session.session_type || t('chat.training')}</span><span className="block text-xs text-slate">{formatTrainingDate(session.session_date)}{session.km_estimated != null ? ` · ${session.km_estimated} km` : ''}</span></span><IconCalendar className="shrink-0 text-brand-deep" width={18} height={18} />
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="border-t border-mist bg-surface p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={chooseFile} className="sr-only" aria-label={t('chat.attachMedia')} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('chat.attachMedia')} title={t('chat.attachMedia')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-mist text-navy transition hover:border-brand hover:bg-brand/10"><IconPlus width={21} height={21} /></button>
          <button type="button" onClick={() => { setShowSessions((shown) => !shown); setFile(null) }} aria-label={t('chat.shareTraining')} title={t('chat.shareTraining')} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition ${showSessions || selectedSession ? 'border-brand bg-brand/15 text-navy' : 'border-mist text-navy hover:border-brand hover:bg-brand/10'}`}><IconCalendar width={19} height={19} /></button>
          <div className="min-w-0 flex-1">
            {role === 'coach' && <button type="button" onClick={() => setCoachNoteMode((mode) => !mode)} className={`mb-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${coachNoteMode ? 'bg-brand text-navy' : 'bg-bg-dim text-slate hover:text-navy'}`}>{coachNoteMode ? t('chat.coachNoteMode') : t('chat.addCoachNote')}</button>}
            <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={handleKeyDown} rows={1} maxLength={2000} placeholder={t('chat.placeholder')} className="block max-h-28 min-h-11 w-full resize-y rounded-2xl border border-mist bg-bg px-4 py-3 text-sm focus:border-brand focus:outline-none" />
          </div>
          <button type="submit" disabled={sending || (!text.trim() && !file && !selectedSession)} aria-label={sending ? t('chat.sending') : t('chat.send')} className="grid h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-brand px-3 text-sm font-bold text-navy shadow-sm transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-45">{sending ? '…' : t('chat.send')}</button>
        </div>
        <p className="mt-1.5 pl-1 text-[10px] text-slate">{t('chat.mediaLimit')}</p>
      </form>
    </section>
  )
}
