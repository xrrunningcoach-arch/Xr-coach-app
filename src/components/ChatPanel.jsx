import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { getLang, useT } from '../i18n'

function formatTime(iso) {
  const d = new Date(iso)
  const day = d.toLocaleDateString(getLang() === 'eu' ? 'eu-ES' : 'es-ES', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString(getLang() === 'eu' ? 'eu-ES' : 'es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

// Chat entre un atleta y su entrenador. La conversación se identifica con el
// id del atleta. Se actualiza en tiempo real y, por si el tiempo real no
// estuviera activado, también consulta cada 15 segundos.
export default function ChatPanel({ athleteId, otherName }) {
  const { user } = useAuth()
  const t = useT()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)

  const load = useCallback(async () => {
    if (!athleteId || !user) return
    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(300)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const ordered = (data || []).slice().reverse()
    setError(null)
    setMessages(ordered)
    setLoading(false)

    // Se marcan como leídos los mensajes que ha recibido quien tiene abierto el chat.
    const unread = ordered.filter((m) => m.sender_id !== user.id && !m.read_at)
    if (unread.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map((m) => m.id))
    }
  }, [athleteId, user])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`chat-${athleteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athleteId}` },
        () => load()
      )
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

  async function handleSend(e) {
    if (e) e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    const { error: err } = await supabase
      .from('messages')
      .insert({ athlete_id: athleteId, sender_id: user.id, body })
    setSending(false)
    if (err) {
      setError(err.message)
      return
    }
    setText('')
    load()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bg-surface border border-mist rounded-lg overflow-hidden max-w-3xl">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">{t('chat.title', { name: otherName || t('chat.theCoach') })}</h3>
      </div>

      <div ref={listRef} className="h-96 overflow-y-auto px-4 py-4 space-y-3 bg-bg">
        {loading && <p className="text-sm text-slate">{t('chat.loading')}</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-slate">{t('chat.empty')}</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  mine ? 'bg-primary text-white' : 'bg-surface border border-mist text-ink'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`font-mono text-[10px] mt-1 ${mine ? 'text-white/60' : 'text-slate'}`}>
                  {formatTime(m.created_at)}
                  {mine && m.read_at ? t('chat.read') : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="px-4 py-2 text-sm text-red">{error}</p>}

      <form onSubmit={handleSend} className="border-t border-mist p-3 flex items-end gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={2000}
          placeholder={t('chat.placeholder')}
          className="flex-1 border border-mist rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy resize-none"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {sending ? t('chat.sending') : t('chat.send')}
        </button>
      </form>
    </div>
  )
}
