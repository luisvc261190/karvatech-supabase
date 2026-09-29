import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// Ya no hay proxy a /api ni a /static: la base de datos, el Auth, el Storage y
// las Edge Functions viven en Supabase y el navegador los alcanza por su
// dominio. El cliente de supabase-js usa VITE_SUPABASE_URL, así que si algún día
// hay CORS raro se resuelve con el dominio del sitio en Supabase → Authentication
// → URL Configuration, no con un proxy de desarrollo.
export default defineConfig({
  plugins: [react()],
})
