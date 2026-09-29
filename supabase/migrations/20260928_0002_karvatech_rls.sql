-- KARVATECH · 0002 · Row Level Security
--
-- A partir de aquí la base se protege con RLS. Es la única capa de seguridad
-- real del proyecto: la publishable key (sb_publishable_...) va incrustada en el
-- bundle del navegador y es pública por definición, así que el rol `anon` solo
-- puede hacer exactamente lo que estas políticas digan.
--
-- Reglas de permisos del proyecto:
--   projects  -> lectura pública de lo publicado; escritura solo admin
--   messages  -> nada público. Ni lectura ni escritura para anon/authenticated
--   profiles  -> cada quien lee y actualiza la suya; is_admin es intocable
--
-- Las Edge Functions usan la service_role, que tiene BYPASSRLS, por eso pueden
-- escribir en messages sin abrir un INSERT a anon. Ese es el motivo de usar
-- funciones en vez de un insert directo desde el navegador.

begin;

-- ---------------------------------------------------------------------------
-- Privilegios de tabla
--
-- Esto va PRIMERO y no es opcional: RLS y GRANT responden a preguntas distintas.
-- El GRANT decide si el rol puede tocar la tabla; las políticas de abajo deciden
-- qué filas ve. Con RLS activa y sin GRANT, la consulta ni siquiera llega a
-- evaluarse y Postgres devuelve 42501 "permission denied for table projects".
--
-- Las políticas sin estos GRANT no LIBERAN datos, pero sin ellos sí bloquean el
-- acceso por completo. Y ese es justo el estado en el que queda una base creada
-- con CREATE TABLE a mano: en Supabase los permisos por defecto se aplican a las
-- tablas que crea el panel, no a las que crea un CREATE TABLE suelto, así que
-- el sitio se ve bien en el panel y en el navegador no carga nada.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

-- anon: solo leer lo publicado de projects. Ni messages, ni escritura alguna.
grant select on public.projects to anon;

-- authenticated: el panel de administración.
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, update on public.profiles to authenticated;

-- service_role: la usan las Edge Functions. Tiene BYPASSRLS, pero el privilegio
-- hay que concederlo igual, y necesita las secuencias para generar ids.
grant all on public.messages, public.projects, public.profiles,
                public.contact_rate_limits to service_role;
grant all on all sequences in schema public to service_role;

-- El alta de proyectos la hace el admin autenticado, y para obtener el id
-- necesita poder usar la secuencia.
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: ¿el usuario actual es administrador?
--
-- SECURITY DEFINER para poder leer profiles sin chocar con su propia RLS.
-- search_path vacío + nombres calificados: evita que alguien secuestre el
-- search_path e inyecte su propia función is_admin.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select p.is_admin from public.profiles p where p.id = auth.uid()),
        false
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Anti-escalada de privilegios
--
-- La política "el usuario actualiza su perfil" incluye la columna is_admin, así
-- que sin este disparador cualquiera podría escribirse is_admin = true y
-- convertirse en admin. Este trigger se lo impide y deja el valor anterior.
-- Promover a alguien se hace desde el SQL editor (current_user = postgres) o
-- con la service_role, y ambos pasan el filtro.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.is_admin is distinct from old.is_admin
       and current_user not in ('service_role', 'postgres', 'supabase_admin')
    then
        new.is_admin := old.is_admin;
        raise notice 'is_admin ignorado: rol % no puede cambiar el flag', current_user;
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_guard_admin_flag on public.profiles;
create trigger profiles_guard_admin_flag
    before update on public.profiles
    for each row execute function public.guard_profile_admin_flag();

-- ---------------------------------------------------------------------------
-- Habilitar RLS
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.contact_rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- projects
--
-- Dos políticas SELECT en modo PERMISSIVE se combinan con OR, así que un admin
-- (que cumple la segunda) ve también los borradores, igual que el endpoint
-- /api/admin/projects del backend anterior.
-- ---------------------------------------------------------------------------

drop policy if exists "projects: lectura pública del portafolio" on public.projects;
create policy "projects: lectura pública del portafolio"
    on public.projects for select
    to anon, authenticated
    using (status <> 'borrador');

drop policy if exists "projects: lectura completa para admin" on public.projects;
create policy "projects: lectura completa para admin"
    on public.projects for select
    to authenticated
    using (public.is_admin());

drop policy if exists "projects: creación para admin" on public.projects;
create policy "projects: creación para admin"
    on public.projects for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "projects: edición para admin" on public.projects;
create policy "projects: edición para admin"
    on public.projects for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "projects: borrado para admin" on public.projects;
create policy "projects: borrado para admin"
    on public.projects for delete
    to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------------
-- messages
--
-- Sin ninguna política para anon ni para authenticated. Eso significa que el
-- formulario público NO puede insertar directo: tiene que pasar por la Edge
-- Function submit-contact, que es quien valida, aplica honeypot y rate limit.
-- Los mensajes contienen datos personales de clientes: ni lectura ni escritura
-- desde el navegador, nunca.
-- ---------------------------------------------------------------------------

drop policy if exists "messages: lectura para admin" on public.messages;
create policy "messages: lectura para admin"
    on public.messages for select
    to authenticated
    using (public.is_admin());

drop policy if exists "messages: edición para admin" on public.messages;
create policy "messages: edición para admin"
    on public.messages for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "messages: borrado para admin" on public.messages;
create policy "messages: borrado para admin"
    on public.messages for delete
    to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

drop policy if exists "profiles: leer la propia" on public.profiles;
create policy "profiles: leer la propia"
    on public.profiles for select
    to authenticated
    using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: editar la propia" on public.profiles;
create policy "profiles: editar la propia"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Rate limit atómico del formulario
--
-- Se ejecuta con la service_role desde la Edge Function. El UPSERT hace el
-- conteo dentro de una sola sentencia, así que dos envíos simultáneos desde la
-- misma IP se cuentan bien; un mapa en memoria de la función no lo garantiza.
-- ---------------------------------------------------------------------------

create or replace function public.check_contact_rate_limit(
    p_ip     text,
    p_max    integer default 5,
    p_window interval default interval '1 hour'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_hits integer;
begin
    insert into public.contact_rate_limits as t (ip, window_start, hits)
    values (p_ip, now(), 1)
    on conflict (ip) do update
        set hits = case
                        when t.window_start < now() - p_window then 1
                        else t.hits + 1
                    end,
            window_start = case
                        when t.window_start < now() - p_window then now()
                        else t.window_start
                    end
    returning hits into v_hits;

    return v_hits <= p_max;
end;
$$;

revoke all on function public.check_contact_rate_limit(text, integer, interval) from public;
grant execute on function public.check_contact_rate_limit(text, integer, interval) to service_role;

commit;
