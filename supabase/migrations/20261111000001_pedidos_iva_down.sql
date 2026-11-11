-- ROLLBACK de 20261111000000_pedidos_iva.sql
--
-- Deja pedidos_saldo con sus 21 columnas de antes y quita incluye_iva e
-- iva_tasa de pedidos.
--
-- Aqui NO alcanza CREATE OR REPLACE VIEW: puede agregar columnas al final
-- pero no quitarlas. Hay que DROP + CREATE, y eso pierde los grants, asi que
-- se vuelven a dar explicitamente. El drop del view tiene que ir antes del
-- drop de las columnas, porque mientras la vista las referencie Postgres se
-- niega a borrarlas.
--
-- Aborta si algun pedido tiene incluye_iva = true. Bajar la migracion con
-- pedidos facturados con IVA no es un rollback: es bajarles el saldo sin que
-- nadie lo vea, y el importe del IVA ya cobrado se vuelve un sobrepago
-- fantasma. Si de verdad se quiere, primero se apaga el switch pedido por
-- pedido —que deja rastro en audit_log— y luego se corre esto.

begin;

do $$
declare
  v_con_iva int;
begin
  select count(*) into v_con_iva from public.pedidos where incluye_iva;
  if v_con_iva > 0 then
    raise exception using
      message = format('Hay %s pedidos con incluye_iva = true.', v_con_iva),
      hint    = 'Abortando: apaga el IVA de esos pedidos desde la aplicacion antes de bajar la migracion.';
  end if;
end $$;

drop view if exists public.pedidos_saldo;

alter table public.pedidos
  drop constraint if exists pedidos_iva_tasa_util,
  drop constraint if exists pedidos_iva_tasa_rango;

alter table public.pedidos
  drop column if exists incluye_iva,
  drop column if exists iva_tasa;

-- La definicion de 20261105000000_pedidos_fechas.sql, tal cual.
create view public.pedidos_saldo
  with (security_invoker = on)
as
select
  p.id,
  p.cliente_id,
  p.total,
  p.costo_envio,
  p.status,
  p.condiciones_pago,
  p.fecha_vencimiento,
  p.created_at,
  p.descuento_tipo,
  p.descuento_valor,

  case
    when p.descuento_tipo = 'porcentaje'::text
      then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
    when p.descuento_tipo = 'monto'::text
      then coalesce(p.descuento_valor, 0::numeric)
    else 0::numeric
  end as descuento_monto,

  p.total
    - case
        when p.descuento_tipo = 'porcentaje'::text
          then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
        when p.descuento_tipo = 'monto'::text
          then coalesce(p.descuento_valor, 0::numeric)
        else 0::numeric
      end
    + coalesce(p.costo_envio, 0::numeric) as total_con_envio,

  coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) as pagado,

  p.total
    - case
        when p.descuento_tipo = 'porcentaje'::text
          then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
        when p.descuento_tipo = 'monto'::text
          then coalesce(p.descuento_valor, 0::numeric)
        else 0::numeric
      end
    + coalesce(p.costo_envio, 0::numeric)
    - coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) as saldo,

  case
    when (
      p.total
        - case
            when p.descuento_tipo = 'porcentaje'::text
              then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
            when p.descuento_tipo = 'monto'::text
              then coalesce(p.descuento_valor, 0::numeric)
            else 0::numeric
          end
        + coalesce(p.costo_envio, 0::numeric)
        - coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric)
    ) <= 0::numeric then 'pagado'::text
    when coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) > 0::numeric
      then 'parcial'::text
    when p.fecha_vencimiento is not null and p.fecha_vencimiento < public.hoy_mx()
      then 'vencido'::text
    else 'pendiente'::text
  end as estado_cobro,

  case
    when p.fecha_vencimiento is null then 0
    else greatest(0, public.hoy_mx() - p.fecha_vencimiento)
  end as dias_vencido,

  p.fecha_pedido,
  p.fecha_entrega,
  p.fecha_entrega_real,
  p.orden_compra,
  p.folio_factura

from pedidos p
  left join pagos pg on pg.pedido_id = p.id
where p.status <> 'cancelado'::text
group by p.id;

-- El DROP se llevo los grants: aqui si hacen falta.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'pedidos_saldo'
      and array_to_string(c.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception 'pedidos_saldo quedo SIN security_invoker al recrearla.';
  end if;
end $$;

commit;
