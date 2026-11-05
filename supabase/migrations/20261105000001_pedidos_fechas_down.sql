-- ROLLBACK de las fechas y datos del pedido
--
-- En una sola transaccion, igual que la subida.
--
-- OJO: tirar las columnas PIERDE datos que no se pueden recuperar.
--
--   * `fecha_pedido` vuelve a ser `created_at`, asi que toda fecha retroactiva
--     que se haya capturado se pierde y el dashboard regresa a agrupar por
--     fecha de captura.
--   * `fecha_entrega_real`, `orden_compra` y `folio_factura` se van completas.
--
-- `fecha_entrega` NO se toca: ya existia antes de esta migracion.
-- Los `fecha_vencimiento` ya calculados se quedan como esten: recalcularlos
-- hacia atras moveria dinero vencido sin necesidad.
--
-- OJO: este rollback REINSTALA el bug de zona horaria. Vuelve a dejar
-- `current_date` (UTC) en la vista y en el trigger, asi que entre las 18:00 y
-- la medianoche de CDMX los pedidos se marcaran vencidos un dia antes y
-- `dias_vencido` saldra 1 de mas. Es lo que significa volver al estado
-- anterior, pero conviene saberlo antes de correrlo.

begin;

-- ── 1. El trigger, de vuelta a created_at ───────────────────
--
-- Se restaura textual el de 20260803200000_pagos_cobranza.sql, incluido que
-- no valida nada y que solo dispara con `update of condiciones_pago`.

create or replace function public.calc_fecha_vencimiento()
returns trigger language plpgsql as $$
begin
  if NEW.condiciones_pago = 'contado' then
    NEW.fecha_vencimiento := NEW.created_at;
  elsif NEW.condiciones_pago = '15_dias' then
    NEW.fecha_vencimiento := NEW.created_at + interval '15 days';
  elsif NEW.condiciones_pago = '30_dias' then
    NEW.fecha_vencimiento := NEW.created_at + interval '30 days';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_calc_fecha_vencimiento on public.pedidos;
create trigger trg_calc_fecha_vencimiento
  before insert or update of condiciones_pago on public.pedidos
  for each row execute function public.calc_fecha_vencimiento();

-- El grant extra a service_role se deja: es inocuo y quitarlo solo agrega
-- una forma de romper un script si alguien vuelve a necesitarlo.


-- ── 2. pedidos_saldo, sin las columnas nuevas ───────────────
--
-- CREATE OR REPLACE no puede QUITAR columnas, asi que la vista se tira y se
-- recrea con la definicion de 20261103000000. Por eso van los grants abajo:
-- al recrearla si se pierden.

drop view if exists public.pedidos_saldo;

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
    when p.fecha_vencimiento is not null and p.fecha_vencimiento < current_date
      then 'vencido'::text
    else 'pendiente'::text
  end as estado_cobro,

  case
    when p.fecha_vencimiento is null then 0
    else greatest(0, current_date - p.fecha_vencimiento)
  end as dias_vencido

from pedidos p
  left join pagos pg on pg.pedido_id = p.id
where p.status <> 'cancelado'::text
group by p.id;

grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'pedidos_saldo'
      and array_to_string(c.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception 'pedidos_saldo quedo SIN security_invoker al recrearla.';
  end if;
end $$;


-- ── 3. Las columnas y el helper, al final ───────────────────
--
-- `hoy_mx()` se tira DESPUES de recrear la vista: mientras la vista la
-- referenciaba, el drop habria fallado por dependencia.

drop index if exists public.pedidos_fecha_pedido_idx;

comment on column public.pedidos.created_at    is null;
comment on column public.pedidos.fecha_entrega is null;

-- El default de fecha_pedido depende de hoy_mx(), asi que la columna se va
-- primero y la funcion despues.
alter table public.pedidos
  drop column if exists fecha_pedido,
  drop column if exists fecha_entrega_real,
  drop column if exists orden_compra,
  drop column if exists folio_factura;

drop function if exists public.hoy_mx();

commit;
