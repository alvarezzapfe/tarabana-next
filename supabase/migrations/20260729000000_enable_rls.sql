-- ============================================================
-- FASE 0: helper de rol
-- ============================================================
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

-- ============================================================
-- FASE 1: tablas internas (solo admin)
-- ============================================================
begin;
alter table public.comisiones   enable row level security;
alter table public.vendedores   enable row level security;
alter table public.invitaciones enable row level security;
alter table public.lotes        enable row level security;

create policy "comisiones_admin"   on public.comisiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vendedores_admin"   on public.vendedores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "invitaciones_admin" on public.invitaciones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lotes_admin"        on public.lotes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ============================================================
-- FASE 2: contenido público + admin
-- Policies separadas por rol: anon NO puede ejecutar is_admin(),
-- meterla en un OR bajo rol anon truena la query completa.
-- ============================================================
begin;
alter table public.productos      enable row level security;
alter table public.puntos_venta   enable row level security;
alter table public.medallero      enable row level security;
alter table public.taproom_config enable row level security;

create policy "productos_read_anon" on public.productos
  for select to anon using (activo = true);
create policy "productos_read_auth" on public.productos
  for select to authenticated using (activo = true or public.is_admin());
create policy "productos_admin" on public.productos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "puntos_venta_read_anon" on public.puntos_venta
  for select to anon using (activo = true);
create policy "puntos_venta_read_auth" on public.puntos_venta
  for select to authenticated using (activo = true or public.is_admin());
create policy "puntos_venta_admin" on public.puntos_venta
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "medallero_read" on public.medallero
  for select to anon, authenticated using (true);
create policy "medallero_admin" on public.medallero
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "taproom_config_read" on public.taproom_config
  for select to anon, authenticated using (true);
create policy "taproom_config_admin" on public.taproom_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ============================================================
-- FASE 3: PII (dueño + admin)
-- ============================================================
begin;
alter table public.profiles     enable row level security;
alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;

create policy "profiles_self_read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pedidos_own_read" on public.pedidos
  for select to authenticated using (cliente_id = auth.uid());
create policy "pedidos_admin" on public.pedidos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pedido_items_own_read" on public.pedido_items
  for select to authenticated using (
    exists (select 1 from public.pedidos p
            where p.id = pedido_items.pedido_id and p.cliente_id = auth.uid())
  );
create policy "pedido_items_admin" on public.pedido_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
commit;

-- ============================================================
-- FASE 4: grants de columna en profiles
-- Impide que un cliente se auto-promueva cambiando su role.
-- ============================================================
revoke update on public.profiles from anon, authenticated;
grant update (
  full_name, phone, tipo_consumidor, marca_negocio,
  direccion_entrega, ciudad, cp,
  requiere_factura, razon_social, rfc, uso_cfdi, onboarding_completo
) on public.profiles to authenticated;
