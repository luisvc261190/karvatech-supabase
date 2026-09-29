-- KARVATECH · 0001 · Esquema base
--
-- Port del esquema que vivía suelto en backend/db.py (PostgreSQL de Neon) a un
-- proyecto Supabase. Las tablas messages y projects copian la forma real que ya
-- tenía en Neon, verificada contra information_schema antes de escribir esto.
--
-- Novedades frente al esquema de Neon:
--   * profiles reemplaza a admins. La identidad pasa a auth.users; aquí solo
--     vive el perfil y el flag is_admin.
--   * updated_at y contact_rate_limits no existían.
--   * slug de projects pasa a ser único (antes podía repetirse y romper rutas).

begin;

create table if not exists public.messages (
    id            serial         primary key,
    name          varchar        not null,
    last_name     varchar        not null default '',
    email         varchar        not null,
    company       varchar        not null default '',
    position      varchar        not null default '',
    phone         varchar        not null default '',
    sector        varchar        not null default '',
    employees     varchar        not null default '',
    country       varchar        not null default '',
    pain          text           not null default '',
    status        varchar        not null default 'nuevo',
    reply_body    text           not null default '',
    reply_sent_at timestamptz,
    admin_notes   text           not null default '',
    created_at    timestamptz    not null default now(),
    constraint messages_status_check
        check (status in ('nuevo', 'contactado', 'cerrado'))
);

create table if not exists public.projects (
    id          serial         primary key,
    slug        varchar        not null,
    title       varchar        not null,
    subtitle    varchar        not null default '',
    category    varchar        not null default '',
    client      varchar        not null default '',
    industry    varchar        not null default '',
    summary     text           not null default '',
    description text           not null default '',
    quote       text           not null default '',
    author_name varchar        not null default '',
    author_role varchar        not null default '',
    image_url   varchar        not null default '',
    accent      varchar        not null default '#16a34a',
    year        varchar        not null default '',
    tags        text[]         not null default '{}',
    status      varchar        not null default 'borrador',
    featured    boolean        not null default false,
    sort_order  integer        not null default 0,
    created_at  timestamptz    not null default now(),
    updated_at  timestamptz    not null default now(),
    constraint projects_status_check
        check (status in ('borrador', 'publicado', 'en_curso', 'entregado')),
    constraint projects_accent_check
        check (accent ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.profiles (
    id           uuid        primary key references auth.users (id) on delete cascade,
    display_name varchar     not null default '',
    is_admin     boolean     not null default false,
    created_at   timestamptz not null default now()
);

-- Contadores de abuso del formulario público. El borrado de filas viejas lo
-- hace el pg_cron opcional de la migración 0004; sin cron solo crecen, y son
-- pocas y pequeñas.
create table if not exists public.contact_rate_limits (
    ip           text        primary key,
    window_start timestamptz not null default now(),
    hits         integer     not null default 0
);

-- Índices: replican los de _ensure_indexes() en db.py y cubren el orden real
-- de las consultas del panel.
create index if not exists idx_messages_created
    on public.messages (created_at desc, id desc);
create index if not exists idx_messages_status
    on public.messages (status);
create index if not exists idx_projects_sort
    on public.projects (sort_order, updated_at);
create index if not exists idx_projects_status
    on public.projects (status);
create index if not exists idx_projects_public_portfolio
    on public.projects (featured desc, sort_order, id desc)
    where status <> 'borrador';
create unique index if not exists projects_slug_key
    on public.projects (slug);
create index if not exists idx_profiles_admin
    on public.profiles (id) where is_admin;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
    before update on public.projects
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Perfil automático al crearse un usuario
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'display_name', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

commit;
