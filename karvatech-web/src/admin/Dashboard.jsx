import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { summary } from './api'

const STATUS_CFG = {
  nuevo: { label: 'Nuevo', cls: 'nu' },
  contactado: { label: 'Contactado', cls: 'co' },
  cerrado: { label: 'Cerrado', cls: 'ce' },
}

function fmtShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fullName(m) {
  return [m.name, m.lastName].filter(Boolean).join(' ')
}

function initials(value) {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean)
  const text = parts.length >= 2 ? parts[0][0] + parts[1][0] : (value || '?').slice(0, 1)
  return (text || '?').toUpperCase()
}

export default function DashboardView({ onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    summary()
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) {
    return (
      <section className="kt-view">
        <div className="kt-empty">
          <Loader2 className="kt-spin" size={22} />
          Cargando resumen…
        </div>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section className="kt-view">
        <div className="kt-empty">
          <p>No pudimos cargar el resumen ejecutivo.</p>
          <button className="kt-btn kt-btn-primary" onClick={load}>
            Reintentar
          </button>
        </div>
      </section>
    )
  }

  const stats = [
    { value: data.projectsTotal, label: 'Proyectos totales', cls: 'ink' },
    { value: data.projectsPortfolio, label: 'En portafolio', cls: 'ink' },
    { value: data.messagesNew, label: 'Mensajes nuevos', cls: 'amber' },
    { value: data.messagesReplied, label: 'Solicitudes respondidas', cls: 'green' },
  ]

  return (
    <section className="kt-view kt-dash">
      <header className="kt-view-head">
        <div>
          <p className="kt-eyebrow">RESUMEN EJECUTIVO</p>
          <h1>Resumen ejecutivo</h1>
          <p className="kt-view-sub">El pulso de KARVATECH, en un vistazo.</p>
        </div>
        <button className="kt-btn kt-btn-ghost" onClick={load} aria-label="Refrescar resumen">
          <RefreshCw size={15} />
          Refrescar
        </button>
      </header>

      <p className="kt-dash-live">
        <span className="kt-live-dot" />
        EN VIVO
      </p>

      <div className="kt-stat-grid">
        {stats.map((s) => (
          <div className="kt-stat-card" key={s.label}>
            <strong className={s.cls}>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <section className="kt-dash-sec">
        <div className="kt-dash-sec-head">
          <h2>
            <Sparkles size={16} />
            Destacados en portafolio
          </h2>
          <button className="kt-dash-link" onClick={() => onNavigate('proyectos')}>
            Gestionar
            <ArrowRight size={14} />
          </button>
        </div>

        {data.featured.length === 0 ? (
          <div className="kt-dash-empty">Aún no hay proyectos destacados.</div>
        ) : (
          <div className="kt-feat-grid">
            {data.featured.map((p) => (
              <article className="kt-feat-card" key={p.id} onClick={() => onNavigate('proyectos')}>
                <span className="kt-feat-tile" style={{ background: p.accent }}>
                  {p.title.charAt(0)}
                </span>
                <div className="kt-feat-info">
                  <h3>{p.title}</h3>
                  <p>{[p.category, p.client].filter(Boolean).join(' · ') || 'Sin etiqueta'}</p>
                  <span>{fmtShort(p.updatedAt || p.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="kt-dash-sec">
        <div className="kt-dash-sec-head">
          <h2>
            <Mail size={16} />
            Últimos mensajes de clientes
          </h2>
          <button className="kt-dash-link" onClick={() => onNavigate('mensajes')}>
            Ver todos
            <ArrowRight size={14} />
          </button>
        </div>

        {data.recent.length === 0 ? (
          <div className="kt-dash-empty">Aún no hay mensajes de clientes.</div>
        ) : (
          <div className="kt-recent-list">
            {data.recent.map((m) => {
              const cfg = STATUS_CFG[m.status] || STATUS_CFG.nuevo
              return (
                <article className="kt-recent" key={m.id} onClick={() => onNavigate('mensajes')}>
                  <span className="kt-round">{initials(m.name)}</span>
                  <div className="kt-recent-copy">
                    <strong>{fullName(m).toUpperCase() || 'CLIENTE'}</strong>
                    <span>{m.email}</span>
                  </div>
                  <span className={`kt-badge ${cfg.cls}`}>{cfg.label}</span>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}