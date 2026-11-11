-- ROLLBACK de 20261113000000_pedido_ajuste.sql
--
-- Quita `pedidos.ajuste` y `pedidos.ajuste_motivo`, y devuelve `pedidos_saldo`
-- a sus 25 columnas.
--
-- No alcanza CREATE OR REPLACE VIEW: puede agregar columnas al final pero no
-- quitarlas. Hay que DROP + CREATE, y eso pierde los grants, asi que se
-- vuelven a dar explicitamente.
--
-- ── Por que todo esta dentro de UN bloque ──────────────────────────────
--
-- Esto aborta si algun pedido tiene un ajuste distinto de cero. Bajarlo con
-- ajustes puestos no es un rollback: les cambia el total sin que nadie lo vea
-- —para arriba o para abajo segun el signo— y el motivo, que es la unica
-- explicacion que existe, se va con la columna.
--
-- El guard tiene que estar en el MISMO bloque que lo que protege, porque el
-- SQL Editor de Supabase confirma statement por statement y un `raise` suelto
-- arriba no impide que lo de abajo corra (ver docs/SCHEMA_NOTES.md). Y lo de
-- abajo incluye recrear la vista sin el ajuste mientras la columna todavia
-- tiene valores: el saldo cambiaria en silencio.

begin;

do $rollback$
declare
  v_con_ajuste int;
begin
  select count(*) into v_con_ajuste from public.pedidos where ajuste <> 0;
  if v_con_ajuste > 0 then
    raise exception using
      message = format('Hay %s pedidos con ajuste distinto de cero.', v_con_ajuste),
      hint    = 'Abortando: pon esos ajustes en 0 desde la aplicacion antes de bajar la migracion.';
  end if;

  -- La vista va antes de soltar la columna: mientras la referencie, Postgres
  -- se niega a borrarla.
  execute 'drop view if exists public.pedidos_saldo';

  execute 'alter table public.pedidos drop constraint if exists pedidos_ajuste_motivo';
  execute 'alter table public.pedidos
             drop column if exists ajuste,
             drop column if exists ajuste_motivo';

  -- La vista de 25 columnas de 20261112000000, tal cual.
  execute '
    create or replace view public.pedidos_saldo
      with (security_invoker = on)
    as
    select
      c.id,
      c.cliente_id,
      c.total,
      c.costo_envio,
      c.status,
      c.condiciones_pago,
      c.fecha_vencimiento,
      c.created_at,
      c.descuento_tipo,
      c.descuento_valor,
      c.descuento_monto,

      c.total - c.descuento_monto + coalesce(c.costo_envio, 0::numeric) + c.iva_monto as total_con_envio,

      c.pagado,

      c.total - c.descuento_monto + coalesce(c.costo_envio, 0::numeric) + c.iva_monto - c.pagado as saldo,

      case
        when (c.total - c.descuento_monto + coalesce(c.costo_envio, 0::numeric) + c.iva_monto - c.pagado) <= 0::numeric
          then ''pagado''::text
        -- ''parcial'' ANTES de ''vencido'': un pedido con abono no se reporta como
        -- vencido aunque la fecha ya paso.
        when c.pagado > 0::numeric then ''parcial''::text
        when c.fecha_vencimiento is not null and c.fecha_vencimiento < public.hoy_mx()
          then ''vencido''::text
        else ''pendiente''::text
      end as estado_cobro,

      case
        when c.fecha_vencimiento is null then 0
        else greatest(0, public.hoy_mx() - c.fecha_vencimiento)
      end as dias_vencido,

      c.fecha_pedido,
      c.fecha_entrega,
      c.fecha_entrega_real,
      c.orden_compra,
      c.folio_factura,
      c.incluye_iva,
      c.iva_tasa,
      c.iva_monto,

      -- ── Columna nueva, al final ───────────────────────────────
      c.base_gravable

    from (
      select
        b.*,
        round(b.base_gravable * b.iva_tasa, 2) as iva_monto
      from (
        select
          a.*,
          round(
            a.gravable
              * case
                  when a.total > 0::numeric
                    then greatest(0::numeric, 1::numeric - a.descuento_monto / a.total)
                  else 1::numeric
                end
              + case when a.envio_incluye_iva then coalesce(a.costo_envio, 0::numeric) else 0::numeric end,
            2
          ) as base_gravable
        from (
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
            p.fecha_pedido,
            p.fecha_entrega,
            p.fecha_entrega_real,
            p.orden_compra,
            p.folio_factura,
            p.incluye_iva,
            p.iva_tasa,
            p.envio_incluye_iva,

            case
              when p.descuento_tipo = ''porcentaje''::text
                then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
              when p.descuento_tipo = ''monto''::text
                then coalesce(p.descuento_valor, 0::numeric)
              else 0::numeric
            end as descuento_monto,

            coalesce(it.gravable, 0::numeric) as gravable,

            coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) as pagado

          from pedidos p
            left join pagos pg on pg.pedido_id = p.id
            -- 1:1 por pedido. NO es un join mas sobre pedido_items: ver el
            -- encabezado. Si esto se "simplificara" a un left join directo, cada
            -- pago se contaria una vez por partida.
            left join (
              select
                i.pedido_id,
                coalesce(sum(i.cantidad * i.precio_unitario) filter (where i.incluye_iva), 0::numeric) as gravable
              from pedido_items i
              group by i.pedido_id
            ) it on it.pedido_id = p.id
          where p.status <> ''cancelado''::text
          -- `it.gravable` va en el GROUP BY porque la dependencia funcional que
          -- Postgres reconoce es sobre la PK de `pedidos`, no sobre las columnas
          -- de una subconsulta. Es un valor por pedido, asi que no agrupa de mas.
          group by p.id, it.gravable
        ) a
      ) b
    ) c';

  -- El DROP se llevo los grants: aqui si hacen falta.
  execute 'grant all on public.pedidos_saldo to anon';
  execute 'grant all on public.pedidos_saldo to authenticated';
  execute 'grant all on public.pedidos_saldo to service_role';
  execute 'grant all on public.pedidos_saldo to postgres';

  if not exists (
    select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and k.relname = 'pedidos_saldo'
       and array_to_string(k.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception 'pedidos_saldo quedo SIN security_invoker al recrearla.';
  end if;

  raise notice 'Ajuste revertido: pedidos_saldo de vuelta en 25 columnas.';
end $rollback$;

commit;
