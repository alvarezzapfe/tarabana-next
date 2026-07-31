-- ============================================================
-- Modelo de tres niveles de rol (ya aplicado en producción)
-- is_staff()       → lectura del panel (SELECT)
-- is_admin()       → escritura (INSERT/UPDATE/DELETE)
-- is_super_admin() → gestión de usuarios/invitaciones
-- ============================================================

-- ── Reemplazar is_admin() con los tres helpers ──────────────
drop function if exists public.is_admin();

create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','ventas','produccion','contabilidad')
      and coalesce(active, true) = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','ventas','produccion')
      and coalesce(active, true) = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and coalesce(active, true) = true
  );
$$;

revoke execute on function public.is_staff()       from public, anon;
revoke execute on function public.is_admin()       from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_staff()        to authenticated;
grant execute on function public.is_admin()        to authenticated;
grant execute on function public.is_super_admin()  to authenticated;


-- ============================================================
-- Reemplazar policies monolíticas por SELECT/write separadas
-- ============================================================

-- ── Fase 1: tablas internas ─────────────────────────────────
begin;

drop policy if exists "comisiones_admin"   on public.comisiones;
drop policy if exists "vendedores_admin"   on public.vendedores;
drop policy if exists "invitaciones_admin" on public.invitaciones;
drop policy if exists "lotes_admin"        on public.lotes;

create policy "comisiones_read"   on public.comisiones   for select to authenticated using (public.is_staff());
create policy "comisiones_write"  on public.comisiones   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vendedores_read"   on public.vendedores   for select to authenticated using (public.is_staff());
create policy "vendedores_write"  on public.vendedores   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lotes_read"        on public.lotes        for select to authenticated using (public.is_staff());
create policy "lotes_write"       on public.lotes        for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- invitaciones: super_admin only para todo
create policy "invitaciones_super" on public.invitaciones for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

commit;

-- ── Fase 2: contenido público ───────────────────────────────
begin;

drop policy if exists "productos_read_auth"    on public.productos;
drop policy if exists "productos_admin"        on public.productos;
drop policy if exists "puntos_venta_read_auth" on public.puntos_venta;
drop policy if exists "puntos_venta_admin"     on public.puntos_venta;
drop policy if exists "medallero_admin"        on public.medallero;
drop policy if exists "taproom_config_admin"   on public.taproom_config;

-- anon policies unchanged (productos_read_anon, puntos_venta_read_anon, medallero_read, taproom_config_read)

create policy "productos_read_auth" on public.productos
  for select to authenticated using (activo = true or public.is_staff());
create policy "productos_write" on public.productos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "puntos_venta_read_auth" on public.puntos_venta
  for select to authenticated using (activo = true or public.is_staff());
create policy "puntos_venta_write" on public.puntos_venta
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "medallero_write" on public.medallero
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "taproom_config_write" on public.taproom_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;

-- ── Fase 3: PII ─────────────────────────────────────────────
begin;

drop policy if exists "profiles_admin"    on public.profiles;
drop policy if exists "pedidos_admin"     on public.pedidos;
drop policy if exists "pedido_items_admin" on public.pedido_items;

-- profiles: self read/update unchanged, staff can read all, admin can write all
create policy "profiles_staff_read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "profiles_admin_write" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pedidos_staff_read" on public.pedidos
  for select to authenticated using (cliente_id = auth.uid() or public.is_staff());
create policy "pedidos_admin_write" on public.pedidos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pedido_items_staff_read" on public.pedido_items
  for select to authenticated using (
    exists (select 1 from public.pedidos p where p.id = pedido_items.pedido_id and p.cliente_id = auth.uid())
    or public.is_staff()
  );
create policy "pedido_items_admin_write" on public.pedido_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
