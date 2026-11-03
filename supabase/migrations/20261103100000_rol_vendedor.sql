-- ============================================================
-- Rol vendedor (Fase 2) — NO APLICADA AUN
-- ============================================================
--
-- Crea el rol `vendedor`: ve solo sus pedidos y sus clientes, puede levantar
-- pedidos y dar de alta clientes, y nada mas.
--
-- Decision de diseno: `vendedor` queda FUERA de is_staff() y de is_admin().
-- Esas dos funciones significan "lee todo" y "escribe todo" respectivamente, y
-- las usan ~20 policies; meter al vendedor ahi le daria lectura global y
-- rompe el requisito. Por eso lleva su propio predicado.
--
-- Se unifica con el modelo de vendedores que ya existia pero nunca se uso
-- (tabla `vendedores` con 2 filas sin login, `pedidos.vendedor_id` en 0 de 13
-- pedidos, `comisiones` vacia). En vez de inventar un segundo concepto de
-- vendedor, se liga el catalogo al login:
--
--   vendedores.profile_id  -> profiles(id)      quien es el login del vendedor
--   profiles.vendedor_id   -> vendedores(id)    de que vendedor es el cliente
--   pedidos.vendedor_id                          ya existia, se usa tal cual
--
-- Las policies nuevas son ADITIVAS: en Postgres varias policies permisivas se
-- combinan con OR, asi que ninguna de las de staff cambia de comportamiento.
-- ============================================================

-- ── 1. Enlaces entre catalogo y login ───────────────────────

alter table public.vendedores
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

-- Un login no puede estar ligado a dos fichas de vendedor.
create unique index if not exists vendedores_profile_id_key
  on public.vendedores(profile_id) where profile_id is not null;

alter table public.profiles
  add column if not exists vendedor_id uuid references public.vendedores(id) on delete set null;

-- Las policies filtran por estas columnas en cada consulta del vendedor.
create index if not exists profiles_vendedor_id_idx on public.profiles(vendedor_id);
create index if not exists pedidos_vendedor_id_idx  on public.pedidos(vendedor_id);

comment on column public.vendedores.profile_id is
  'Login ligado a esta ficha. null = vendedor de catalogo sin acceso al panel.';
comment on column public.profiles.vendedor_id is
  'Vendedor dueno de este cliente. Solo aplica a role = comprador.';


-- ── 2. Predicados ───────────────────────────────────────────
-- Mismo patron que is_staff/is_admin/is_super_admin: stable, security definer
-- y search_path fijo, para que las policies no dependan del search_path del
-- llamador.

create or replace function public.is_vendedor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'vendedor'
      and coalesce(active, true) = true
  );
$$;

-- Devuelve la ficha de vendedor del usuario actual, o null.
--
-- Pide explicitamente role = 'vendedor' y que ficha y perfil esten activos:
-- asi es fail-closed. Si a alguien le quitan el rol o se desactiva la ficha,
-- la funcion devuelve null y las policies de abajo dejan de hacer match sin
-- tener que tocarlas.
create or replace function public.mi_vendedor_id()
returns uuid language sql stable security definer
set search_path = public as $$
  select v.id
  from public.vendedores v
  join public.profiles p on p.id = v.profile_id
  where v.profile_id = auth.uid()
    and p.role = 'vendedor'
    and coalesce(p.active, true) = true
    and coalesce(v.activo, true) = true
  limit 1;
$$;

revoke execute on function public.is_vendedor()    from public, anon;
revoke execute on function public.mi_vendedor_id() from public, anon;
grant  execute on function public.is_vendedor()    to authenticated;
grant  execute on function public.mi_vendedor_id() to authenticated;


-- ── 3. Policies ─────────────────────────────────────────────

begin;

-- pedidos: ve y crea solo los suyos.
-- No hay policy de UPDATE ni de DELETE a proposito: el vendedor no edita
-- pedidos. El guard de la API tambien lo rechaza; esto es la segunda capa.
drop policy if exists "pedidos_vendedor_read"   on public.pedidos;
drop policy if exists "pedidos_vendedor_insert" on public.pedidos;

create policy "pedidos_vendedor_read" on public.pedidos
  for select to authenticated
  using (vendedor_id is not null and vendedor_id = public.mi_vendedor_id());

create policy "pedidos_vendedor_insert" on public.pedidos
  for insert to authenticated
  with check (vendedor_id is not null and vendedor_id = public.mi_vendedor_id());

-- pedido_items: cuelgan del pedido padre.
drop policy if exists "pedido_items_vendedor_read"   on public.pedido_items;
drop policy if exists "pedido_items_vendedor_insert" on public.pedido_items;

create policy "pedido_items_vendedor_read" on public.pedido_items
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedor_id is not null
      and p.vendedor_id = public.mi_vendedor_id()
  ));

create policy "pedido_items_vendedor_insert" on public.pedido_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedor_id is not null
      and p.vendedor_id = public.mi_vendedor_id()
  ));

-- profiles: lee sus clientes. Su propia fila ya la cubre la policy existente
-- profiles_staff_read, cuya rama `id = auth.uid()` aplica a cualquier
-- authenticated.
--
-- No se agrega policy de INSERT: el alta de clientes pasa por
-- /api/admin/clientes/crear, que usa el service client (salta RLS) porque
-- necesita auth.admin.createUser. El vendedor_id se asigna ahi, en la ruta.
drop policy if exists "profiles_vendedor_read" on public.profiles;

create policy "profiles_vendedor_read" on public.profiles
  for select to authenticated
  using (vendedor_id is not null and vendedor_id = public.mi_vendedor_id());

commit;


-- ── 4. Lo que NO se toca ────────────────────────────────────
--
-- `comisiones` se queda igual y sin policies nuevas. La generacion automatica
-- al crear pedido se desactiva en esta misma fase (era 12% fijo sobre lo
-- vendido). En Fase 3 las comisiones pasan a tramos marginales sobre lo
-- cobrado, y ese calculo se define ahi.
--
-- `pedidos_saldo` no necesita cambios: tiene security_invoker = on, asi que
-- las policies de `pedidos` se evaluan con el rol que consulta y la vista le
-- devuelve al vendedor solo sus filas. No hace falta exponer vendedor_id en
-- la vista para que el dashboard del vendedor funcione.
--
-- `productos` tampoco: la policy actual ya deja a cualquier authenticated leer
-- los activos, que es lo que necesita para armar un pedido. Leer el catalogo
-- no es "ver inventario": lo que se le niega es la pantalla, el stock y la
-- escritura.
