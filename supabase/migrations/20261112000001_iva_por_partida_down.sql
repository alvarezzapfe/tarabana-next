-- ROLLBACK de 20261112000000_iva_por_partida.sql
--
-- Deja el IVA como estaba: un switch por PEDIDO. Quita
-- `pedido_items.incluye_iva` y `pedidos.envio_incluye_iva`, borra los
-- triggers del resumen, devuelve `pedidos_saldo` a sus 24 columnas y
-- `set_pedido_items` a la version que no conoce el IVA por partida.
--
-- ── Por que todo esta dentro de UN bloque ──────────────────────────────
--
-- Aborta si alguna partida tiene incluye_iva = true. Bajar esto con partidas
-- gravadas no es un rollback: les quita el IVA sin que nadie lo vea, y el
-- importe ya cobrado se vuelve un sobrepago fantasma.
--
-- Ese guard tiene que estar en el MISMO bloque que lo que protege, porque el
-- SQL Editor de Supabase confirma statement por statement y un `raise` suelto
-- arriba no impide que lo de abajo corra (ver docs/SCHEMA_NOTES.md). Y lo de
-- abajo incluye recrear la vista sin `base_gravable` mientras las partidas
-- siguen declarando IVA: la vista dejaria de cobrar un impuesto que los datos
-- todavia dicen traer, en silencio.
--
-- `set_pedido_items` TIENE que restaurarse aqui, no es cosmetico: la version
-- nueva inserta `incluye_iva`, y en cuanto la columna no exista, cada llamada
-- tronaria.
--
-- El bloque usa el tag $rollback$ porque adentro viaja una funcion con su
-- propio $fn$; con $$ en los dos niveles, el primero cerraria al segundo.

begin;

do $rollback$
declare
  v_gravadas int;
begin
  select count(*) into v_gravadas from public.pedido_items where incluye_iva;
  if v_gravadas > 0 then
    raise exception using
      message = format('Hay %s partidas con incluye_iva = true.', v_gravadas),
      hint    = 'Abortando: quitales el IVA desde la aplicacion antes de bajar la migracion.';
  end if;

  -- Los triggers primero: si no, cada update de abajo los dispara de balde.
  execute 'drop trigger if exists trg_pedido_items_sync_iva on public.pedido_items';
  execute 'drop trigger if exists trg_pedidos_sync_iva on public.pedidos';
  execute 'drop function if exists public.trg_sync_incluye_iva_items()';
  execute 'drop function if exists public.trg_sync_incluye_iva_pedido()';

  -- La vista va antes de soltar las columnas: mientras las referencie,
  -- Postgres se niega a borrarlas. Y no alcanza CREATE OR REPLACE, que puede
  -- agregar columnas al final pero no quitarlas.
  execute 'drop view if exists public.pedidos_saldo';

  execute 'drop function if exists public.pedido_todas_las_partidas_con_iva(uuid)';

  execute 'alter table public.pedido_items drop column if exists incluye_iva';
  execute 'alter table public.pedidos     drop column if exists envio_incluye_iva';

  -- Los constraints de la tasa, como los dejo 20261111000000.
  execute 'alter table public.pedidos drop constraint if exists pedidos_iva_tasa_rango';
  execute 'alter table public.pedidos drop constraint if exists pedidos_iva_tasa_util';
  execute 'alter table public.pedidos
             add constraint pedidos_iva_tasa_rango check (iva_tasa >= 0 and iva_tasa < 1)';
  execute 'alter table public.pedidos
             add constraint pedidos_iva_tasa_util check (not incluye_iva or iva_tasa > 0)';

  -- La vista de 24 columnas de 20261111000000, tal cual.
  execute '
    create or replace view public.pedidos_saldo
      with (security_invoker = on)
    as
    select
      b.id,
      b.cliente_id,
      b.total,
      b.costo_envio,
      b.status,
      b.condiciones_pago,
      b.fecha_vencimiento,
      b.created_at,
      b.descuento_tipo,
      b.descuento_valor,
      b.descuento_monto,

      b.base + b.iva_monto as total_con_envio,

      b.pagado,

      b.base + b.iva_monto - b.pagado as saldo,

      case
        when (b.base + b.iva_monto - b.pagado) <= 0::numeric then ''pagado''::text
        -- ''parcial'' ANTES de ''vencido'': un pedido con abono no se reporta como
        -- vencido aunque la fecha ya paso.
        when b.pagado > 0::numeric then ''parcial''::text
        when b.fecha_vencimiento is not null and b.fecha_vencimiento < public.hoy_mx()
          then ''vencido''::text
        else ''pendiente''::text
      end as estado_cobro,

      case
        when b.fecha_vencimiento is null then 0
        else greatest(0, public.hoy_mx() - b.fecha_vencimiento)
      end as dias_vencido,

      b.fecha_pedido,
      b.fecha_entrega,
      b.fecha_entrega_real,
      b.orden_compra,
      b.folio_factura,

      -- ── Columnas nuevas, al final ─────────────────────────────
      b.incluye_iva,
      b.iva_tasa,
      b.iva_monto

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

        case
          when p.descuento_tipo = ''porcentaje''::text
            then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
          when p.descuento_tipo = ''monto''::text
            then coalesce(p.descuento_valor, 0::numeric)
          else 0::numeric
        end as descuento_monto,

        -- La base gravable: mercancia menos descuento mas envio. Es exactamente
        -- lo que `total_con_envio` valia antes de que existiera el IVA.
        p.total
          - case
              when p.descuento_tipo = ''porcentaje''::text
                then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
              when p.descuento_tipo = ''monto''::text
                then coalesce(p.descuento_valor, 0::numeric)
              else 0::numeric
            end
          + coalesce(p.costo_envio, 0::numeric) as base,

        -- round(..., 2) y no truncado: es el mismo redondeo que ya usa el
        -- descuento porcentual, y el que replica ivaDe() en src/lib/iva.ts.
        -- coalesce sobre una columna not null es defensivo a proposito: si algun
        -- dia la columna se vuelve nullable, esto cobra 0 de IVA en vez de dejar
        -- el saldo entero en null.
        case
          when p.incluye_iva
            then round(
              (
                p.total
                  - case
                      when p.descuento_tipo = ''porcentaje''::text
                        then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
                      when p.descuento_tipo = ''monto''::text
                        then coalesce(p.descuento_valor, 0::numeric)
                      else 0::numeric
                    end
                  + coalesce(p.costo_envio, 0::numeric)
              ) * coalesce(p.iva_tasa, 0::numeric),
              2
            )
          else 0::numeric
        end as iva_monto,

        coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) as pagado

      from pedidos p
        left join pagos pg on pg.pedido_id = p.id
      where p.status <> ''cancelado''::text
      group by p.id
    ) b';

  -- El DROP se llevo los grants: aqui si hacen falta.
  execute 'grant all on public.pedidos_saldo to anon';
  execute 'grant all on public.pedidos_saldo to authenticated';
  execute 'grant all on public.pedidos_saldo to service_role';
  execute 'grant all on public.pedidos_saldo to postgres';

  -- set_pedido_items de 20261110000000, sin incluye_iva.
  execute '
    create or replace function public.set_pedido_items(
      p_pedido_id uuid,
      p_items     jsonb,
      p_total     numeric
    )
    returns setof public.pedido_items
    language plpgsql
    set search_path = public as $fn$
    declare
      v_status     text;
      v_previas    int;
      v_borradas   int;
      v_insertadas int;
      v_esperadas  int;
      v_total      numeric;
      v_filas      int;
      v_item       jsonb;
    begin
      -- ── 1. El pedido existe y se puede editar ───────────────────
      select status into v_status from public.pedidos where id = p_pedido_id;
      if not found then
        raise exception ''No existe el pedido %'', p_pedido_id
          using errcode = ''23503'';
      end if;

      if v_status in (''entregado'', ''cancelado'') then
        raise exception ''El pedido esta "%" y sus partidas ya no se pueden editar'', v_status
          using errcode = ''55000'',
                hint    = ''Un entregado ya descontó inventario; un cancelado no va a salir.'';
      end if;

      -- ── 2. La forma del payload ─────────────────────────────────
      if p_items is null or jsonb_typeof(p_items) <> ''array'' then
        raise exception ''p_items debe ser un arreglo JSON, llego %'', coalesce(jsonb_typeof(p_items), ''null'')
          using errcode = ''22023'';
      end if;

      v_esperadas := jsonb_array_length(p_items);
      if v_esperadas = 0 then
        raise exception ''Un pedido no puede quedarse sin partidas''
          using errcode = ''22023'',
                hint    = ''Para dejarlo sin productos, cancela el pedido.'';
      end if;

      for v_item in select value from jsonb_array_elements(p_items) loop
        if (v_item->>''producto_id'') is null then
          raise exception ''Hay una partida sin producto_id'' using errcode = ''22023'';
        end if;
        if coalesce((v_item->>''cantidad'')::int, 0) <= 0 then
          raise exception ''La partida de % trae cantidad %, y tiene que ser mayor que 0'',
            v_item->>''producto_id'', coalesce(v_item->>''cantidad'', ''null'')
            using errcode = ''22023'';
        end if;
        if coalesce((v_item->>''precio_unitario'')::numeric, -1) < 0 then
          raise exception ''La partida de % trae un precio negativo'', v_item->>''producto_id''
            using errcode = ''22023'';
        end if;
      end loop;

      -- ── 3. Reemplazo ────────────────────────────────────────────
      select count(*) into v_previas from public.pedido_items where pedido_id = p_pedido_id;

      delete from public.pedido_items where pedido_id = p_pedido_id;
      get diagnostics v_borradas = row_count;

      -- El guard que convierte un no-op de RLS en un error. Ver la nota de
      -- arriba: sin esto, quien no puede borrar igual insertaria y el pedido
      -- quedaria con las partidas viejas mas las nuevas.
      if v_borradas <> v_previas then
        raise exception ''Se esperaba borrar % partidas y se borraron %'', v_previas, v_borradas
          using errcode = ''42501'',
                hint    = ''Sin permiso para borrar las partidas de este pedido. No se escribio nada.'';
      end if;

      for v_item in select value from jsonb_array_elements(p_items) loop
        insert into public.pedido_items (
          pedido_id, producto_id, unidad, cantidad, precio_unitario, subtotal, metadata
        ) values (
          p_pedido_id,
          (v_item->>''producto_id'')::uuid,
          nullif(v_item->>''unidad'', ''''),
          (v_item->>''cantidad'')::int,
          (v_item->>''precio_unitario'')::numeric,
          (v_item->>''cantidad'')::int * (v_item->>''precio_unitario'')::numeric,
          case
            when v_item->''metadata'' is null or v_item->''metadata'' = ''null''::jsonb then null
            else v_item->''metadata''
          end
        );
      end loop;

      select count(*) into v_insertadas from public.pedido_items where pedido_id = p_pedido_id;
      if v_insertadas <> v_esperadas then
        raise exception ''Se esperaban % partidas y quedaron %'', v_esperadas, v_insertadas
          using errcode = ''42501'';
      end if;

      -- ── 4. El total sale de las partidas, no del cliente ────────
      --
      -- `pedidos.total` es el importe BRUTO, antes de descuento y envio: la vista
      -- `pedidos_saldo` les resta/suma eso despues (ver docs/SCHEMA_NOTES.md).
      -- Aqui se suma exactamente lo mismo que suma `calcularPedido`.
      select coalesce(sum(cantidad * precio_unitario), 0)
        into v_total
        from public.pedido_items
       where pedido_id = p_pedido_id;

      if round(v_total, 2) is distinct from round(p_total, 2) then
        raise exception ''El total no cuadra: las partidas suman % y se mando %'',
          round(v_total, 2), round(p_total, 2)
          using errcode = ''22023'',
                hint    = ''El servidor y el cliente calcularon distinto. No se escribio nada.'';
      end if;

      update public.pedidos set total = v_total where id = p_pedido_id;
      get diagnostics v_filas = row_count;
      if v_filas <> 1 then
        raise exception ''No se pudo actualizar el total del pedido %'', p_pedido_id
          using errcode = ''42501'',
                hint    = ''Sin permiso de UPDATE sobre el pedido. No se escribio nada.'';
      end if;

      return query
        select * from public.pedido_items
         where pedido_id = p_pedido_id
         order by created_at, id;
    end $fn$';

  if not exists (
    select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and k.relname = 'pedidos_saldo'
       and array_to_string(k.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception 'pedidos_saldo quedo SIN security_invoker al recrearla.';
  end if;

  raise notice 'IVA por partida revertido: pedidos_saldo de vuelta en 24 columnas.';
end $rollback$;

commit;
