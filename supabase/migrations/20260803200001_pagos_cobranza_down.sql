-- ROLLBACK — Pagos, cobranza y app_config

drop view if exists public.pedidos_saldo;
drop trigger if exists trg_calc_fecha_vencimiento on public.pedidos;
drop function if exists public.calc_fecha_vencimiento();

drop policy if exists "pagos_admin_write" on public.pagos;
drop policy if exists "pagos_staff_read" on public.pagos;
drop table if exists public.pagos;

alter table public.pedidos drop column if exists condiciones_pago;
alter table public.pedidos drop column if exists fecha_vencimiento;

drop policy if exists "config_super_write" on public.app_config;
drop policy if exists "config_staff_read" on public.app_config;
drop table if exists public.app_config;
