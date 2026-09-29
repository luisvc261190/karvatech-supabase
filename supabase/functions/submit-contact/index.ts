// KARVATECH · submit-contact
//
// Recibe el formulario público "Hablemos" y lo guarda en public.messages.
//
// Existe como Edge Function y no como insert directo desde el navegador por un
// motivo concreto: el insert directo obligaría a abrir un INSERT al rol `anon`,
// y con la publishable key a la vista cualquiera podría meter miles de filas
// falsas. Aquí la tabla no tiene ninguna política para `anon`, así que esta
// función es el único camino de entrada y es el sitio donde viven el honeypot y
// el rate limit.
//
// Variables que espera (ninguna obligatoria):
//   RATE_LIMIT_MAX      envíos por ventana, por IP. Por defecto 5.
//   RATE_LIMIT_WINDOW   ventana en minutos. Por defecto 60.

import { createClient } from 'npm:@supabase/supabase-js@2'

const RATE_LIMIT_MAX = Number(Deno.env.get('RATE_LIMIT_MAX') || '5')
const RATE_LIMIT_WINDOW_MIN = Number(Deno.env.get('RATE_LIMIT_WINDOW') || '60')

// Mismo mensaje para todos los fallos de validación: no le damos pistas al bot
// sobre qué campo le falta.
const GENERIC_OK = {
  status: 'success',
  message: 'Solicitud recibida, te contactaremos pronto.',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// Devuelve null si todo válido, o el nombre del primer campo inválido.
function validate(raw) {
  const name = text(raw.name, 120)
  const email = text(raw.email, 200).toLowerCase()
  const pain = text(raw.pain, 4000)

  if (name.length < 2) return 'name'
  if (email.length > 200 || !EMAIL_RE.test(email)) return 'email'
  if (pain.length < 5) return 'pain'

  return null
}

function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'desconocido'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  let raw
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }
  if (!raw || typeof raw !== 'object') {
    return json({ error: 'Cuerpo inválido' }, 400)
  }

  // Honeypot: campo oculto que un humano no ve. Si viene relleno, es un bot.
  // Respondemos igual que un envío correcto para que el bot no aprenda.
  if (text(raw.website, 200)) {
    console.log('contacto descartado por honeypot desde', clientIp(req))
    return json(GENERIC_OK, 201)
  }

  const invalid = validate(raw)
  if (invalid) {
    return json({ error: 'Revisa los campos del formulario.', field: invalid }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Rate limit atómico en la base: sobrevive a varias instancias de la función.
  const { data: allowed, error: rateError } = await supabase.rpc(
    'check_contact_rate_limit',
    {
      p_ip: clientIp(req),
      p_max: RATE_LIMIT_MAX,
      p_window: `${RATE_LIMIT_WINDOW_MIN} minutes`,
    },
  )

  if (rateError) {
    console.error('rate limit no se pudo evaluar:', rateError.message)
    // Fail closed: si no podemos comprobar el límite, no dejamos escribir.
    return json({ error: 'No pudimos registrar tu solicitud. Inténtalo en un momento.' }, 503)
  }
  if (!allowed) {
    return json(
      { error: 'Demasiados envíos desde esta conexión. Inténtalo más tarde.' },
      429,
    )
  }

  const { error } = await supabase.from('messages').insert({
    name: text(raw.name, 120),
    last_name: text(raw.lastName, 120),
    email: text(raw.email, 200).toLowerCase(),
    company: text(raw.company, 120),
    position: text(raw.position, 120),
    phone: text(raw.phone, 120),
    sector: text(raw.sector, 120),
    employees: text(raw.employees, 120),
    country: text(raw.country, 120),
    pain: text(raw.pain, 4000),
  })

  if (error) {
    console.error('insert fallido:', error.message)
    return json({ error: 'No pudimos registrar tu solicitud. Inténtalo en un momento.' }, 500)
  }

  console.log('nuevo contacto:', text(raw.name, 120), '<', text(raw.email, 200), '>')
  return json(GENERIC_OK, 201)
})
