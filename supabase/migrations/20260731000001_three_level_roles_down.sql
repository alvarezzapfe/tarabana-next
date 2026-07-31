-- ============================================================
-- ROLLBACK — Revert three-level roles back to single is_admin()
-- ============================================================

-- ── Rollback Fase 3 ─────────────────────────────────────────
begin;
drop policy if exists "pedido_items_admin_write" on public.pedido_items;
drop policy if exists "pedido_items_staff_read"  on public.pedido_items;
drop policy if exists "pedidos_admin_write"      on public.pedidos;
drop policy if exists "pedidos_staff_read"       on public.pedidos;
drop policy if exists "profiles_admin_write"     on public.profiles;
drop policy if exists "profiles_staff_read"      on public.profiles;

-- Restore original monolithic admin policies
create policy "profiles_admin" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pedidos_admin" on public.pedidos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pedido_items_admin" on public.pedido_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ── Rollback Fase 2 ─────────────────────────────────────────
begin;
drop policy if exists "taproom_config_write"   on public.taproom_config;
drop policy if exists "medallero_write"        on public.medallero;
drop policy if exists "puntos_venta_write"     on public.puntos_venta;
drop policy if exists "puntos_venta_read_auth" on public.puntos_venta;
drop policy if exists "productos_write"        on public.productos;
drop policy if exists "productos_read_auth"    on public.productos;

create policy "productos_read_auth" on public.productos
  for select to authenticated using (activo = true or public.is_admin());
create policy "productos_admin" on public.productos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "puntos_venta_read_auth" on public.puntos_venta
  for select to authenticated using (activo = true or public.is_admin());
create policy "puntos_venta_admin" on public.puntos_venta
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "medallero_admin" on public.medallero
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "taproom_config_admin" on public.taproom_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ── Rollback Fase 1 ─────────────────────────────────────────
begin;
drop policy if exists "invitaciones_super" on public.invitaciones;
drop policy if exists "lotes_write"        on public.lotes;
drop policy if exists "lotes_read"         on public.lotes;
drop policy if exists "vendedores_write"   on public.vendedores;
drop policy if exists "vendedores_read"    on public.vendedores;
drop policy if exists "comisiones_write"   on public.comisiones;
drop policy if exists "comisiones_read"    on public.comisiones;

create policy "comisiones_admin" on public.comisiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vendedores_admin" on public.vendedores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "invitaciones_admin" on public.invitaciones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lotes_admin" on public.lotes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ── Rollback helpers ────────────────────────────────────────
drop function if exists public.is_super_admin();
drop function if exists public.is_staff();

-- Restore original is_admin (included contabilidad)
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','ventas')
      and coalesce(active, true) = true
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
