"""Genera supabase/seed.sql con los datos que hay hoy en Neon.

No necesita la contrasena de Supabase: solo lee el origen (Neon, que si es
accesible) y escribe un archivo SQL para pegar en el SQL Editor.
"""
import re
from pathlib import Path

import psycopg2

ROOT = Path(r"C:\Users\user\Desktop\KARVATECH")
OUT = ROOT / "supabase" / "seed.sql"

env = (ROOT / "karvatech-web" / ".env").read_text(encoding="utf-8")
neon_url = None

# La credencial de Neon ya no esta en backend/.env (lo borre), asi que se lee
# del historial de git para no perder los datos.
import subprocess

blob = subprocess.run(
    ["git", "show", "HEAD:backend/.env"],
    cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
).stdout
neon_url = re.search(r"^DATABASE_URL=(.+)$", blob, re.M).group(1).strip()
neon_url = re.sub(r"^postgres(ql)?://", "postgresql://", neon_url)
neon_url = re.sub(r"[?&]channel_binding=[^&]*", "", neon_url)

conn = psycopg2.connect(neon_url)
cur = conn.cursor()


ARRAY_COLS = {"tags"}
TS_COLS = {"created_at", "updated_at", "reply_sent_at"}


def q(value, col=None):
    """Literal SQL seguro para cualquier valor de Postgres.

    Con standard_conforming_strings = on (el default, y lo que usa Supabase) el
    backslash NO es caracter de escape, asi que no se tocan: solo se duplican las
    comillas simples.

    Los valores que traen saltos de linea van con dollar-quoting ($kt$...$kt$):
    un salto de linea dentro de comillas simples es SQL valido, pero hace el
    archivo multi-linea e imposible de revisar de un vistazo. El tag $kt$ no
    aparece en los datos, asi que no puede colisionar.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)

    # psycopg2 no convierte text[] a lista: llega como texto con el formato de
    # literal de array de Postgres, que se puede reusar tal cual con un cast.
    if col in ARRAY_COLS and isinstance(value, str):
        s = value.strip()
        if s.startswith("{") and s.endswith("}"):
            return "'" + s.replace("'", "''") + "'::text[]"

    if isinstance(value, (list, tuple)):
        if not value:
            return "'{}'::text[]"
        inner = ", ".join(q(v) for v in value)
        return f"ARRAY[{inner}]::text[]"

    s = str(value)
    if "\n" in s or "\r" in s:
        if "$kt$" in s:
            raise ValueError("el dato contiene el tag $kt$ reservado")
        return "$kt$" + s + "$kt$"
    out = "'" + s.replace("'", "''") + "'"
    if col in TS_COLS:
        out += "::timestamptz"
    return out


def dump(table, columns, select_sql):
    with conn.cursor() as c:
        c.execute(select_sql)
        names = [d[0] for d in c.description]
        rows = c.fetchall()

    lines = [f"-- {table}: {len(rows)} fila(s)"]
    if not rows:
        lines.append(f"-- (vacio: no hay filas en {table})")
        return lines, 0, 0

    cols = ", ".join(columns)
    for row in rows:
        values = ", ".join(q(row[names.index(c)], c) for c in columns)
        lines.append(
            f"insert into public.{table} ({cols}) values ({values}) "
            f"on conflict (id) do update set " + ", ".join(
                f"{c} = excluded.{c}" for c in columns if c != "id"
            ) + ";"
        )
    max_id = max(r[names.index("id")] for r in rows)
    return lines, len(rows), max_id


header = """-- KARVATECH · seed
--
-- Datos copiados de la base PostgreSQL de Neon. Generado con
-- supabase/scripts/make_seed.py, se puede volver a pegar sin duplicar
-- (todas las filas usan ON CONFLICT DO UPDATE por id).
--
-- Aplica esto DESPUES de las migraciones 0001, 0002 y 0003.
--
-- NO se copia la tabla `admins`: en Supabase la identidad vive en auth.users y
-- el hash bcrypt de Neon no es compatible. El usuario administrador se crea a
-- mano en Authentication -> Users (ver supabase/README.md).
"""

parts = [header, ""]

msgs, n_msgs, max_msg = dump(
    "messages",
    ["id", "name", "last_name", "email", "company", "position", "phone", "sector",
     "employees", "country", "pain", "status", "reply_body", "reply_sent_at",
     "admin_notes", "created_at"],
    "select * from messages order by id",
)
parts += ["-- " + "-" * 74, "-- Tabla messages", "-- " + "-" * 74, ""] + msgs + [""]

projs, n_projs, max_proj = dump(
    "projects",
    ["id", "slug", "title", "subtitle", "category", "client", "industry", "summary",
     "description", "quote", "author_name", "author_role", "image_url", "accent",
     "year", "tags", "status", "featured", "sort_order", "created_at", "updated_at"],
    "select * from projects order by id",
)
parts += ["-- " + "-" * 74, "-- Tabla projects", "-- " + "-" * 74, ""] + projs + [""]

# Los ids vienen de Neon y no empiezan en 1. Sin resincronizar la secuencia, el
# siguiente mensaje insertado genera un id que ya existe y revienta con duplicate
# key. Esto es imprescindible, no opcional.
parts += [
    "-- " + "-" * 74,
    "-- Secuencias",
    "-- " + "-" * 74,
    "--",
    "-- Los ids se copiaron tal cual desde Neon y no empiezan en 1, asi que las",
    "-- secuERIAL quedan atrasadas. Sin esto, el siguiente insert del formulario",
    "-- de contacto falla con duplicate key.",
    "",
    f"select setval(pg_get_serial_sequence('public.messages', 'id'), greatest(coalesce((select max(id) from public.messages), 1), 1), true);  -- -> {max_msg}",
    f"select setval(pg_get_serial_sequence('public.projects', 'id'), greatest(coalesce((select max(id) from public.projects), 1), 1), true);  -- -> {max_proj}",
    "",
    "-- Verificacion: deben salir " + str(n_msgs) + " y " + str(n_projs) + ".",
    "select (select count(*) from public.messages) as mensajes,",
    "       (select count(*) from public.projects) as proyectos;",
    "",
]

OUT.write_text("\n".join(parts), encoding="utf-8")
conn.close()

print(f"escrito: {OUT.relative_to(ROOT)}")
print(f"  messages: {n_msgs} filas (id max {max_msg})")
print(f"  projects: {n_projs} filas (id max {max_proj})")
print(f"  tamano: {OUT.stat().st_size} bytes")
