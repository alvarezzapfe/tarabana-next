-- ============================================================
-- Ajuste $ por pedido: pedidos.ajuste / ajuste_motivo
-- ============================================================
--
-- El total del sistema y el total de la orden de compra del cliente no
-- siempre coinciden: centavos de redondeo, un flete que el cliente ya tenia
-- cotizado, una diferencia pactada por telefono. Sin un campo para eso, la
-- unica salida es falsear un precio o inventar un descuento.
--
-- `ajuste` puede ser positivo o negativo y SIEMPRE pide motivo. Las decisiones
-- y el porque estan en docs/plan-ajuste-pedido.md; aqui va lo que hay que
-- tener presente leyendo el SQL.
--
-- ── Donde entra y donde NO ─────────────────────────────────────────────
--
--   total_con_envio = total - descuento_monto + costo_envio + iva_monto + ajuste
--   saldo           = total_con_envio - pagado
--   base_gravable   = SIN CAMBIO
--
-- El ajuste NO causa IVA, y eso es una decision con consecuencia fiscal: en un
-- ajuste grande significa cobrar o rebajar sin impuesto, que no es lo mismo que
-- un descuento. Para cuadrar centavos es lo correcto; de ahi que el motivo sea
-- obligatorio y que la aplicacion pida confirmacion arriba del 5%.
--
-- Tampoco entra en la comision, y no hace falta tocar nada para eso: el
-- prorrateo `cobrado * (total - descuento) / total_con_envio` ya lo excluye,
-- porque el ajuste esta en el denominador y no en el numerador. Medido con
-- calcularComision: con ajuste +500, -300 y sin ajuste, los tres dan la misma
-- base.
--
-- ── Por que la vista crecio dos niveles ───────────────────────────────
--
-- `total_con_envio` aparecia escrito tres veces (en total_con_envio, en saldo y
-- en estado_cobro) y el ajuste lo habria dejado en cuatro copias de una suma de
-- cinco terminos. Una discrepancia entre copias seria invisible en la revision.
--
-- Ahora cada nivel calcula UNA cosa y la de abajo la usa por nombre:
--
--   a) agrega pagos y partidas; saca descuento_monto y gravable
--   b) base_gravable
--   c) iva_monto
--   d) total_con_envio   <- aqui entra el ajuste, una sola vez
--   e) saldo
--
-- y el select de afuera es pura proyeccion, sin una sola operacion repetida.
--
-- Las partidas siguen agregandose en una SUBCONSULTA 1:1 por pedido_id (`it`),
-- nunca como un join mas: la vista ya une `pagos`, y un join adicional
-- multiplicaria las filas y contaria cada pago una vez por partida. La
-- verificacion del final compara `pagado` contra una suma independiente
-- sacada de `pagos` justamente para cazar eso.
--
-- ── Como esta escrita ─────────────────────────────────────────────────
--
-- El SQL Editor de Supabase confirma statement por statement y NO respeta el
-- begin/commit del archivo (ver docs/SCHEMA_NOTES.md). Este archivo no depende
-- de eso: todo es IDEMPOTENTE, no usa tablas temporales, y no crea ninguna
-- funcion —asi que no hay ningun EXECUTE que revocar.
--
-- La verificacion del final es una ALARMA, no un seguro: no puede revertir
-- nada. Si truena, hay que leerla y arreglar a mano.
-- ============================================================

begin;

-- ── 1. Columnas ─────────────────────────────────────────────

alter table public.pedidos
  add column if not exists ajuste        numeric(12,2) not null default 0,
  add column if not exists ajuste_motivo text;

comment on column public.pedidos.ajuste is
  'Ajuste en pesos para cuadrar contra la orden de compra del cliente. Positivo o negativo. Se suma al total DESPUES del IVA y no causa IVA. Pide motivo.';

comment on column public.pedidos.ajuste_motivo is
  'Por que se ajusto. Obligatorio cuando ajuste <> 0 (constraint pedidos_ajuste_motivo).';


-- ── 2. Constraint ───────────────────────────────────────────
--
-- Un ajuste sin motivo es dinero movido sin explicacion: a los tres meses
-- nadie se acuerda si fueron centavos de redondeo o una concesion. El
-- `btrim` es para que un motivo de puros espacios no cuente como motivo.

alter table public.pedidos drop constraint if exists pedidos_ajuste_motivo;
alter table public.pedidos
  add constraint pedidos_ajuste_motivo
  check (ajuste = 0 or btrim(coalesce(ajuste_motivo, '')) <> '');


-- ── 3. pedidos_saldo ────────────────────────────────────────
--
-- Las 25 columnas existentes conservan nombre, tipo y POSICION —CREATE OR
-- REPLACE VIEW no puede renombrarlas ni reordenarlas— y `ajuste` se apendiza
-- al final, en la 26.

create or replace view public.pedidos_saldo
  with (security_invoker = on)
as
select
  e.id,
  e.cliente_id,
  e.total,
  e.costo_envio,
  e.status,
  e.condiciones_pago,
  e.fecha_vencimiento,
  e.created_at,
  e.descuento_tipo,
  e.descuento_valor,
  e.descuento_monto,
  e.total_con_envio,
  e.pagado,
  e.saldo,

  case
    when e.saldo <= 0::numeric then 'pagado'::text
    -- 'parcial' ANTES de 'vencido': un pedido con abono no se reporta como
    -- vencido aunque la fecha ya paso.
    when e.pagado > 0::numeric then 'parcial'::text
    when e.fecha_vencimiento is not null and e.fecha_vencimiento < public.hoy_mx()
      then 'vencido'::text
    else 'pendiente'::text
  end as estado_cobro,

  case
    when e.fecha_vencimiento is null then 0
    else greatest(0, public.hoy_mx() - e.fecha_vencimiento)
  end as dias_vencido,

  e.fecha_pedido,
  e.fecha_entrega,
  e.fecha_entrega_real,
  e.orden_compra,
  e.folio_factura,
  e.incluye_iva,
  e.iva_tasa,
  e.iva_monto,
  e.base_gravable,

  -- ── Columna nueva, al final ───────────────────────────────
  e.ajuste

from (
  select
    d.*,
    d.total_con_envio - d.pagado as saldo
  from (
    select
      c.*,
      -- El ajuste entra AQUI y en ningun otro lado. Es la unica suma del
      -- total en todo el archivo.
      c.total - c.descuento_monto + coalesce(c.costo_envio, 0::numeric)
        + c.iva_monto + coalesce(c.ajuste, 0::numeric) as total_con_envio
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
            p.ajuste,

            case
              when p.descuento_tipo = 'porcentaje'::text
                then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
              when p.descuento_tipo = 'monto'::text
                then coalesce(p.descuento_valor, 0::numeric)
              else 0::numeric
            end as descuento_monto,

            coalesce(it.gravable, 0::numeric) as gravable,

            coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0::numeric) as pagado

          from pedidos p
            left join pagos pg on pg.pedido_id = p.id
            -- 1:1 por pedido. NO es un join mas sobre pedido_items: si esto se
            -- "simplificara" a un left join directo, cada pago se contaria una
            -- vez por partida.
            left join (
              select
                i.pedido_id,
                coalesce(sum(i.cantidad * i.precio_unitario) filter (where i.incluye_iva), 0::numeric) as gravable
              from pedido_items i
              group by i.pedido_id
            ) it on it.pedido_id = p.id
          where p.status <> 'cancelado'::text
          -- `it.gravable` va en el GROUP BY porque la dependencia funcional que
          -- Postgres reconoce es sobre la PK de `pedidos`, no sobre las
          -- columnas de una subconsulta. Es un valor por pedido.
          group by p.id, it.gravable
        ) a
      ) b
    ) c
  ) d
) e;

-- Grants por default de Supabase. Con CREATE OR REPLACE la vista no se
-- recrea, asi que los existentes se conservan; estas lineas son no-op donde
-- ya estan dados y hacen la migracion autosuficiente en una base nueva.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;


-- ── 4. Verificacion ─────────────────────────────────────────
--
-- ALARMA, no seguro: con el SQL Editor confirmando statement por statement,
-- esto no puede revertir nada. Y sin foto previa: como ningun pedido tiene
-- ajuste, el invariante es auto-contenido — la vista nueva tiene que dar
-- exactamente lo que daba la vieja.

do $$
declare
  v_cols      text;
  v_esperadas text := 'id,cliente_id,total,costo_envio,status,condiciones_pago,'
                   || 'fecha_vencimiento,created_at,descuento_tipo,descuento_valor,'
                   || 'descuento_monto,total_con_envio,pagado,saldo,estado_cobro,'
                   || 'dias_vencido,fecha_pedido,fecha_entrega,fecha_entrega_real,'
                   || 'orden_compra,folio_factura,incluye_iva,iva_tasa,iva_monto,'
                   || 'base_gravable,ajuste';
  v_n         int;
  v_malos     int;
begin
  -- 4a. Las columnas nuevas: `ajuste` NOT NULL con default 0, y el motivo
  --     nullable (un pedido sin ajuste no tiene nada que explicar).
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pedidos'
     and column_name = 'ajuste' and is_nullable = 'NO' and column_default like '0%';
  if v_n <> 1 then
    raise exception using
      message = 'pedidos.ajuste no quedo NOT NULL DEFAULT 0.',
      hint    = 'Un ajuste en null haria que el total entero quedara en null.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedidos' and column_name = 'ajuste_motivo'
  ) then
    raise exception using message = 'Falta pedidos.ajuste_motivo.';
  end if;

  -- 4b. El constraint existe y ninguna fila lo viola.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_ajuste_motivo'
  ) then
    raise exception using message = 'Falta el constraint pedidos_ajuste_motivo.';
  end if;

  select count(*) into v_malos
    from public.pedidos
   where ajuste <> 0 and btrim(coalesce(ajuste_motivo, '')) = '';
  if v_malos > 0 then
    raise exception using message = format('%s pedidos tienen ajuste sin motivo.', v_malos);
  end if;

  -- 4c. Las 26 columnas de la vista, en orden.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pedidos_saldo';
  if v_cols is distinct from v_esperadas then
    raise exception using
      message = 'pedidos_saldo no quedo con las 26 columnas esperadas en orden.',
      detail  = format('quedo: %s', v_cols),
      hint    = 'CREATE OR REPLACE VIEW no renombra ni reordena: ajuste va al final.';
  end if;

  -- 4d. security_invoker. Sin el, un vendedor veria saldos ajenos.
  if not exists (
    select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and k.relname = 'pedidos_saldo'
       and array_to_string(k.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception using
      message = 'pedidos_saldo quedo SIN security_invoker: un vendedor veria saldos ajenos.';
  end if;

  -- 4e. Nada de current_date: entre las 18:00 y la medianoche de CDMX
  --     adelantaria un dia el vencimiento.
  if pg_get_viewdef('public.pedidos_saldo'::regclass) ilike '%current_date%' then
    raise exception using message = 'pedidos_saldo quedo usando current_date en vez de hoy_mx().';
  end if;

  -- 4f. EL CHECK DEL FAN-OUT. `pagado` contra una suma independiente sacada de
  --     `pagos`: si las partidas se colaran como un join mas, cada pago se
  --     contaria una vez por partida y esto lo caza.
  select count(*) into v_malos
    from public.pedidos_saldo v
   where v.pagado is distinct from coalesce(
           (select sum(g.monto) from public.pagos g
             where g.pedido_id = v.id and g.cancelado_at is null), 0::numeric);
  if v_malos > 0 then
    raise exception using
      message = format('`pagado` no cuadra en %s pedidos: la vista esta multiplicando filas.', v_malos),
      hint    = 'Las partidas tienen que agregarse en una subconsulta 1:1, no en un join mas.';
  end if;

  -- 4g. Una fila por pedido no cancelado, ni mas ni menos.
  select count(*) into v_n from public.pedidos where status <> 'cancelado';
  if (select count(*) from public.pedidos_saldo) <> v_n then
    raise exception using
      message = 'pedidos_saldo no devuelve una fila por pedido no cancelado.',
      hint    = 'Se toco el where o el group by de la agregacion.';
  end if;

  -- 4h. Sin ajustes, el total es EXACTAMENTE el de antes de esta migracion.
  select count(*) into v_n from public.pedidos where ajuste <> 0;
  if v_n = 0 then
    select count(*) into v_malos
      from public.pedidos_saldo v
     where v.ajuste <> 0::numeric
        or v.total_con_envio <> v.total - v.descuento_monto
             + coalesce(v.costo_envio, 0::numeric) + v.iva_monto
        or v.saldo <> v.total_con_envio - v.pagado;
    if v_malos > 0 then
      raise exception using
        message = format('%s pedidos cambiaron de total sin tener un solo ajuste.', v_malos);
    end if;
  end if;

  -- 4i. El ajuste NO toca la base gravable: con el IVA de hoy apagado en
  --     todas las partidas, la base sigue en cero.
  select count(*) into v_n from public.pedido_items where incluye_iva;
  if v_n = 0 then
    select count(*) into v_malos
      from public.pedidos_saldo where base_gravable <> 0::numeric or iva_monto <> 0::numeric;
    if v_malos > 0 then
      raise exception using
        message = format('%s pedidos traen base gravable sin una sola partida gravada.', v_malos);
    end if;
  end if;

  raise notice 'Ajuste listo: pedidos_saldo con 26 columnas, pagado intacto, ningun total movido.';
end $$;

commit;
