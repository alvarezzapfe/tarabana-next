-- ROLLBACK de la limpieza del modelo viejo de comisiones
--
-- Restaura la ESTRUCTURA, no los datos: `comision_pct` vuelve con su default
-- de 10 para todas las fichas (se pierde el 12 de Enrique Ejival) y
-- `comisiones` vuelve vacia. La subida solo corre con `comisiones` ya vacia,
-- asi que ahi no hay nada que perder; el porcentaje si.
--
-- Se recrean las policies que tenian antes, no las que les tocarian hoy: ver
-- 20260729000001_enable_rls_down.sql y 20260731000001_three_level_roles_down.sql.

begin;

alter table public.vendedores
  add column if not exists comision_pct numeric not null default 10;

create table if not exists public.comisiones (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  vendedor_id    uuid not null references public.vendedores(id) on delete cascade,
  monto_pedido   numeric not null default 0,
  porcentaje     numeric not null default 0,
  monto_comision numeric not null default 0,
  pagada         boolean not null default false,
  fecha_pago     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.comisiones enable row level security;

drop policy if exists "comisiones_read"  on public.comisiones;
drop policy if exists "comisiones_write" on public.comisiones;

create policy "comisiones_read" on public.comisiones
  for select to authenticated using (public.is_staff());
create policy "comisiones_write" on public.comisiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
