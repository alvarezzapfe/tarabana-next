-- ============================================================
-- pedidos_saldo: definicion real (ya aplicada en produccion)
-- ============================================================
--
-- Esta migracion NO cambia nada. Documenta en el repo la definicion que ya
-- esta viva en produccion, obtenida con pg_get_viewdef('public.pedidos_saldo').
--
-- Por que existe: 20260803200000_pagos_cobranza.sql define la vista con 11
-- columnas y saldo = total - pagado. Produccion tiene 16 columnas y descuenta
-- el descuento y suma el costo de envio. La divergencia venia de
-- 20260806100000_descuento_pedidos.sql, que anota "pedidos_saldo ya calcula
-- descuento_monto y lo resta" pero nunca reescribio la definicion. El repo
-- quedo mintiendo sobre la vista; ver docs/SCHEMA_NOTES.md.
--
-- Diferencias respecto al archivo viejo, todas verificadas contra las filas
-- de produccion:
--
--   * 16 columnas en vez de 11; las nuevas son costo_envio, descuento_tipo,
--     descuento_valor, descuento_monto y total_con_envio.
--   * `total` es el importe BRUTO. El neto facturado es pagado + saldo.
--   * saldo = total - descuento_monto + costo_envio - pagado.
--   * El descuento porcentual se redondea a 2 decimales.
--   * estado_cobro evalua 'parcial' ANTES de 'vencido'. El archivo viejo lo
--     hacia al reves, lo que marcaba como vencido un pedido con abono.
--   * El corte de vencimiento es CURRENT_DATE, no now(), y fecha_vencimiento
--     es `date`: CURRENT_DATE - fecha_vencimiento ya da dias enteros.
--
-- Las expresiones se reproducen tal cual las devuelve pg_get_viewdef, con el
-- CASE del descuento repetido cuatro veces. Se deja repetido a proposito: el
-- objetivo es ser identico a lo que corre, no mas elegante. Factorizarlo en
-- un CTE cambiaria el texto y abriria la puerta a cambiar la semantica del
-- agregado sin darse cuenta.
--
-- OJO si se reconstruye la base desde cero: CREATE OR REPLACE VIEW no puede
-- renombrar ni reordenar columnas existentes, solo agregar al final. En un
-- replay limpio, 20260803200000 crea la vista de 11 columnas con `status` en
-- la posicion 4, y esta migracion mete `costo_envio` ahi, asi que fallaria
-- con "cannot change name of view column". Contra produccion no falla porque
-- la vista ya tiene esta forma exacta. Para arreglar el replay hay que
-- reconciliar la definicion de 20260803200000; no se toca aqui porque
-- reescribir una migracion ya aplicada es otra decision.
-- ============================================================

create or replace view public.pedidos_saldo
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

-- Grants por default de Supabase. Con CREATE OR REPLACE la vista no se
-- recrea, asi que los grants existentes se conservan solos; estas lineas
-- estan para que la migracion sea autosuficiente en una base nueva y son
-- no-op donde ya estan dados.
--
-- Nota: la vista tiene GROUP BY, asi que no es auto-updatable. Conceder ALL
-- no habilita escritura: un insert/update/delete falla igual. Y con
-- security_invoker = on las policies RLS de pedidos y pagos se evaluan con el
-- rol que consulta, no con el dueno de la vista.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;
