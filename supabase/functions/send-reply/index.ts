// KARVATECH · send-reply
//
// Guarda la respuesta a un cliente en public.messages y la envía por SMTP.
//
// Necesita credenciales de SMTP, que no pueden vivir en el navegador, así que
// esto tiene que ser una Edge Function y no una llamada directa a Supabase.
//
// Autorización en dos pasos, ambos obligatorios:
//   1. el JWT de la petición es válido (lo comprueba Supabase Auth)
//   2. el usuario tiene is_admin en public.profiles
// Un usuario autenticado que no sea admin recibe 403 antes de tocar nada.
//
// Secrets que espera (vía `supabase secrets set`):
//   SMTP_HOST        servidor, ej. smtp.gmail.com
//   SMTP_PORT        por defecto 587
//   SMTP_USER        usuario de autenticación
//   SMTP_PASSWORD    contraseña o clave de aplicación
//   SMTP_FROM        remitente; si falta se usa SMTP_USER
//   SMTP_FROM_NAME   por defecto KARVATECH
//   SMTP_USE_SSL     "1" para SMTP_SSL directo
//   SMTP_USE_TLS     "1" para STARTTLS; activo salvo que SMTP_USE_SSL=1

import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function smtpConfigured() {
  return Boolean((Deno.env.get('SMTP_HOST') || '').trim())
}

function buildTransport() {
  const host = Deno.env.get('SMTP_HOST')!.trim()
  const port = Number(Deno.env.get('SMTP_PORT') || '587')
  const useSsl = Deno.env.get('SMTP_USE_SSL') === '1'
  const useTls = !useSsl && Deno.env.get('SMTP_USE_TLS') !== '0'
  const user = Deno.env.get('SMTP_USER') || ''

  return nodemailer.createTransport({
    host,
    port,
    secure: useSsl,
    requireTLS: useTls,
    ...(user ? { auth: { user, pass: Deno.env.get('SMTP_PASSWORD') || '' } } : {}),
  })
}

function buildReplyBody(reply, firstName) {
  const salute = firstName ? `Hola ${firstName},` : 'Hola,'
  return `${salute}\n\n${reply}\n\n--\nEquipo KARVATECH\ncontacto@karvatech.com`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  // --- 1. El JWT tiene que ser válido -------------------------------------
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization) {
    return json({ error: 'No autenticado' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  })

  const { data: userData, error: authError } = await asCaller.auth.getUser()
  if (authError || !userData?.user) {
    return json({ error: 'Sesión no válida' }, 401)
  }
  const userId = userData.user.id

  // --- 2. Y tiene que ser admin -------------------------------------------
  // Leemos su propio perfil (la política "profiles: leer la propia" lo permite)
  // en lugar de llamar a is_admin(), para no depender de que auth.uid() resuelva
  // el mismo id en contexto de RPC.
  const { data: profile, error: profileError } = await asCaller
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('no se pudo leer el perfil:', profileError.message)
    return json({ error: 'No pudimos verificar tus permisos' }, 500)
  }
  if (!profile?.is_admin) {
    console.warn('acceso denegado a send-reply para', userId)
    return json({ error: 'No tienes permisos para esta acción' }, 403)
  }

  // --- 3. Validar lo que llega --------------------------------------------
  let raw
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }

  const id = Number(raw?.id)
  const replyBody = typeof raw?.replyBody === 'string' ? raw.replyBody.trim() : ''

  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Mensaje inválido' }, 400)
  }
  if (!replyBody) {
    return json({ error: 'Escribe una respuesta antes de enviar' }, 400)
  }
  if (replyBody.length > 4000) {
    return json({ error: 'La respuesta supera los 4000 caracteres' }, 400)
  }

  // A partir de aquí ya estamos en zona de confianza: uso la service_role, que
  // tiene BYPASSRLS.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  const { data: message, error: readError } = await admin
    .from('messages')
    .select('id, name, last_name, email, status')
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    console.error('lectura del mensaje fallida:', readError.message)
    return json({ error: 'No pudimos leer el mensaje' }, 500)
  }
  if (!message) {
    return json({ error: 'Mensaje no encontrado' }, 404)
  }
  if (!message.email) {
    return json({ error: 'El mensaje no tiene email de contacto' }, 400)
  }

  // --- 4. Enviar ----------------------------------------------------------
  // Mismo contrato que el backend anterior: 503 sin SMTP, 502 si el servidor de
  // correo rechaza. El panel ofrece "Abrir en tu correo" como alternativa.
  if (!smtpConfigured()) {
    return json(
      { error: 'SMTP no configurado. Usa el enlace "Abrir en tu correo" mientras tanto.' },
      503,
    )
  }

  const fromUser = Deno.env.get('SMTP_USER') || ''
  const fromAddr = (Deno.env.get('SMTP_FROM') || '').trim() || fromUser
  const fromName = (Deno.env.get('SMTP_FROM_NAME') || 'KARVATECH').trim()
  const fullName = [message.name, message.last_name].filter(Boolean).join(' ').trim() || 'Cliente'

  try {
    await buildTransport().sendMail({
      from: `${fromName} <${fromAddr}>`,
      to: fullName ? `${fullName} <${message.email}>` : message.email,
      subject: 'Respuesta de KARVATECH',
      text: buildReplyBody(replyBody, message.name || 'Cliente'),
    })
  } catch (error) {
    console.error('SMTP rechazó el envío:', error?.message ?? error)
    return json(
      { error: 'El servidor de correo rechazó el envío. Revisa la configuración SMTP.' },
      502,
    )
  }

  // --- 5. Guardar solo si el envío salió ---------------------------------
  // El status solo se toca si el mensaje seguía en "nuevo", igual que hacía el
  // backend: un mensaje ya contactado o cerrado no retrocede de estado.
  const patch = {
    reply_body: replyBody,
    reply_sent_at: new Date().toISOString(),
    ...(message.status === 'nuevo' ? { status: 'contactado' } : {}),
  }

  const { data: updated, error: updateError } = await admin
    .from('messages')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    // El correo ya salió: avisamos con claridad para que no se reenvíe a ciegas.
    console.error('correo enviado pero guardado fallido:', updateError.message)
    return json(
      { error: 'El correo se envió pero no pudimos guardar la respuesta. Revisa el panel.' },
      500,
    )
  }

  console.log(`respuesta enviada por ${userId} -> mensaje ${id} (${message.email})`)
  return json({ ok: true, message: updated })
})
