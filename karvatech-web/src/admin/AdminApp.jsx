import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { configError, logout, me } from './api'
import ChangePassword from './ChangePassword'
import DashboardView from './Dashboard'
import Login from './Login'
import MessagesView from './Messages'
import ProjectsView from './Projects'

function adminInitials(user) {
  const name = (user.name || user.username || 'A').trim()
  const parts = name.split(/\s+/).filter((p) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(p))
  const text = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return text.toUpperCase()
}

export default function AdminApp() {
  const [user, setUser] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState('resumen')
  const [passOpen, setPassOpen] = useState(false)
  const config = configError()

  useEffect(() => {
    let alive = true
    me()
      .then((profile) => alive && setUser(profile))
      .catch(() => alive && setUser(false))
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  // Solo reaccionó a cierres de sesión (otra pestaña, expiración, token
  // revocado). No volvemos a pedir el perfil en cada cambio: dentro de
  // onAuthStateChange no se pueden lanzar consultas a Supabase porque se
  // bloquean esperando al propio refresco del token.
  useEffect(() => {
    if (!supabase) return undefined
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') setUser(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const leave = async () => {
    await logout()
    setUser(false)
  }

  if (config) {
    return (
      <div className="kt-loading">
        <AlertTriangle size={22} />
        <span>{config}</span>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="kt-loading">
        <Loader2 className="kt-spin" size={22} />
        <span>Cargando panel…</span>
      </div>
    )
  }

  if (!user) return <Login onSuccess={setUser} />

  return (
    <div className="kt">
      <aside className="kt-side">
        <a className="kt-logo" href="#/">
          <span className="kt-brand-mark">K</span>
          <span className="kt-logo-text">
            KARVA<span>TECH</span>
          </span>
        </a>

        <nav className="kt-nav" aria-label="Secciones del panel">
          <button
            className={`kt-nav-btn ${view === 'resumen' ? 'active' : ''}`}
            onClick={() => setView('resumen')}
          >
            <LayoutDashboard size={17} />
            Resumen
          </button>
          <button
            className={`kt-nav-btn ${view === 'proyectos' ? 'active' : ''}`}
            onClick={() => setView('proyectos')}
          >
            <FolderKanban size={17} />
            Proyectos
          </button>
          <button
            className={`kt-nav-btn ${view === 'mensajes' ? 'active' : ''}`}
            onClick={() => setView('mensajes')}
          >
            <MessageSquareText size={17} />
            Mensajes
          </button>
        </nav>

        <div className="kt-side-foot">
          <div className="kt-user">
            <span className="kt-avatar">{adminInitials(user)}</span>
            <span>{user.name || user.username}</span>
          </div>
          <a className="kt-side-link" href="#/">
            <ExternalLink size={14} />
            Ver sitio público
          </a>
          <button className="kt-side-link" onClick={() => setPassOpen(true)}>
            <KeyRound size={14} />
            Cambiar contraseña
          </button>
          <button className="kt-side-link kt-danger" onClick={leave}>
            <LogOut size={14} />
            Cerrar sesión
          </button>
          <p className="kt-side-note">
            <ShieldCheck size={12} />
            Sesión protegida · Supabase Auth + RLS
          </p>
        </div>
      </aside>

      <main className="kt-main">
        <header className="kt-topbar">
          <span className="kt-top-avatar">{adminInitials(user)}</span>
          <div className="kt-top-copy">
            <strong>Administrador</strong>
            <span>
              {user.name || user.username} · KARVATECH
            </span>
          </div>
        </header>

        {view === 'resumen' ? (
          <DashboardView user={user} onNavigate={setView} />
        ) : view === 'mensajes' ? (
          <MessagesView />
        ) : (
          <ProjectsView />
        )}
      </main>

      {passOpen && (
        <ChangePassword
          onClose={() => setPassOpen(false)}
          onChanged={() => {
            setPassOpen(false)
            setUser(false)
          }}
        />
      )}
    </div>
  )
}
