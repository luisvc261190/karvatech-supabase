import { useEffect, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  NotebookPen,
  RefreshCw,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import { deleteMessage, messages, patchMessage, sendReply } from './api'

const STATUS_CFG = {
  nuevo: { label: 'Nuevo', cls: 'nu' },
  contactado: { label: 'Contactado', cls: 'co' },
  cerrado: { label: 'Cerrado', cls: 'ce' },
}

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'nuevo', label: 'Nuevos' },
  { key: 'contactado', label: 'Respondidos' },
  { key: 'cerrado', label: 'Archivados' },
]

function fullName(m) {
  return [m.name, m.lastName].filter(Boolean).join(' ')
}

function initials(value) {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean)
  const text = parts.length >= 2 ? parts[0][0] + parts[1][0] : (value || '?').slice(0, 1)
  return (text || '?').toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtRowDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function MessageRow({ m, active, onClick }) {
  const cfg = STATUS_CFG[m.status] || STATUS_CFG.nuevo
  const name = fullName(m) || 'Cliente'
  return (
    <button className={`kt-msg-row ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="kt-round">{initials(m.name)}</span>
      <div className="kt-msg-row-copy">
        <div className="kt-msg-row-top">
          <strong>{name.toUpperCase()}</strong>
          <time>{fmtRowDate(m.createdAt)}</time>
        </div>
        <span className="kt-msg-row-mail">{m.email}</span>
        <div className="kt-msg-row-foot">
          <span className="kt-msg-row-sector">
            {[m.sector, m.company].filter(Boolean).join(' · ') || 'Sin datos'}
          </span>
          <span className={`kt-badge ${cfg.cls}`}>{cfg.label}</span>
        </div>
      </div>
    </button>
  )
}

function MessageReader({ m, busy, onRemove, onSave, onSend }) {
  const [reply, setReply] = useState(m.replyBody || '')
  const [notes, setNotes] = useState(m.adminNotes || '')
  const [status, setStatus] = useState(m.status)
  const [flash, setFlash] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const savedNotice = (label) => {
    setFlash(label)
    setTimeout(() => setFlash(''), 2600)
  }

  const cfg = STATUS_CFG[m.status] || STATUS_CFG.nuevo
  const name = fullName(m) || 'Sin nombre'
  const first = m.name || 'Cliente'

  const mailtoHref = [
    `mailto:${encodeURIComponent(m.email || '')}`,
    `?subject=${encodeURIComponent('Respuesta de KARVATECH')}`,
    `&body=${encodeURIComponent(
      `Hola ${first},\n\n${reply}\n\n\n--\nEquipo KARVATECH\ncontacto@karvatech.com`,
    )}`,
  ].join('')

  const send = async () => {
    if (sending) return
    if (!reply.trim()) {
      setSendError('Escribe la respuesta antes de enviar.')
      return
    }
    setSending(true)
    setSendError('')
    try {
      await onSend(reply)
    } catch (err) {
      setSendError(err.message || 'No se pudo enviar. Usa “Abrir en tu correo”.')
    } finally {
      setSending(false)
    }
  }

  return (
    <article className="kt-reader">
      <header className="kt-reader-head">
        <div className="kt-reader-title">
          <span className={`kt-badge ${cfg.cls}`}>{cfg.label}</span>
          <h3>{name}</h3>
          <time>{fmtDate(m.createdAt)}</time>
        </div>
        <div className="kt-reader-actions">
          <label className="kt-select">
            <span>Estado</span>
            <select
              value={status}
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value)
                onSave({ status: e.target.value })
              }}
            >
              <option value="nuevo">Nuevo</option>
              <option value="contactado">Contactado</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </label>
          <button
            className="kt-btn kt-btn-ghost-red"
            disabled={busy}
            onClick={() => onRemove(m.id)}
          >
            <Trash2 size={15} />
            Eliminar
          </button>
        </div>
      </header>

      <div className="kt-msg-meta">
        {m.email && (
          <span>
            <Mail size={13} />
            <a href={`mailto:${m.email}`}>{m.email}</a>
          </span>
        )}
        {m.phone && (
          <span>
            <User size={13} />
            {m.phone}
          </span>
        )}
        {m.company && (
          <span>
            <Building2 size={13} />
            {[m.company, m.position].filter(Boolean).join(' · ')}
          </span>
        )}
        {[m.sector, m.employees, m.country].filter(Boolean).length > 0 && (
          <span>
            <User size={13} />
            {[m.sector, m.employees, m.country].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      <p className="kt-msg-pain">{m.pain}</p>

      <div className="kt-msg-notes">
        <label className="kt-field">
          <span>
            <Send size={13} />
            Respuesta al cliente
          </span>
          <textarea
            rows={5}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Redacta la respuesta que enviarás a este cliente…"
          />
          <div className="kt-reply-actions">
            <button className="kt-btn kt-btn-primary" disabled={sending} onClick={send}>
              {sending ? <Loader2 className="kt-spin" size={15} /> : <Send size={15} />}
              {sending ? 'Enviando…' : 'Enviar respuesta'}
            </button>
            {m.email && reply.trim() ? (
              <a className="kt-btn" href={mailtoHref} target="_blank" rel="noreferrer">
                <Mail size={15} />
                Abrir en tu correo
              </a>
            ) : null}
            <button
              className="kt-btn kt-btn-ghost"
              disabled={busy}
              onClick={() => {
                onSave({ replyBody: reply })
                savedNotice('Respuesta guardada')
              }}
            >
              Guardar borrador
            </button>
          </div>
          {sendError && <p className="kt-error">{sendError}</p>}
          {m.replySentAt && (
            <span className="kt-msg-sent">
              <CheckCircle2 size={13} />
              Respondido el {fmtDate(m.replySentAt)}
            </span>
          )}
        </label>

        <label className="kt-field">
          <span>
            <NotebookPen size={13} />
            Notas internas
          </span>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas solo para tu equipo…"
          />
          <button
            className="kt-btn kt-btn-ghost"
            disabled={busy}
            onClick={() => {
              onSave({ adminNotes: notes })
              savedNotice('Notas guardadas')
            }}
          >
            Guardar notas
          </button>
        </label>
      </div>

      {flash && <p className="kt-flash">{flash}</p>}
    </article>
  )
}

export default function MessagesView() {
  const PAGE = 50
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [moreError, setMoreError] = useState('')
  const [filter, setFilter] = useState('todos')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [sent, setSent] = useState(null)

  const hasMore = total > items.length
  const selected = items.find((i) => i.id === selectedId) || null

  useEffect(() => {
    if (selectedId != null && !items.some((i) => i.id === selectedId)) {
      setSelectedId(null)
    }
  }, [items, selectedId])

  const fetchPage = (reset, statusFilter, offset, silent = false) => {
    const status = statusFilter && statusFilter !== 'todos' ? statusFilter : ''

    if (reset) {
      if (!silent) setLoading(true)
      setError(false)
    } else {
      setLoadingMore(true)
      setMoreError('')
    }

    return messages({ limit: PAGE, offset: reset ? 0 : offset, status })
      .then((data) => {
        const chunk = data.items || []
        setItems(reset ? chunk : (prev) => [...prev, ...chunk])
        setTotal(data.total || 0)
        setCounts(data.counts || {})
      })
      .catch(() => {
        if (reset) setError(true)
        else setMoreError('No pudimos cargar más mensajes.')
      })
      .finally(() => {
        setLoading(false)
        setLoadingMore(false)
      })
  }

  const reload = (silent = false) => fetchPage(true, filter, 0, silent)

  useEffect(() => {
    fetchPage(true, filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    fetchPage(false, filter, items.length)
  }

  const savePatch = async (id, patch) => {
    setBusy(true)
    try {
      await patchMessage(id, patch)
      reload(true)
    } finally {
      setBusy(false)
    }
  }

  const sendMessageReply = async (id, replyBody) => {
    const item = items.find((i) => i.id === id)
    setBusy(true)
    try {
      await sendReply(id, replyBody)
      setSent({
        email: item?.email || fullName(item) || 'Cliente',
        name: item ? fullName(item) : 'Cliente',
      })
      reload(true)
    } finally {
      setBusy(false)
    }
  }

  const removeMessage = async (id) => {
    if (busy) return
    if (!window.confirm('¿Eliminar este mensaje de forma permanente?')) return
    setBusy(true)
    try {
      await deleteMessage(id)
      reload(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="kt-view kt-msgs">
      <header className="kt-view-head kt-msgs-head">
        <div>
          <p className="kt-eyebrow">BANDEJA DE ENTRADA</p>
          <h1>Mensajes de clientes</h1>
          <p className="kt-view-sub">
            Contactos que llegan desde el formulario “Hablemos” del sitio.
          </p>
        </div>
        <button className="kt-btn kt-btn-ghost" onClick={reload}>
          <RefreshCw size={15} />
          Refrescar
        </button>
      </header>

      <div className="kt-msgs-toolbar" role="tablist" aria-label="Filtrar mensajes">
        {FILTERS.map((f) => {
          const count = f.key === 'todos' ? total : counts[f.key] || 0
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`kt-tab kt-tab-count ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              <strong>{f.label}</strong>
              <span>{count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="kt-empty">
          <Loader2 className="kt-spin" size={22} />
          Cargando mensajes…
        </div>
      ) : error ? (
        <div className="kt-empty">
          <p>No pudimos cargar la bandeja.</p>
          <button className="kt-btn kt-btn-primary" onClick={reload}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="kt-msgs-split">
          <aside className="kt-msgs-list" aria-label="Lista de mensajes">
            {items.length === 0 ? (
              <div className="kt-empty kt-empty-list">
                <Inbox size={30} />
                <p>No hay mensajes en este filtro.</p>
              </div>
            ) : (
              <>
                {items.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    active={m.id === selectedId}
                    onClick={() => setSelectedId(m.id)}
                  />
                ))}
                {hasMore && (
                  <div className="kt-more">
                    <button className="kt-btn kt-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? <Loader2 className="kt-spin" size={15} /> : null}
                      {loadingMore
                        ? 'Cargando más…'
                        : `Cargar más (${items.length} de ${total})`}
                    </button>
                    {moreError && <p className="kt-error kt-more-error">{moreError}</p>}
                  </div>
                )}
              </>
            )}
          </aside>

          <div className="kt-msgs-reader">
            {selected ? (
              <MessageReader
                key={selected.id}
                m={selected}
                busy={busy}
                onRemove={removeMessage}
                onSave={(patch) => savePatch(selected.id, patch)}
                onSend={(replyBody) => sendMessageReply(selected.id, replyBody)}
              />
            ) : (
              <div className="kt-reader-empty">
                <MailOpen size={34} />
                <p>Selecciona un mensaje para leerlo y responderlo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {sent && (
        <div
          className="kt-modal kt-sent"
          role="dialog"
          aria-modal="true"
          aria-label="Respuesta enviada"
        >
          <div className="kt-modal-backdrop" onClick={() => setSent(null)} />
          <div className="kt-modal-card kt-sent-card">
            <span className="kt-sent-badge">
              <CheckCircle2 size={32} />
            </span>
            <h3>Respuesta enviada</h3>
            <p className="kt-sent-lead">
              Tu mensaje llegó al correo de <strong>{sent.email}</strong> con el asunto{' '}
              “Respuesta de KARVATECH”.
            </p>
            <p className="kt-sent-note">
              La respuesta quedó guardada en la conversación y el mensaje se marcó como
              contactado.
            </p>
            <button className="kt-btn kt-btn-primary kt-sent-btn" onClick={() => setSent(null)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </section>
  )
}