import { useEffect, useRef, useState } from 'react'
import {
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { createProject, deleteProject, projects, updateProject, uploadImage } from './api'

const STATUS_LABEL = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  en_curso: 'En curso',
  entregado: 'Entregado',
}

const STATUS_CLS = {
  borrador: 'dr',
  publicado: 'pu',
  en_curso: 'ec',
  entregado: 'et',
}

const EMPTY = {
  title: '',
  subtitle: '',
  category: '',
  client: '',
  industry: '',
  year: '',
  summary: '',
  description: '',
  quote: '',
  authorName: '',
  authorRole: '',
  imageUrl: '',
  accent: '#16a34a',
  tags: '',
  status: 'publicado',
  featured: false,
  sortOrder: 0,
}

function toForm(p) {
  return {
    title: p.title || '',
    subtitle: p.subtitle || '',
    category: p.category || '',
    client: p.client || '',
    industry: p.industry || '',
    year: p.year || '',
    summary: p.summary || '',
    description: p.description || '',
    quote: p.quote || '',
    authorName: p.authorName || '',
    authorRole: p.authorRole || '',
    imageUrl: p.imageUrl || '',
    accent: p.accent || '#16a34a',
    tags: (p.tags || []).join(', '),
    status: p.status || 'publicado',
    featured: !!p.featured,
    sortOrder: p.sortOrder || 0,
  }
}

function toPayload(f) {
  return {
    title: f.title,
    subtitle: f.subtitle,
    category: f.category,
    client: f.client,
    industry: f.industry,
    year: f.year,
    summary: f.summary,
    description: f.description,
    quote: f.quote,
    authorName: f.authorName,
    authorRole: f.authorRole,
    imageUrl: f.imageUrl,
    accent: f.accent,
    tags: f.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    status: f.status,
    featured: f.featured,
    sortOrder: Number(f.sortOrder) || 0,
  }
}

function ProjectForm({ initial, onCancel, onSaved }) {
  const [f, setF] = useState(() => (initial && typeof initial === 'object' ? toForm(initial) : EMPTY))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const editing = Boolean(initial && initial.id)

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setF((s) => ({ ...s, [key]: value }))
  }

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const url = await uploadImage(file)
      setF((s) => ({ ...s, imageUrl: url }))
    } catch (err) {
      setUploadError(err.message || 'No se pudo subir la imagen.')
    } finally {
      setUploading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const payload = toPayload(f)
      if (editing) {
        await updateProject(initial.id, payload)
      } else {
        await createProject(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el proyecto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kt-modal" role="dialog" aria-modal="true" aria-label="Editar proyecto">
      <div className="kt-modal-backdrop" onClick={onCancel} />
      <form className="kt-modal-card" onSubmit={submit}>
        <div className="kt-modal-head">
          <div>
            <p className="kt-eyebrow">{editing ? 'EDITAR PROYECTO' : 'NUEVO PROYECTO'}</p>
            <h2>{editing ? f.title || 'Proyecto' : 'Crear proyecto'}</h2>
          </div>
          <button type="button" className="kt-icon-btn" onClick={onCancel} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        <div className="kt-proj-form">
          <label className="kt-field kt-field-wide">
            <span>Título *</span>
            <input value={f.title} onChange={set('title')} required minLength={2} placeholder="CRM Nova Retail" />
          </label>

          <label className="kt-field kt-field-wide">
            <span>Subtítulo</span>
            <input value={f.subtitle} onChange={set('subtitle')} placeholder="Ventas y seguimiento comercial unificados" />
          </label>

          <label className="kt-field">
            <span>Categoría *</span>
            <input value={f.category} onChange={set('category')} required minLength={2} placeholder="CRM a medida" />
          </label>

          <label className="kt-field">
            <span>Industria</span>
            <input value={f.industry} onChange={set('industry')} placeholder="Retail" />
          </label>

          <label className="kt-field">
            <span>Cliente</span>
            <input value={f.client} onChange={set('client')} placeholder="NOVA Retail" />
          </label>

          <label className="kt-field">
            <span>Año</span>
            <input value={f.year} onChange={set('year')} placeholder="2024" maxLength={8} />
          </label>

          <label className="kt-field">
            <span>Estado</span>
            <select value={f.status} onChange={set('status')}>
              <option value="borrador">Borrador</option>
              <option value="publicado">Publicado</option>
              <option value="en_curso">En curso</option>
              <option value="entregado">Entregado</option>
            </select>
          </label>

          <label className="kt-field">
            <span>Orden</span>
            <input
              type="number"
              value={f.sortOrder}
              onChange={set('sortOrder')}
              placeholder="0"
            />
          </label>

          <label className="kt-field kt-check">
            <input type="checkbox" checked={f.featured} onChange={set('featured')} />
            Destacado en portada
          </label>

          <label className="kt-field">
            <span>Color de acento</span>
            <div className="kt-accent-row">
              <input type="color" value={f.accent} onChange={set('accent')} aria-label="Color de acento" />
              <code>{f.accent}</code>
            </div>
          </label>

          <label className="kt-field">
            <span>Etiquetas</span>
            <input value={f.tags} onChange={set('tags')} placeholder="React, Python, Postgres (separadas por coma)" />
          </label>

          <div className="kt-field kt-field-wide">
            <span>Imagen principal</span>
            <div className="kt-imgrow">
              <div className="kt-thumb" style={{ background: f.accent }}>
                {f.imageUrl ? (
                  <img src={f.imageUrl} alt="Vista previa" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <ImageIcon size={18} />
                )}
              </div>
              <div className="kt-imgrow-btns">
                <button
                  type="button"
                  className="kt-btn kt-btn-ghost"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="kt-spin" size={15} /> : <Upload size={15} />}
                  {uploading ? 'Subiendo…' : 'Subir imagen'}
                </button>
                <span className="kt-micro">JPG, PNG, WEBP o GIF · máx 4 MB</span>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFile} />
            </div>
            <input value={f.imageUrl} onChange={set('imageUrl')} placeholder="URL de la imagen o ruta local, ej. /images/art-work.jpg" />
            {uploadError && <p className="kt-error">{uploadError}</p>}
          </div>

          <label className="kt-field kt-field-wide">
            <span>Resumen corto</span>
            <textarea
              rows={2}
              value={f.summary}
              onChange={set('summary')}
              placeholder="Una frase para las tarjetas públicas…"
              maxLength={600}
            />
          </label>

          <label className="kt-field kt-field-wide">
            <span>Descripción completa</span>
            <textarea
              rows={4}
              value={f.description}
              onChange={set('description')}
              placeholder="Detalle del proyecto…"
              maxLength={8000}
            />
          </label>

          <label className="kt-field kt-field-wide">
            <span>Cita del cliente</span>
            <textarea
              rows={2}
              value={f.quote}
              onChange={set('quote')}
              placeholder="“El resultado superó lo esperado…”"
              maxLength={400}
            />
          </label>

          <label className="kt-field">
            <span>Autor de la cita</span>
            <input value={f.authorName} onChange={set('authorName')} placeholder="María Cárdenas" />
          </label>

          <label className="kt-field">
            <span>Cargo del autor</span>
            <input value={f.authorRole} onChange={set('authorRole')} placeholder="Gerente General, NOVA Retail" />
          </label>
        </div>

        {error && <p className="kt-error">{error}</p>}

        <div className="kt-modal-foot">
          <button type="button" className="kt-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="kt-btn kt-btn-primary" disabled={saving} type="submit">
            {saving && <Loader2 className="kt-spin" size={16} />}
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function ProjectsView() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    projects()
      .then((data) => setItems(data.items || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const remove = async (p) => {
    if (busy) return
    if (!window.confirm(`¿Eliminar “${p.title}” de forma permanente?`)) return
    setBusy(true)
    try {
      await deleteProject(p.id)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="kt-view">
      <header className="kt-view-head">
        <div>
          <p className="kt-eyebrow">CATÁLOGO</p>
          <h1>Proyectos realizados</h1>
        </div>
        <button className="kt-btn kt-btn-primary" onClick={() => setModal({})}>
          <Plus size={16} />
          Nuevo proyecto
        </button>
      </header>

      {loading ? (
        <div className="kt-empty">
          <Loader2 className="kt-spin" size={22} />
          Cargando proyectos…
        </div>
      ) : error ? (
        <div className="kt-empty">
          <p>No pudimos cargar los proyectos.</p>
          <button className="kt-btn kt-btn-primary" onClick={load}>
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="kt-empty">
          <FolderKanban size={34} />
          <p>Aún no hay proyectos. Crea el primero.</p>
          <button className="kt-btn kt-btn-primary" onClick={() => setModal({})}>
            <Plus size={16} />
            Nuevo proyecto
          </button>
        </div>
      ) : (
        <div className="kt-grid">
          {items.map((p) => (
            <article key={p.id} className="kt-proj">
              <div className="kt-proj-media" style={{ background: p.accent }}>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <span className="kt-proj-mark">{p.title.charAt(0)}</span>
                )}
                {p.category && <span className="kt-proj-cat">{p.category}</span>}
                {p.featured && (
                  <span className="kt-proj-feat">
                    <Star size={12} />
                    Destacado
                  </span>
                )}
              </div>
              <div className="kt-proj-info">
                <div className="kt-proj-top">
                  <h3>{p.title}</h3>
                  <span className={`kt-badge ${STATUS_CLS[p.status] || 'dr'}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>
                {p.subtitle && <p className="kt-proj-sub">{p.subtitle}</p>}
                <p className="kt-proj-meta">
                  {[p.year, p.industry, p.client].filter(Boolean).join(' · ') || 'Sin metadatos'}
                </p>
                {p.tags.length > 0 && (
                  <div className="kt-tags">
                    {p.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}
                <div className="kt-proj-foot">
                  <button className="kt-btn kt-btn-ghost" onClick={() => setModal(p)}>
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button className="kt-btn kt-btn-ghost-red" onClick={() => remove(p)}>
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {modal && (
        <ProjectForm
          key={modal.id ? modal.id : 'nuevo'}
          initial={modal}
          onCancel={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}
    </section>
  )
}