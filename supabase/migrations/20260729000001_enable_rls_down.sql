-- ============================================================
-- ROLLBACK — Revertir RLS completo (fases 4 → 0)
-- ============================================================

-- ── Rollback Fase 4: restaurar UPDATE sin restricción de columna ──
grant update on public.profiles to authenticated;

-- ── Rollback Fase 3: policies PII ───────────────────────────
begin;
drop policy if exists "pedido_items_admin"    on public.pedido_items;
drop policy if exists "pedido_items_own_read" on public.pedido_items;
drop policy if exists "pedidos_admin"         on public.pedidos;
drop policy if exists "pedidos_own_read"      on public.pedidos;
drop policy if exists "profiles_admin"        on public.profiles;
drop policy if exists "profiles_self_update"  on public.profiles;
drop policy if exists "profiles_self_read"    on public.profiles;

alter table public.pedido_items disable row level security;
alter table public.pedidos      disable row level security;
alter table public.profiles     disable row level security;
commit;

-- ── Rollback Fase 2: policies contenido público ─────────────
begin;
drop policy if exists "taproom_config_admin"        on public.taproom_config;
drop policy if exists "taproom_config_read"          on public.taproom_config;
drop policy if exists "medallero_admin"              on public.medallero;
drop policy if exists "medallero_read"               on public.medallero;
drop policy if exists "puntos_venta_admin"           on public.puntos_venta;
drop policy if exists "puntos_venta_read_auth"       on public.puntos_venta;
drop policy if exists "puntos_venta_read_anon"       on public.puntos_venta;
drop policy if exists "productos_admin"              on public.productos;
drop policy if exists "productos_read_auth"          on public.productos;
drop policy if exists "productos_read_anon"          on public.productos;

alter table public.taproom_config disable row level security;
alter table public.medallero      disable row level security;
alter table public.puntos_venta   disable row level security;
alter table public.productos      disable row level security;
commit;

-- ── Rollback Fase 1: policies tablas internas ───────────────
begin;
drop policy if exists "lotes_admin"        on public.lotes;
drop policy if exists "invitaciones_admin" on public.invitaciones;
drop policy if exists "vendedores_admin"   on public.vendedores;
drop policy if exists "comisiones_admin"   on public.comisiones;

alter table public.lotes        disable row level security;
alter table public.invitaciones disable row level security;
alter table public.vendedores   disable row level security;
alter table public.comisiones   disable row level security;
commit;

-- ── Rollback Fase 0: helper de rol ──────────────────────────
drop function if exists public.is_admin();
