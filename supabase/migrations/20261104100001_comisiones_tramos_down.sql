-- ROLLBACK de las comisiones por tramos marginales
--
-- En una sola transaccion, igual que la subida.
--
-- OJO: tirar `comision_cortes` PIERDE los snapshots de los meses cerrados y
-- de las comisiones ya pagadas. No es reversible con los tramos: la escalera
-- puede haber cambiado desde entonces, que es justo la razon de que el corte
-- exista. Si hay cortes que te importen, expórtalos antes.
--
-- La subida no toco `vendedores.comision_pct` ni los datos de `comisiones`,
-- asi que aqui solo se restauran sus comentarios.

begin;

drop policy if exists "comision_cortes_staff_read"    on public.comision_cortes;
drop policy if exists "comision_cortes_vendedor_read" on public.comision_cortes;
drop policy if exists "comision_cortes_super_write"   on public.comision_cortes;

drop policy if exists "comision_tramos_staff_read"    on public.comision_tramos;
drop policy if exists "comision_tramos_vendedor_read" on public.comision_tramos;
drop policy if exists "comision_tramos_super_write"   on public.comision_tramos;

drop policy if exists "config_vendedor_read_impuestos" on public.app_config;

drop function if exists public.set_comision_tramos(uuid, jsonb);

-- El constraint trigger se va con la tabla; la funcion que ejecuta, no.
drop table if exists public.comision_cortes;
drop table if exists public.comision_tramos;
drop function if exists public.validar_comision_tramos();

delete from public.app_config where key = 'impuestos';

comment on table  public.app_config              is null;
comment on table  public.comisiones              is null;
comment on column public.vendedores.comision_pct is null;

commit;
