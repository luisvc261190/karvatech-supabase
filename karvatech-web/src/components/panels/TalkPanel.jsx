import { useState } from 'react'
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  CalendarCheck,
  MessageCircle,
  Lock,
} from 'lucide-react'
import TechCanvas from '../TechCanvas'
import ScheduleModal from '../ScheduleModal'
import { getSupabase } from '../../lib/supabase'

const sectors = [
  'Retail y e-commerce',
  'Salud',
  'Logística y transporte',
  'Educación',
  'Finanzas',
  'Manufactura',
  'Servicios profesionales',
  'Alimentación',
  'Construcción',
  'Otro',
]

const employees = ['1 – 10', '11 – 50', '51 – 200', '201 – 500', 'Más de 500']

const countries = ['Perú', 'Colombia', 'México', 'Chile', 'Ecuador', 'Argentina', 'Bolivia', 'Otro']

const prefixes = ['+51', '+52', '+57', '+58', '+56', '+54', '+34', '+1']

const initialForm = {
  name: '',
  lastName: '',
  email: '',
  company: '',
  position: '',
  prefix: '+51',
  phone: '',
  sector: '',
  employees: '',
  country: '',
  pain: '',
  website: '',
}

export default function TalkPanel() {
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState(null)
  const [done, setDone] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const loading = status?.type === 'loading'

  const update = (e) => {
    setStatus(null)
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const reset = () => {
    setForm(initialForm)
    setStatus(null)
    setDone(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    setStatus({ type: 'loading', text: 'Enviando tu solicitud...' })
    const payload = {
      ...form,
      phone: `${form.prefix} ${form.phone}`.trim(),
    }
    try {
      // Va a la Edge Function y no a la tabla directamente: messages no tiene
      // ninguna política de INSERT para el rol anónimo, así que la función es el
      // único camino de entrada. Ahí viven el honeypot y el rate limit.
      const { data, error } = await getSupabase().functions.invoke('submit-contact', {
        body: payload,
      })
      if (error) {
        const detail =
          data?.error || error.message || 'No se pudo enviar tu solicitud.'
        throw new Error(detail)
      }
      setDone(true)
    } catch (err) {
      setStatus({
        type: 'error',
        text: err?.message ||
          'No se pudo enviar tu solicitud. Revisa tu conexión y vuelve a intentarlo.',
      })
    }
  }

  return (
    <section className="ix-panel ix-talk-panel" id="hablemos">
      <div className="ix-film">
        <div className="ix-film-grid" />
        <TechCanvas />
      </div>
      <div className="ix-pad ix-talk-wrap">
        <div className="ix-talk-copy">
          <p className="ix-eyebrow light">
            <span aria-hidden="true" />
            EL SIGUIENTE PASO
          </p>
          <h2 className="ix-title">
            Empecemos por
            <span>entender tu negocio.</span>
          </h2>
          <p className="ix-lede">
            Cuéntanos dónde está la fricción. Juntos podemos encontrar el
            siguiente paso.
          </p>

          <button
            className="ix-cal"
            type="button"
            onClick={() => setScheduleOpen(true)}
          >
            <span className="ix-cal-icon">
              <CalendarCheck size={22} />
            </span>
            <span className="ix-cal-copy">
              <strong>Agendar reunión</strong>
              <small>
                Haz clic aquí, elige el día y la hora, y agrégalo a tu Google
                Calendar.
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>

          <div className="ix-talk-alt">
            <p>¿Todavía no puedes agendar? ¡No hay problema! Te dejamos otra opción de contacto.</p>
            <h3>Conversemos sobre tu idea</h3>
            <p>Completa el formulario y te responderemos pronto.</p>
          </div>

          <div className="ix-talk-links">
            <a href="mailto:contacto@karvatech.com">
              <Mail size={17} /> contacto@karvatech.com
            </a>
            <a href="https://wa.me/51985928062" target="_blank" rel="noopener noreferrer">
              WhatsApp · +51 999 999 999 <ArrowUpRight size={14} />
            </a>
            <span>Lima, Perú · Lun a Sáb · 9:00 – 19:00</span>
          </div>
        </div>

        {done ? (
          <div className="ix-form-done" role="status">
            <div className="ix-form-done-icon">
              <CheckCircle2 size={40} />
            </div>
            <h3>¡Diagnóstico solicitado!</h3>
            <p>
              Gracias{form.name ? `, ${form.name}` : ''}. Te escribiremos a{' '}
              <b>{form.email}</b> en menos de 24 h hábiles con tu siguiente paso.
            </p>
            <a
              className="ix-button ix-button-ghost"
              href="https://wa.me/51985928062"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} /> Prefieres WhatsApp
            </a>
            <button type="button" className="ix-link-btn" onClick={reset}>
              Enviar otra solicitud
            </button>
          </div>
        ) : (
          <form className="ix-form" onSubmit={submit}>
            <div className="ix-form-row">
              <label>
                <span>Nombre *</span>
                <input
                  required
                  minLength={2}
                  name="name"
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  value={form.name}
                  onChange={update}
                  disabled={loading}
                />
              </label>
              <label>
                <span>Apellidos *</span>
                <input
                  required
                  minLength={2}
                  name="lastName"
                  placeholder="Tus apellidos"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={update}
                  disabled={loading}
                />
              </label>
            </div>

            <div className="ix-form-row">
              <label>
                <span>Correo electrónico *</span>
                <input
                  required
                  type="email"
                  name="email"
                  placeholder="correo@empresa.com"
                  autoComplete="email"
                  value={form.email}
                  onChange={update}
                  disabled={loading}
                />
              </label>
              <label>
                <span>Empresa</span>
                <input
                  name="company"
                  placeholder="Nombre de tu empresa"
                  autoComplete="organization"
                  value={form.company}
                  onChange={update}
                  disabled={loading}
                />
              </label>
            </div>

            <div className="ix-form-row">
              <label>
                <span>Cargo</span>
                <input
                  name="position"
                  placeholder="Tu cargo o puesto"
                  autoComplete="organization-title"
                  value={form.position}
                  onChange={update}
                  disabled={loading}
                />
              </label>
              <label>
                <span>Teléfono</span>
                <div className="ix-form-phone">
                  <select
                    name="prefix"
                    value={form.prefix}
                    onChange={update}
                    disabled={loading}
                    aria-label="Código de país"
                  >
                    {prefixes.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="999 888 777"
                    autoComplete="tel-national"
                    value={form.phone}
                    onChange={update}
                    disabled={loading}
                  />
                </div>
              </label>
            </div>

            <div className="ix-form-row">
              <label>
                <span>Sector *</span>
                <select
                  required
                  name="sector"
                  value={form.sector}
                  onChange={update}
                  disabled={loading}
                >
                  <option value="" disabled>
                    Selecciona tu sector
                  </option>
                  {sectors.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nº de empleados *</span>
                <select
                  required
                  name="employees"
                  value={form.employees}
                  onChange={update}
                  disabled={loading}
                >
                  <option value="" disabled>
                    Selecciona un rango
                  </option>
                  {employees.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>País *</span>
              <select
                required
                name="country"
                value={form.country}
                onChange={update}
                disabled={loading}
              >
                <option value="" disabled>
                  Tu país
                </option>
                {countries.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Principal dolor *</span>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                name="pain"
                rows="3"
                placeholder="Ej: Gestiono todo en Excel, necesito automatizar..."
                value={form.pain}
                onChange={update}
                disabled={loading}
              />
            </label>

            {/* Honeypot: campo invisible que un humano no rellena y un bot sí.
                La Edge Function lo descarta en silencio. No usar display:none
                solo, porque algunos bots lo saltan; se oculta con position
                absolute fuera de la pantalla. */}
            <label className="ix-hp" aria-hidden="true">
              <span>NoFill</span>
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={update}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>

            {status && (
              <p className={`ix-form-status ${status.type}`}>
                {status.type === 'success' && <CheckCircle2 size={17} />}
                {status.type === 'error' && <AlertCircle size={17} />}
                {status.type === 'loading' && <Loader2 size={17} className="ix-spin" />}
                {status.text}
              </p>
            )}

            <button
              type="submit"
              className="ix-button ix-button-solid"
              disabled={loading}
            >
              <CalendarCheck size={16} />
              {loading ? 'Enviando...' : 'Solicitar Diagnóstico'}
            </button>
            <p className="ix-form-hint">
              <Lock size={13} />
              Respuesta en menos de 24 h hábiles · Tus datos se mantienen privados.
            </p>
          </form>
        )}
      </div>

      <footer className="ix-talk-foot">
        <span>© {new Date().getFullYear()} KARVATECH S.A.C. — Todos los derechos reservados.</span>
      </footer>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        defaultName={form.name}
        defaultEmail={form.email}
        defaultDetails={form.pain}
      />
    </section>
  )
}