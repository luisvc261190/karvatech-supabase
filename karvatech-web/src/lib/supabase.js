import { createClient } from '@supabase/supabase-js'

// La publishable key va incrustada en el bundle: es pública por diseño y no es
// un secreto. Lo que protege los datos es el RLS de la base (migración 0002),
// no esta key. Jamás debe usarse la service_role key aquí.

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && publishableKey)

// No Lanzamos en el import: el sitio público es una landing page y reventar el
// módulo lo dejaría en blanco. Devolvemos null y cada punto de entrada decide
// qué mostrar (los paneles públicos ya manejan error, el admin muestra un aviso).
export const supabase = isConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    })
  : null

export function getSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Define VITE_SUPABASE_URL y ' +
        'VITE_SUPABASE_PUBLISHABLE_KEY en karvatech-web/.env',
    )
  }
  return supabase
}
