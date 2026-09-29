# KARVATECH — Sitio Web Corporativo

Página web profesional para KARVATECH S.A.C., empresa de desarrollo de
software a medida, CRM y ERP fundada por **Luis Alberto Valle Coronado** y
**Karla Elizabeth Albites Palomino**.

## Stack

- **Frontend:** React 19 + Vite (`karvatech-web/`), habla directo con Supabase
  mediante `@supabase/supabase-js`
- **Base de datos:** Supabase Postgres (antes PostgreSQL en Neon)
- **Login del panel:** Supabase Auth
- **Permisos:** RLS (Row Level Security) + columna `is_admin`
- **Imágenes:** Supabase Storage
- **Operaciones con servidor:** Supabase Edge Functions (formulario público y
  envío de correos)

Ya no hay backend propio. Todo lo que antes hacía FastAPI está repartido entre
Postgres, Auth, Storage y dos Edge Functions. Ver [`supabase/README.md`](supabase/README.md).

## Estructura

```
KARVATECH/
├── karvatech-web/        # Frontend React (Vite)
│   ├── .env.example      # VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY
│   └── src/
│       ├── lib/supabase.js   # Cliente único de supabase-js
│       ├── admin/            # Panel: Login, Resumen, Mensajes, Proyectos
│       │   └── api.js        # Toda la capa de datos (antes: fetch a /api/*)
│       ├── journey.jsx       # Contexto + paneles del recorrido
│       ├── components/
│       │   ├── Track.jsx      # Scroller horizontal con scroll-snap
│       │   ├── SideRail.jsx   # Rail lateral: MENÚ / logo / Hablemos
│       │   ├── TechCanvas.jsx # Fondo animado (redes y código)
│       │   └── panels/        # Hero, Qué construimos, Escuchar,
│       │                      # Cómo trabajamos, Clientes, Nosotros, Hablemos
│       └── index.css     # Sistema de diseño editorial
└── supabase/             # Esquema, RLS, Storage, funciones y migración de datos
```

## Cómo ejecutar

```powershell
cd karvatech-web
npm install
npm run dev
```

Abre `http://localhost:5173`. No hace falta levantar ningún backend: el panel en
`#/admin` se conecta a Supabase con la publishable key.

### Build de producción

```powershell
cd karvatech-web
npm run build
```

`dist/` es estático y se puede publicar en cualquier hosting. En Supabase →
**Authentication → URL Configuration** añade el dominio del sitio en Site URL y
Redirect URLs para que el login funcione fuera de `localhost`.

## Configuración

`karvatech-web/.env` (ignorado por git):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La publishable key no es un secreto: viaja dentro del bundle. Lo que protege los
datos es el RLS de la base, que es lo único que decide qué puede hacer alguien
que ya tiene esa key en la mano.

**Puesta en marcha de la base, el admin, las funciones y los secretos SMTP:**
[`supabase/README.md`](supabase/README.md).

## Panel administrativo

Se entra en `/#/admin`. El login es por **correo**, no por nombre de usuario.
Accede únicamente la cuenta con `is_admin = true` en `public.profiles`.

Desde ahí: resumen ejecutivo con métricas, bandeja de mensajes de contacto con
respuesta por correo, y CRUD del catálogo de proyectos con subida de imágenes a
Storage.

## Personalización rápida

- **Teléfono / WhatsApp:** busca `999` en `src/components/WhatsAppButton.jsx`, o
  edita el enlace `wa.me/51...`.
- **Correo:** busca `contacto@karvatech.com`.
