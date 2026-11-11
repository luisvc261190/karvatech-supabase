# KARVATECH en Supabase

Migración del sitio: la base de datos, el login del panel, el almacenamiento de
imágenes y las dos operaciones que necesitan servidor (el formulario público y el
envío de correos) viven en Supabase. Ya no hay backend propio.

```
supabase/
├── config.toml                  # verify_jwt de cada función
├── migrations/                  # se aplican en orden, en el SQL Editor
│   ├── 20260928_0001_karvatech_schema.sql
│   ├── 20260928_0002_karvatech_rls.sql      <- el archivo de seguridad
│   └── 20260928_0003_karvatech_storage.sql
├── seed.sql                     # los 2 mensajes y 6 proyectos de Neon, para pegar
├── functions/
│   ├── submit-contact/          # pública, valida y aplica rate limit
│   └── send-reply/              # exige admin, envía por SMTP
└── scripts/
    ├── make_seed.py             # regenera seed.sql leyendo Neon
    └── migrate.py               # alternativa: copia y verifica por conexión
```

## Cómo está repartida la responsabilidad

| Cosa | Dónde vive | Quién la puede tocar |
|---|---|---|
| `projects` | Supabase Postgres | cualquiera lee lo publicado; solo admin escribe |
| `messages` | Supabase Postgres | **nadie** desde el navegador; solo la Edge Function inserta y solo el admin lee |
| Imágenes | Supabase Storage (`project-images`) | lectura pública, escritura solo admin |
| Sesión del panel | Supabase Auth | el admin que crees en Authentication |
| Permisos | columna `is_admin` en `profiles` | solo desde el SQL Editor o la service_role |
| Formulario público | Edge Function `submit-contact` | cualquiera, con rate limit |
| Respuesta por correo | Edge Function `send-reply` | solo admin, con SMTP configurado |

La `publishable key` va incrustada en el bundle del navegador: es pública por
diseño y no protege nada por sí sola. **El RLS es lo único que protege los
datos**, porque es la única cosa que decide qué puede hacer alguien que ya tiene
esa key en la mano. Si tocas la migración 0002, estás tocando la seguridad del
proyecto.

## Pasos para poner esto en pie

### 1. Aplicar el esquema

Sin CLI, en el panel: **SQL Editor → New query**, y pega los tres archivos de
`migrations/` en orden, uno por uno. Cada uno es idempotente, así que volver a
cargarlos no rompe nada.

Con CLI: `npx supabase db push`.

### 2. Crear el usuario administrador

El panel ya no tiene tabla `admins`: la identidad la lleva Supabase Auth.

1. **Authentication → Users → Add user**. Correo `admin@karvatech.com` (o el que
   prefieras), marca *Auto Confirm User*, y pon una contraseña de 12 caracteres
   o más.
2. El perfil se crea solo mediante un trigger, pero con `is_admin = false`. Para
   darle permisos, en el **SQL Editor**:

   ```sql
   update public.profiles set is_admin = true where id = 'EL-UUID-DEL-USUARIO';
   ```

   Como lo ejecutas con `current_user = postgres`, el trigger anti-escalada deja
   pasar el cambio. Un usuario normal no podría hacerse esto a sí mismo: esa es
   justamente la función `guard_profile_admin_flag`.

El usuario anterior en Neon se llamaba `admin` y `Luis A. Valle` era su nombre
de muestra. El login **pasa a ser por correo**, no por nombre de usuario.

### 3. Migrar los datos de Neon

**Opción A — pegar el seed (no necesita la contraseña de la base).** Es el camino
más simple si estás haciendo el montaje a mano: en el **SQL Editor → New query**,
pega `supabase/seed.sql` entero y dale Run. Son los 2 mensajes y los 6 proyectos
que hay hoy en Neon, con `ON CONFLICT DO UPDATE` por `id`, así que se puede volver
a pegar sin duplicar nada. Al final trae el `setval` de las dos secuencias y una
consulta de conteo para que confirmes que salen `2` y `6`.

Ese archivo lo genera `scripts/make_seed.py` leyendo Neon, por si más adelante
cambia algo y quieres rehacerlo:

```powershell
python supabase/scripts/make_seed.py
```

**Opción B — `migrate.py` (necesita la contraseña de ambas bases).** Útil si
prefieres que el script escriba y verifique solo:

```powershell
$env:NEON_DATABASE_URL = "postgresql://<la que estaba en backend/.env>"
$env:SUPABASE_DB_URL   = "postgresql://postgres:<CLAVE>@db.zjbdqrolffzufjtnewtd.supabase.co:5432/postgres"
python supabase/scripts/migrate.py
```

Compara origen y destino por conteo y huella y sale con código 1 si no cuadran.
Es idempotente (UPSERT por `id`), así que se puede repetir sin duplicar. Después
del sync realinea las secuencias: los ids vienen de Neon y no empiezan en 1, y
sin eso el siguiente mensaje insertado revienta por clave duplicada.

Solo para comparar, sin escribir: `python supabase/scripts/migrate.py --check`.

`profiles` no se migra en ninguna de las dos: en Neon la identidad vivía en la
tabla `admins` y en Supabase vive en `auth.users`. El perfil del administrador lo
crea el trigger al registrarse.

### 4. Publicar las Edge Functions

```powershell
npx supabase functions deploy submit-contact
npx supabase functions deploy send-reply
```

Sin CLI, en el panel: **Edge Functions → el nombre de la función → Deploy**, y
comprobar que `submit-contact` tenga **Verify JWT en OFF** (lo fija
`config.toml`).

El rate limit del formulario se ajusta con estas variables, opcionalmente:

```powershell
npx supabase secrets set RATE_LIMIT_MAX=5 RATE_LIMIT_WINDOW=60
```

### 5. Configurar SMTP (para poder responderle a un cliente)

```powershell
npx supabase secrets set SMTP_HOST=smtp.tu-proveedor.com SMTP_PORT=587 `
  SMTP_USER=tu@correo.com SMTP_PASSWORD=tu-clave SMTP_FROM=tu@correo.com `
  SMTP_FROM_NAME=KARVATECH SMTP_USE_TLS=1
```

Si no hay SMTP, `send-reply` responde 503 y el panel ofrece el enlace "Abrir en
tu correo", que es lo que ya hacía el backend anterior.

### 6. Configurar el frontend

`karvatech-web/.env` (ya ignorado por git):

```
VITE_SUPABASE_URL=https://zjbdqrolffzufjtnewtd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Luego `npm run dev`, o `npm run build` y lo que salga de `dist/` es lo que se
despliega. Ya no hay proxy de Vite: el navegador habla directo con Supabase.

En **Authentication → URL Configuration** deja el dominio del sitio en Site URL
y Redirect URLs, para que el login funcione en producción.

## Comprobaciones que vale la pena hacer

Nada de esto lo hace el código por ti, y son justo los casos que rompen en
producción:

```sql
-- 1. Que anon NO pueda leer los mensajes. Debe salir 0 filas.
select count(*) from public.messages;

-- 2. Que anon NO pueda insertar. Debe dar error de política.
insert into public.messages (name, email) values ('x', 'x@x.com');

-- 3. Que anon solo vea proyectos publicados.
select count(*) from public.projects;                 -- solo no-borrador
select count(*) from public.projects where status = 'borrador';  -- 0 filas
```

En el panel, con sesión de admin, la bandeja de entrada tiene que mostrar los
mensajes existentes y el botón de "Enviar respuesta" funcionar.
