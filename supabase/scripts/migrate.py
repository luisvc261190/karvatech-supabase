#!/usr/bin/env python3
"""Migra los datos de KARVATECH de Neon a Supabase y verifica el resultado.

Solo mueve filas: el esquema y las políticas RLS se aplican con los archivos de
supabase/migrations/*.sql (ver README de la carpeta supabase).

Uso:
    python supabase/scripts/migrate.py            # migra
    python supabase/scripts/migrate.py --check    # solo compara, no escribe

Las credenciales se leen del entorno:
    NEON_DATABASE_URL     origen  (es lo que hoy vive en backend/.env)
    SUPABASE_DB_URL       destino postgresql://postgres:CLAVE@db.<ref>.supabase.co:5432/postgres

El script es idempotente por `id`: hace UPSERT, así que se puede volver a
ejecutar sin duplicar. Al final compara los recuentos y los checksums de ambas
bases y sale con código 1 si no cuadran.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_batch
except ImportError:
    sys.exit("Falta psycopg2. Instálalo con: pip install psycopg2-binary")


MESSAGE_COLUMNS = [
    "id", "name", "last_name", "email", "company", "position", "phone", "sector",
    "employees", "country", "pain", "status", "reply_body", "reply_sent_at",
    "admin_notes", "created_at",
]

PROJECT_COLUMNS = [
    "id", "slug", "title", "subtitle", "category", "client", "industry", "summary",
    "description", "quote", "author_name", "author_role", "image_url", "accent",
    "year", "tags", "status", "featured", "sort_order", "created_at", "updated_at",
]

# El panel nunca escribe estos dos, pero los copiamos tal cual por si acaso.
PROFILE_COLUMNS = ["id", "display_name", "is_admin", "created_at"]


def connect(url: str, label: str):
    try:
        return psycopg2.connect(url)
    except psycopg2.Error as exc:
        sys.exit(f"No se pudo conectar a {label}: {exc}")


def fetch(conn, table: str, columns: list[str]) -> list[dict]:
    cols = ", ".join(columns)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {cols} FROM {table} ORDER BY id")  # noqa: S608
        names = [d[0] for d in cur.description]
        return [dict(zip(names, row)) for row in cur.fetchall()]


def sync(conn, table: str, columns: list[str], rows: list[dict]) -> int:
    """UPSERT por id. No borra lo que ya exista en destino."""
    if not rows:
        return 0
    cols = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ", ".join(f"{c} = excluded.{c}" for c in columns if c != "id")
    sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO UPDATE SET {updates}"
    with conn.cursor() as cur:
        execute_batch(cur, sql, [[r.get(c) for c in columns] for r in rows], page_size=100)
    return len(rows)


def fingerprint(rows: list[dict], columns: list[str]) -> str:
    """Huella estable del contenido, para comparar origen y destino."""
    h = hashlib.sha256()
    for row in rows:
        for c in columns:
            h.update(repr(row.get(c)).encode("utf-8"))
            h.update(b"\x1f")
        h.update(b"\x1e")
    return h.hexdigest()[:16]


def resync_sequences(conn, tables: list[str]) -> None:
    """Alinea cada secuencia serial con el id más alto ya presente.

    Imprescindible: los ids se copian tal cual desde Neon y no empiezan en 1
    (en producción los mensajes ya van por el 6, por ejemplo). Si la secuencia
    se queda en 1, el siguiente insert que haga la app genera un id que ya existe
    y revienta con duplicate key. pg_get_serial_sequence devuelve NULL si la
    columna no es serial, y en ese caso setval(NULL, …) es un no-op.
    """
    with conn.cursor() as cur:
        for table in tables:
            cur.execute(
                f"SELECT setval("  # noqa: S608
                f"  pg_get_serial_sequence('{table}', 'id'),"
                f"  COALESCE((SELECT MAX(id) FROM {table}), 1),"
                f"  true)"
            )
            cur.execute(
                "SELECT last_value FROM pg_sequences WHERE sequencename = "
                "(SELECT pg_get_serial_sequence(%s, 'id'))",
                (table,),
            )
            row = cur.fetchone()
            if row:
                print(f"  {table:10} secuencia -> {row[0]}")


def report(name: str, rows: list[dict], columns: list[str]) -> str:
    return f"  {name:10} {len(rows):>3} filas  huella {fingerprint(rows, columns)}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="solo compara, no escribe")
    args = parser.parse_args()

    neon_url = os.environ.get("NEON_DATABASE_URL", "").strip()
    supabase_url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not neon_url or not supabase_url:
        sys.exit(
            "Faltan variables de entorno.\n"
            "  NEON_DATABASE_URL  (origen)\n"
            "  SUPABASE_DB_URL    (destino postgresql://postgres:CLAVE@db.<ref>.supabase.co:5432/postgres)"
        )

    neon = connect(neon_url, "Neon (origen)")
    supabase = connect(supabase_url, "Supabase (destino)")

    with supabase.cursor() as cur:
        cur.execute("SELECT current_database(), version()")
        dbn, ver = cur.fetchone()
    print(f"Destino: {dbn} · {ver.split(',')[0]}")

    # `profiles` no se migra: en Neon la identidad vive en la tabla `admins`, y
    # en Supabase en auth.users. El perfil lo crea el trigger handle_new_user al
    # registrarse el admin, así que no hay nada que copiar.
    migrated = [("messages", MESSAGE_COLUMNS), ("projects", PROJECT_COLUMNS)]

    source = {t: fetch(neon, t, c) for t, c in migrated}
    print("\nOrigen (Neon):")
    for name, cols in migrated:
        print(report(name, source[name], cols))

    # El esquema debe existir antes de escribir; lo createan las migraciones SQL.
    with supabase.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name IN ('messages', 'projects')"
        )
        missing = 2 - cur.fetchone()[0]
    if missing:
        sys.exit(
            f"\nFaltan {missing} tablas en el destino.\n"
            "Aplica primero las migraciones de supabase/migrations/ en el SQL Editor de Supabase."
        )

    if args.check:
        print("\n--check: no se escribió nada.")
    else:
        print("\nEscribiendo en Supabase…")
        for name, cols in migrated:
            n = sync(supabase, name, cols, source[name])
            print(f"  {name:10} {n:>3} filas sincronizadas")
        resync_sequences(supabase, ["messages", "projects"])
        supabase.commit()
        print("  commit ok")

    print("\nDestino (Supabase):")
    target = {t: fetch(supabase, t, c) for t, c in migrated}
    for name, cols in migrated:
        print(report(name, target[name], cols))

    print("\nVerificación:")
    problems = []
    for name, cols in migrated:
        a, b = source[name], target[name]
        if len(a) != len(b):
            problems.append(f"{name}: {len(a)} en origen vs {len(b)} en destino")
        elif fingerprint(a, cols) != fingerprint(b, cols):
            problems.append(f"{name}: mismo número de filas pero distinto contenido")
        else:
            print(f"  {name:10} coincide")

    if problems:
        print("\nHAY DIFERENCIAS:")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("\nMigración verificada: los dos conjuntos de datos coinciden.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
