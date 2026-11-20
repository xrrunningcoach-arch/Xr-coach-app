import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y rellénalo (ver README).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // PKCE: el enlace de recuperación llega como ?code=… (en query) y no como
  // #access_token=… , que chocaría con las rutas con # de HashRouter.
  auth: { flowType: 'pkce' },
})
