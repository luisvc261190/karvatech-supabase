import { useState } from 'react'
import { ArrowRight, KeyRound, Loader2, Lock, User } from 'lucide-react'
import { login } from './api'

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const user = await login(email.trim(), password)
      onSuccess(user)
    } catch (err) {
      setError(err.message || 'No pudimos iniciar sesión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kt-login">
      <aside className="kt-login-art">
        <a className="kt-brand" href="#/">
          <span className="kt-brand-mark">K</span>
          <span className="kt-brand-text">
            KARVA<span>TECH</span>
          </span>
        </a>

        <div className="kt-login-art-media">
          <img src="/images/gifs/dev-code.gif" alt="Equipo de desarrollo de KARVATECH" />
        </div>

        <div className="kt-login-art-copy">
          <p className="kt-eyebrow">PANEL ADMINISTRATIVO</p>
          <h1>
            Control total de tu
            <span>operación digital.</span>
          </h1>
          <p>
            Gestiona proyectos, atiende solicitudes y mantén tu catálogo al día desde
            un solo lugar.
          </p>
        </div>
      </aside>

      <main className="kt-login-form">
        <div className="kt-login-card">
          <span className="kt-login-icon">
            <Lock size={20} />
          </span>
          <h2>Bienvenido de nuevo</h2>
          <p className="kt-login-sub">Ingresa tus credenciales de administrador.</p>

          <form onSubmit={submit} noValidate>
            <label className="kt-field">
              <span>Correo</span>
              <div className="kt-input-wrap">
                <User size={16} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@karvatech.com"
                  required
                />
              </div>
            </label>

            <label className="kt-field">
              <span>Contraseña</span>
              <div className="kt-input-wrap">
                <KeyRound size={16} />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </label>

            {error && (
              <p className="kt-error" role="alert">
                {error}
              </p>
            )}

            <button className="kt-btn kt-btn-primary kt-login-btn" disabled={busy} type="submit">
              {busy ? <Loader2 className="kt-spin" size={17} /> : 'Entrar al panel'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <a className="kt-login-back" href="#/">
            Volver al sitio web
          </a>
        </div>
      </main>
    </div>
  )
}