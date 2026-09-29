import { getSupabase, isConfigured } from '../lib/supabase'

// Capa de datos del panel, ahora sobre supabase-js en lugar de fetch a FastAPI.
//
// Los componentes no cambian: esta capa sigue entregando camelCase y sigue
// lanzando Error con `err.status`, igual que hacía el wrapper http anterior. El
// mapeo con las columnas snake_case de Postgres vive aquí, en un solo sitio.
//
// La seguridad no está en este archivo: está en el RLS. Cada consulta va con la
// publishable key, así que si una política no permite la operación, Supabase
// responde 401/403 y lo tratamos como error normal.

const IMAGES_BUCKET = 'project-images'
const PAGE_SIZE = 50
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// ---------------------------------------------------------------------------
// Mapeo Postgres <-> componentes
// ---------------------------------------------------------------------------

export function toMessageRow(m) {
  return {
    id: m.id,
    name: m.name,
    lastName: m.last_name || '',
    email: m.email,
    company: m.company || '',
    position: m.position || '',
    phone: m.phone || '',
    sector: m.sector || '',
    employees: m.employees || '',
    country: m.country || '',
    pain: m.pain || '',
    status: m.status,
    replyBody: m.reply_body || '',
    replySentAt: m.reply_sent_at,
    adminNotes: m.admin_notes || '',
    createdAt: m.created_at,
  }
}

export function toProjectRow(p) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle || '',
    category: p.category || '',
    client: p.client || '',
    industry: p.industry || '',
    summary: p.summary || '',
    description: p.description || '',
    quote: p.quote || '',
    authorName: p.author_name || '',
    authorRole: p.author_role || '',
    imageUrl: p.image_url || '',
    accent: p.accent || '#16a34a',
    year: p.year || '',
    tags: p.tags || [],
    status: p.status || 'borrador',
    featured: !!p.featured,
    sortOrder: p.sort_order ?? 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

function messagePatchToRow(patch) {
  const row = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.replyBody !== undefined) {
    row.reply_body = patch.replyBody.trim()
    // El backend marcaba la fecha solo al guardar texto, y la borraba al vaciar.
    row.reply_sent_at = patch.replyBody.trim() ? new Date().toISOString() : null
  }
  if (patch.adminNotes !== undefined) row.admin_notes = patch.adminNotes.trim()
  return row
}

export function projectPayloadToRow(f) {
  return {
    slug: f.slug ?? slugify(f.title),
    title: f.title.trim(),
    subtitle: (f.subtitle || '').trim(),
    category: (f.category || '').trim(),
    client: (f.client || '').trim(),
    industry: (f.industry || '').trim(),
    summary: (f.summary || '').trim(),
    description: (f.description || '').trim(),
    quote: (f.quote || '').trim(),
    author_name: (f.authorName || '').trim(),
    author_role: (f.authorRole || '').trim(),
    image_url: (f.imageUrl || '').trim(),
    accent: f.accent || '#16a34a',
    year: (f.year || '').trim(),
    tags: cleanTags(f.tags || []),
    status: f.status || 'publicado',
    featured: !!f.featured,
    sort_order: Number(f.sortOrder) || 0,
  }
}

// ---------------------------------------------------------------------------
// Utilidades de texto (venían de db.py)
// ---------------------------------------------------------------------------

export function slugify(title) {
  const value = (title || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const slug = value
    .replace(/[^a-z0-9ñü]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'proyecto'
}
export function cleanTags(tags) {
  const out = []
  for (const tag of tags || []) {
    const t = String(tag).replace(/\s+/g, ' ').trim().replace(/,+$/, '')
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 8)
}

// El índice único de slug es nuevo en Supabase, así que ahora sí puede
// colisionar. En vez de dejar que reviente el insert, le pegamos un sufijo.
async function uniqueSlug(title, excludeId) {
  const base = slugify(title)
  let candidate = base
  for (let n = 2; n < 50; n += 1) {
    const { data, error } = await getSupabase()
      .from('projects')
      .select('id')
      .eq('slug', candidate)
      .limit(1)
    if (error) throw error
    const taken = (data || []).some((row) => row.id !== excludeId)
    if (!taken) return candidate
    candidate = `${base}-${n}`
  }
  return `${base}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Utilidades de error
// ---------------------------------------------------------------------------

function wrap(error, fallback) {
  if (!error) return error
  const err = new Error(error.message || fallback)
  err.status = error.status || error.statusCode || 0
  return err
}

// Los conteos se piden con head:true para no traer filas que solo vamos a
// contar. status_counts replica el group_by que hacía el backend.
async function countOf(table, build) {
  const { count, error } = await build(getSupabase().from(table).select('*', { count: 'exact', head: true }))
  if (error) throw wrap(error, 'No pudimos leer los datos')
  return count || 0
}

async function statusCounts() {
  const counts = { nuevo: 0, contactado: 0, cerrado: 0 }
  const [nuevo, contactado, cerrado] = await Promise.all([
    countOf('messages', (q) => q.eq('status', 'nuevo')),
    countOf('messages', (q) => q.eq('status', 'contactado')),
    countOf('messages', (q) => q.eq('status', 'cerrado')),
  ])
  counts.nuevo = nuevo
  counts.contactado = contactado
  counts.cerrado = cerrado
  return counts
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export function configError() {
  return isConfigured
    ? null
    : 'Supabase no está configurado: faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.'
}

// Devuelve el perfil del admin, o null si no hay sesión / no es admin.
export async function me() {
  const sb = getSupabase()
  const { data: sessionData, error: sessionError } = await sb.auth.getSession()
  if (sessionError || !sessionData.session?.user) return null

  const user = sessionData.session.user
  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, display_name, is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw wrap(error, 'No pudimos leer tu perfil')

  // Una sesión válida pero sin is_admin no entra al panel. Se devuelve null en
  // vez de un objeto con isAdmin: false para que AdminApp pueda decidir solo
  // con `if (!user)`, y para no dejar abierta una sesión que no puede hacer nada.
  if (!profile?.is_admin) return null

  return {
    id: user.id,
    username: user.email,
    name: profile.display_name || user.user_metadata?.display_name || user.email,
    isAdmin: true,
  }
}

// Supabase Auth trabaja con correo, no con nombre de usuario.
export async function login(email, password) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) {
    // Mensaje genérico a propósito: no revelamos si el correo existe.
    throw new Error('Credenciales inválidas')
  }
  const profile = await me()
  if (!profile?.isAdmin) {
    // Autenticado pero sin permisos: cortamos la sesión de inmediato.
    await getSupabase().auth.signOut()
    throw new Error('Esta cuenta no tiene acceso al panel administrativo.')
  }
  return profile
}

export async function logout() {
  await getSupabase().auth.signOut()
}

// Exigir la contraseña actual es la única forma de conservar esa garantía: el
// updateUser de Supabase no la pide. Reautenticamos primero y solo después
// cambiamos la clave.
export async function changePassword(currentPassword, newPassword) {
  const sb = getSupabase()
  const { data: sessionData } = await sb.auth.getSession()
  const email = sessionData.session?.user?.email
  if (!email) throw new Error('Tu sesión expiró. Vuelve a entrar.')

  const { error: reauthError } = await sb.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (reauthError) throw new Error('La contraseña actual es incorrecta')

  if (newPassword === currentPassword) {
    throw new Error('La nueva contraseña debe ser distinta a la actual')
  }

  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) throw wrap(error, 'No se pudo cambiar la contraseña')
}

// ---------------------------------------------------------------------------
// Resumen del dashboard
// ---------------------------------------------------------------------------

export async function summary() {
  const sb = getSupabase()
  const [projectsTotal, projectsPortfolio, counts, messagesReplied, featured, recent] =
    await Promise.all([
      countOf('projects', (q) => q),
      countOf('projects', (q) => q.neq('status', 'borrador')),
      statusCounts(),
      countOf('messages', (q) => q.not('reply_sent_at', 'is', null)),
      sb
        .from('projects')
        .select('*')
        .eq('featured', true)
        .neq('status', 'borrador')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: false })
        .limit(6),
      sb
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(6),
    ])

  if (featured.error) throw wrap(featured.error, 'No pudimos cargar el resumen')
  if (recent.error) throw wrap(recent.error, 'No pudimos cargar el resumen')

  return {
    projectsTotal,
    projectsPortfolio,
    messagesNew: counts.nuevo,
    messagesReplied,
    featured: (featured.data || []).map(toProjectRow),
    recent: (recent.data || []).map(toMessageRow),
  }
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

export async function messages({ limit = PAGE_SIZE, offset = 0, status = '' } = {}) {
  let query = getSupabase()
    .from('messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) throw wrap(error, 'No pudimos cargar los mensajes')

  const counts = await statusCounts()

  return {
    items: (data || []).map(toMessageRow),
    // `count` es el total real de lo que devuelve la consulta con su filtro.
    total: count ?? 0,
    offset,
    limit,
    counts,
  }
}

export async function patchMessage(id, patch) {
  const { data, error } = await getSupabase()
    .from('messages')
    .update(messagePatchToRow(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw wrap(error, 'No pudimos actualizar el mensaje')
  return toMessageRow(data)
}

export async function deleteMessage(id) {
  const { error } = await getSupabase().from('messages').delete().eq('id', id)
  if (error) throw wrap(error, 'No pudimos eliminar el mensaje')
  return { status: 'ok', id }
}

// El envío necesita la clave SMTP, que no puede estar en el navegador: va a la
// Edge Function, que además valida que quien llama sea admin.
export async function sendReply(id, replyBody) {
  const { data, error } = await getSupabase().functions.invoke('send-reply', {
    body: { id, replyBody },
  })
  if (error) {
    throw new Error(
      error.message ||
        (error.status === 503
          ? 'SMTP no configurado. Usa el enlace "Abrir en tu correo" mientras tanto.'
          : 'No se pudo enviar la respuesta.'),
    )
  }
  return data?.message ? toMessageRow(data.message) : null
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export async function projects({ limit = 200, offset = 0 } = {}) {
  const { data, error, count } = await getSupabase()
    .from('projects')
    .select('*', { count: 'exact' })
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw wrap(error, 'No pudimos cargar los proyectos')
  return { items: (data || []).map(toProjectRow), total: count ?? 0 }
}

export async function createProject(payload) {
  const row = { ...projectPayloadToRow(payload) }
  row.slug = await uniqueSlug(payload.title)
  const { data, error } = await getSupabase().from('projects').insert(row).select().single()
  if (error) throw wrap(error, 'No se pudo guardar el proyecto')
  return toProjectRow(data)
}

export async function updateProject(id, payload) {
  const row = { ...projectPayloadToRow(payload) }
  row.slug = await uniqueSlug(payload.title, id)
  const { data, error } = await getSupabase()
    .from('projects')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error) throw wrap(error, 'No se pudo guardar el proyecto')
  return toProjectRow(data)
}

export async function deleteProject(id) {
  const { error } = await getSupabase().from('projects').delete().eq('id', id)
  if (error) throw wrap(error, 'No pudimos eliminar el proyecto')
  return { status: 'ok', id }
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

// Sube a Supabase Storage y devuelve la URL pública. El bucket está configurado
// con los mismos límites que tenía el endpoint de subida: 4 MB y solo JPG, PNG,
// WEBP o GIF. A diferencia del backend anterior no se puede comprobar la firma
// mágica del archivo: esa validación era de FastAPI y aquí solo llega el MIME
// declarado. Por eso el bucket no admite SVG ni HTML.
export async function uploadImage(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Solo se admiten imágenes JPG, PNG, WEBP o GIF')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('El archivo supera el límite de 4 MB')
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  const rand = Math.random().toString(16).slice(2, 8)
  const path = `proy_${stamp}_${rand}.${ext || 'jpg'}`

  const sb = getSupabase()
  const { error } = await sb.storage
    .from(IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw wrap(error, 'No se pudo subir la imagen')

  const { data } = sb.storage.from(IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
