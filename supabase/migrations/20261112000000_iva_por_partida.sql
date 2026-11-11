-- ============================================================
-- IVA por PARTIDA: pedido_items.incluye_iva, envio_incluye_iva
-- ============================================================
--
-- Sucede a 20261111000000, que modelo el IVA como un switch por PEDIDO. Ahora
-- cada partida decide si va gravada, el envio decide por su cuenta, y
-- `pedidos.incluye_iva` se queda como RESUMEN derivado.
--
-- Las decisiones y el porque estan en docs/plan-iva-partida.md. Aqui va lo
-- que hay que tener presente mientras se lee el SQL.
--
-- ── EL RIESGO: el fan-out de la vista ──────────────────────────────────
--
-- `pedidos_saldo` hace `left join pagos` y agrupa por `p.id`. Sumar las
-- partidas gravables con un SEGUNDO left join a `pedido_items` multiplicaria
-- las filas: cada pago se contaria una vez POR PARTIDA. Un pedido con 3
-- partidas y un pago de $400 reportaria $1,200 cobrados y el saldo se caeria,
-- sin error y sin aviso.
--
-- Por eso las partidas se agregan en una SUBCONSULTA 1:1 por `pedido_id`
-- (`it` mas abajo), nunca como un join mas. La verificacion del final compara
-- `pagado` contra una suma independiente sacada de `pagos`: si el fan-out se
-- cuela, ese check lo caza.
--
-- ── Por que `cantidad * precio_unitario` y no `subtotal` ───────────────
--
-- `pedido_items.subtotal` existe, pero en produccion **1 de 34 partidas lo
-- tiene en NULL** (eec25a6f, la partida huerfana de #0E1B76). Con `sum(subtotal)`
-- ese pedido calcularia $1,000 menos de base gravable. Con
-- `sum(cantidad * precio_unitario)` el total cuadra en 16 de 16 pedidos, que
-- es ademas la misma suma que hacen `calcularPedido` y `set_pedido_items`.
--
-- ── La formula ─────────────────────────────────────────────────────────
--
--   gravable    = suma de (cantidad * precio_unitario) de las partidas gravadas
--   razon       = 1 - descuento_monto / total   (1 si total = 0; nunca negativa)
--   base_grav   = round( gravable * razon + (costo_envio si envio_incluye_iva), 2 )
--   iva_monto   = round( base_grav * iva_tasa, 2 )
--   total_con_envio = total - descuento_monto + costo_envio + iva_monto
--
-- El descuento se PRORRATEA: baja el pedido completo, asi que la parte gravada
-- baja en la misma proporcion. El `greatest(0, ...)` es por un descuento de
-- tipo monto mayor que el total — `crearPedido` lo rechaza, pero la ruta de
-- edicion no lo revalida, y sin el clamp la base se iria a negativo.
--
-- La base se redondea ANTES de aplicarle la tasa, a proposito: la base se
-- imprime en el documento, y si el IVA saliera del valor sin redondear, el
-- cliente leeria "Base 379.49 - IVA 60.72" y al multiplicar no siempre le
-- daria. Redondeando primero, lo impreso cuadra — que ademas es como se arma
-- un CFDI.
--
-- ── `pedidos.incluye_iva` pasa a ser DERIVADA ──────────────────────────
--
--   incluye_iva = hay partidas
--                 y todas gravadas
--                 y (costo_envio = 0 o envio_incluye_iva)
--
-- La mantienen triggers y ya no la escribe nadie a mano: los triggers cubren
-- INSERT y UPDATE de `pedidos` y cualquier cambio de `pedido_items`, asi que
-- la columna no puede quedar diciendo una cosa y las partidas otra.
--
-- El envio en 0 no cuenta: si contara, un pedido con todo gravado y sin flete
-- mostraria el switch general apagado para siempre, porque no hay forma de
-- prenderle el IVA a un envio que no existe.
--
-- Los triggers van en SECURITY DEFINER con search_path fijo, y no por comodidad:
-- el vendedor tiene INSERT sobre `pedido_items` pero NO tiene UPDATE sobre
-- `pedidos` (20261103100000). Un trigger normal que hiciera `update pedidos`
-- correria bajo RLS y afectaria CERO filas en silencio —RLS no tira error—,
-- asi que el resumen quedaria mal en todos los pedidos que levante un
-- vendedor. Cada funcion escribe unicamente `incluye_iva`, y solo del pedido
-- dueno de la fila.
--
-- ── Como esta escrita ──────────────────────────────────────────────────
--
-- El SQL Editor de Supabase confirma statement por statement y NO respeta el
-- begin/commit del archivo (ver docs/SCHEMA_NOTES.md). Este archivo no depende
-- de eso: el begin/commit esta por si se corre con psql, pero todo es
-- IDEMPOTENTE —`if not exists`, `create or replace`, backfills que son no-op
-- en la segunda corrida— y no usa tablas temporales.
--
-- La verificacion del final es una ALARMA, no un seguro: no puede revertir
-- nada. Si truena, hay que leerla y arreglar a mano.
-- ============================================================

begin;

-- ── 1. Columnas ─────────────────────────────────────────────

alter table public.pedido_items
  add column if not exists incluye_iva boolean not null default false;

alter table public.pedidos
  add column if not exists envio_incluye_iva boolean not null default false;

comment on column public.pedido_items.incluye_iva is
  'Si esta partida se factura con IVA. Los precios de lista son sin IVA (el IEPS si va incluido).';

comment on column public.pedidos.envio_incluye_iva is
  'Si el costo de envio causa IVA. Independiente de las partidas: se puede facturar mercancia gravada con flete exento y al reves.';

comment on column public.pedidos.incluye_iva is
  'RESUMEN DERIVADO, lo mantienen los triggers de 20261112000000: true si el pedido tiene partidas, todas gravadas, y el envio es 0 o gravado. No escribir a mano: el trigger lo recalcula en cada INSERT/UPDATE.';


-- ── 2. Constraints ──────────────────────────────────────────
--
-- El viejo `pedidos_iva_tasa_util` ("si incluye_iva entonces tasa > 0") deja
-- de garantizar nada: con IVA por partida un pedido puede tener partidas
-- gravadas y el resumen en false. Se reemplaza por exigir la tasa SIEMPRE.
-- Todos los pedidos ya estan en 0.16, asi que no rechaza nada existente.

alter table public.pedidos drop constraint if exists pedidos_iva_tasa_util;
alter table public.pedidos drop constraint if exists pedidos_iva_tasa_rango;
alter table public.pedidos
  add constraint pedidos_iva_tasa_rango
  check (iva_tasa > 0 and iva_tasa < 1);


-- ── 3. Backfill ─────────────────────────────────────────────
--
-- Hoy no hay ni un pedido con IVA, asi que esto no mueve nada. Se escribe
-- igual para que sea correcto el dia que se replique en otra base, y para que
-- la migracion no dependa de que "hoy esta vacio".
--
-- El envio va PRIMERO: si fuera al reves, marcar las partidas dispararia el
-- trigger del resumen, que con el envio todavia sin marcar pondria
-- incluye_iva = false, y el backfill del envio ya no encontraria a quien
-- marcar. (Los triggers se crean despues, pero el orden se deja correcto por
-- si alguien corre el archivo dos veces.)

update public.pedidos
   set envio_incluye_iva = true
 where incluye_iva
   and not envio_incluye_iva;

update public.pedido_items i
   set incluye_iva = true
  from public.pedidos p
 where p.id = i.pedido_id
   and p.incluye_iva
   and not i.incluye_iva;


-- ── 4. El resumen: funciones y triggers ─────────────────────

create or replace function public.pedido_todas_las_partidas_con_iva(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  -- "Hay partidas y ninguna sin IVA". El `not exists` sobre las NO gravadas
  -- y no un `bool_and`, para que un pedido sin partidas de false en vez de
  -- del true vacuo que daria bool_and sobre cero filas.
  select exists (select 1 from public.pedido_items i where i.pedido_id = p_pedido_id)
     and not exists (
       select 1 from public.pedido_items i
        where i.pedido_id = p_pedido_id and not i.incluye_iva
     );
$$;

comment on function public.pedido_todas_las_partidas_con_iva(uuid) is
  'SECURITY DEFINER: la usan los triggers del resumen de IVA, y el vendedor no puede leer ni escribir pedidos ajenos. Solo lee pedido_items del pedido que se le pasa. EXECUTE revocado: no es una API.';

-- Una funcion SECURITY DEFINER que devuelve un escalar y conserva el EXECUTE
-- por default de PUBLIC queda PUBLICADA como RPC por PostgREST. Esta en
-- particular contesta "este pedido lleva IVA en todas sus partidas" saltandose
-- RLS, asi que cualquier anon podria sondear pedidos ajenos de uno en uno.
--
-- Se revoca. Los triggers no la llaman por privilegio del que invoca sino
-- dentro de funciones que tambien son DEFINER, asi que siguen funcionando.
--
-- Las otras dos funciones de este bloque devuelven `trigger`, y PostgREST no
-- publica ese tipo de retorno: no necesitan revoke.
--
-- (Esto lo detecto y lo corrio a mano el dueno del proyecto despues de aplicar
-- la migracion; queda aqui para que una base nueva nazca igual.)
revoke execute on function public.pedido_todas_las_partidas_con_iva(uuid)
  from public, anon, authenticated;

-- Cambio en las PARTIDAS -> recalcular el resumen del pedido.
create or replace function public.trg_sync_incluye_iva_items()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos p
     set incluye_iva = public.pedido_todas_las_partidas_con_iva(v_pedido)
                       and (coalesce(p.costo_envio, 0) = 0 or p.envio_incluye_iva)
   where p.id = v_pedido;
  return null;  -- AFTER trigger: el valor de retorno se ignora
end $$;

-- Cambio en el PEDIDO (envio, costo) -> recalcular antes de escribir.
--
-- Sin clausula WHEN y cubriendo tambien el INSERT a proposito: asi la columna
-- es 100% derivada y nadie puede dejarla mintiendo con un update a mano. En un
-- INSERT todavia no hay partidas, asi que arranca en false y el trigger de
-- arriba la corrige cuando entren.
create or replace function public.trg_sync_incluye_iva_pedido()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  new.incluye_iva := public.pedido_todas_las_partidas_con_iva(new.id)
                     and (coalesce(new.costo_envio, 0) = 0 or new.envio_incluye_iva);
  return new;
end $$;

-- `create or replace trigger` (PG14+) para que el archivo sea idempotente sin
-- un drop suelto que dejaria la tabla sin trigger si el script se interrumpe
-- justo ahi.
create or replace trigger trg_pedido_items_sync_iva
  after insert or update or delete on public.pedido_items
  for each row execute function public.trg_sync_incluye_iva_items();

create or replace trigger trg_pedidos_sync_iva
  before insert or update on public.pedidos
  for each row execute function public.trg_sync_incluye_iva_pedido();


-- ── 5. Resincronizar el resumen de todo lo existente ────────
--
-- Deja la columna coherente con la regla desde el primer dia, y de paso hace
-- el archivo auto-sanador: correrlo de nuevo arregla cualquier desvio.
-- El `is distinct from` evita escribir las filas que ya estan bien.

update public.pedidos p
   set incluye_iva = public.pedido_todas_las_partidas_con_iva(p.id)
                     and (coalesce(p.costo_envio, 0) = 0 or p.envio_incluye_iva)
 where p.incluye_iva is distinct from (
         public.pedido_todas_las_partidas_con_iva(p.id)
         and (coalesce(p.costo_envio, 0) = 0 or p.envio_incluye_iva)
       );


-- ── 6. pedidos_saldo ────────────────────────────────────────
--
-- Las 24 columnas existentes conservan nombre, tipo y POSICION —CREATE OR
-- REPLACE VIEW no puede renombrarlas ni reordenarlas— y `base_gravable` se
-- apendiza al final, en la 25.
--
-- Tres niveles y no uno, porque cada uno necesita el alias del anterior:
--   a) agrega (pagos y partidas) y saca descuento_monto y gravable
--   b) arma base_gravable
--   c) arma iva_monto a partir de base_gravable
-- y la proyeccion de afuera usa los dos. Escribirlo en un solo nivel obligaria
-- a repetir la expresion del IVA cuatro veces (iva_monto, total_con_envio,
-- saldo y estado_cobro), y una discrepancia entre copias seria invisible.

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
      then 'pagado'::text
    -- 'parcial' ANTES de 'vencido': un pedido con abono no se reporta como
    -- vencido aunque la fecha ya paso.
    when c.pagado > 0::numeric then 'parcial'::text
    when c.fecha_vencimiento is not null and c.fecha_vencimiento < public.hoy_mx()
      then 'vencido'::text
    else 'pendiente'::text
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
      where p.status <> 'cancelado'::text
      -- `it.gravable` va en el GROUP BY porque la dependencia funcional que
      -- Postgres reconoce es sobre la PK de `pedidos`, no sobre las columnas
      -- de una subconsulta. Es un valor por pedido, asi que no agrupa de mas.
      group by p.id, it.gravable
    ) a
  ) b
) c;

-- Grants por default de Supabase. Con CREATE OR REPLACE la vista no se
-- recrea, asi que los existentes se conservan; estas lineas son no-op donde
-- ya estan dados y hacen la migracion autosuficiente en una base nueva.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;


-- ── 7. set_pedido_items acepta el IVA por partida ───────────
--
-- Unico cambio respecto de 20261110000000: la columna `incluye_iva` en el
-- INSERT. La firma no se toca —(uuid, jsonb, numeric)— asi que no hace falta
-- dropear la funcion y PostgREST la sigue publicando igual. Una partida sin
-- la llave en el jsonb queda en false, que es el default de la columna.

create or replace function public.set_pedido_items(
  p_pedido_id uuid,
  p_items     jsonb,
  p_total     numeric
)
returns setof public.pedido_items
language plpgsql
set search_path = public as $$
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
    raise exception 'No existe el pedido %', p_pedido_id
      using errcode = '23503';
  end if;

  if v_status in ('entregado', 'cancelado') then
    raise exception 'El pedido esta "%" y sus partidas ya no se pueden editar', v_status
      using errcode = '55000',
            hint    = 'Un entregado ya descontó inventario; un cancelado no va a salir.';
  end if;

  -- ── 2. La forma del payload ─────────────────────────────────
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items debe ser un arreglo JSON, llego %', coalesce(jsonb_typeof(p_items), 'null')
      using errcode = '22023';
  end if;

  v_esperadas := jsonb_array_length(p_items);
  if v_esperadas = 0 then
    raise exception 'Un pedido no puede quedarse sin partidas'
      using errcode = '22023',
            hint    = 'Para dejarlo sin productos, cancela el pedido.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'producto_id') is null then
      raise exception 'Hay una partida sin producto_id' using errcode = '22023';
    end if;
    if coalesce((v_item->>'cantidad')::int, 0) <= 0 then
      raise exception 'La partida de % trae cantidad %, y tiene que ser mayor que 0',
        v_item->>'producto_id', coalesce(v_item->>'cantidad', 'null')
        using errcode = '22023';
    end if;
    if coalesce((v_item->>'precio_unitario')::numeric, -1) < 0 then
      raise exception 'La partida de % trae un precio negativo', v_item->>'producto_id'
        using errcode = '22023';
    end if;
    -- El IVA es opcional en el payload, pero si viene tiene que ser booleano:
    -- un "si" de un cliente mal escrito no puede colarse como false callado.
    if v_item ? 'incluye_iva' and jsonb_typeof(v_item->'incluye_iva') not in ('boolean', 'null') then
      raise exception 'La partida de % trae incluye_iva de tipo %, y tiene que ser booleano',
        v_item->>'producto_id', jsonb_typeof(v_item->'incluye_iva')
        using errcode = '22023';
    end if;
  end loop;

  -- ── 3. Reemplazo ────────────────────────────────────────────
  select count(*) into v_previas from public.pedido_items where pedido_id = p_pedido_id;

  delete from public.pedido_items where pedido_id = p_pedido_id;
  get diagnostics v_borradas = row_count;

  -- El guard que convierte un no-op de RLS en un error: sin esto, quien no
  -- puede borrar igual insertaria y el pedido quedaria con las partidas
  -- viejas mas las nuevas.
  if v_borradas <> v_previas then
    raise exception 'Se esperaba borrar % partidas y se borraron %', v_previas, v_borradas
      using errcode = '42501',
            hint    = 'Sin permiso para borrar las partidas de este pedido. No se escribio nada.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.pedido_items (
      pedido_id, producto_id, unidad, cantidad, precio_unitario, subtotal, metadata, incluye_iva
    ) values (
      p_pedido_id,
      (v_item->>'producto_id')::uuid,
      nullif(v_item->>'unidad', ''),
      (v_item->>'cantidad')::int,
      (v_item->>'precio_unitario')::numeric,
      (v_item->>'cantidad')::int * (v_item->>'precio_unitario')::numeric,
      case
        when v_item->'metadata' is null or v_item->'metadata' = 'null'::jsonb then null
        else v_item->'metadata'
      end,
      coalesce((v_item->>'incluye_iva')::boolean, false)
    );
  end loop;

  select count(*) into v_insertadas from public.pedido_items where pedido_id = p_pedido_id;
  if v_insertadas <> v_esperadas then
    raise exception 'Se esperaban % partidas y quedaron %', v_esperadas, v_insertadas
      using errcode = '42501';
  end if;

  -- ── 4. El total sale de las partidas, no del cliente ────────
  --
  -- `pedidos.total` es el importe BRUTO, antes de descuento, envio e IVA: la
  -- vista `pedidos_saldo` les resta/suma eso despues. Aqui se suma
  -- exactamente lo mismo que suma `calcularPedido`.
  select coalesce(sum(cantidad * precio_unitario), 0)
    into v_total
    from public.pedido_items
   where pedido_id = p_pedido_id;

  if round(v_total, 2) is distinct from round(p_total, 2) then
    raise exception 'El total no cuadra: las partidas suman % y se mando %',
      round(v_total, 2), round(p_total, 2)
      using errcode = '22023',
            hint    = 'El servidor y el cliente calcularon distinto. No se escribio nada.';
  end if;

  update public.pedidos set total = v_total where id = p_pedido_id;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'No se pudo actualizar el total del pedido %', p_pedido_id
      using errcode = '42501',
            hint    = 'Sin permiso de UPDATE sobre el pedido. No se escribio nada.';
  end if;

  return query
    select * from public.pedido_items
     where pedido_id = p_pedido_id
     order by created_at, id;
end $$;


-- ── 8. Verificacion ─────────────────────────────────────────
--
-- ALARMA, no seguro: con el SQL Editor confirmando statement por statement,
-- esto no puede revertir nada. Si truena, lo de arriba ya quedo escrito y hay
-- que leer el mensaje y arreglar a mano.
--
-- Todo va en un solo bloque y sin foto previa: como hoy ningun pedido tiene
-- IVA, el invariante es auto-contenido — la vista nueva tiene que dar
-- exactamente lo que daba la vieja.

do $$
declare
  v_cols      text;
  v_esperadas text := 'id,cliente_id,total,costo_envio,status,condiciones_pago,'
                   || 'fecha_vencimiento,created_at,descuento_tipo,descuento_valor,'
                   || 'descuento_monto,total_con_envio,pagado,saldo,estado_cobro,'
                   || 'dias_vencido,fecha_pedido,fecha_entrega,fecha_entrega_real,'
                   || 'orden_compra,folio_factura,incluye_iva,iva_tasa,iva_monto,'
                   || 'base_gravable';
  v_n         int;
  v_malos     int;
begin
  -- 8a. Las columnas nuevas, NOT NULL.
  select count(*) into v_n
    from information_schema.columns
   where (table_schema, table_name, column_name) in
         (('public','pedido_items','incluye_iva'), ('public','pedidos','envio_incluye_iva'))
     and is_nullable = 'NO';
  if v_n <> 2 then
    raise exception using
      message = format('Las columnas nuevas no quedaron NOT NULL (%s de 2).', v_n),
      hint    = 'Una bandera en null haria que el IVA dependiera de un tercer estado que nadie modelo.';
  end if;

  -- 8b. Las 25 columnas de la vista, en orden.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pedidos_saldo';
  if v_cols is distinct from v_esperadas then
    raise exception using
      message = 'pedidos_saldo no quedo con las 25 columnas esperadas en orden.',
      detail  = format('quedo: %s', v_cols),
      hint    = 'CREATE OR REPLACE VIEW no renombra ni reordena: base_gravable va al final.';
  end if;

  -- 8c. security_invoker. Sin el, un vendedor veria saldos ajenos.
  if not exists (
    select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and k.relname = 'pedidos_saldo'
       and array_to_string(k.reloptions, ',') ilike '%security_invoker=on%'
  ) then
    raise exception using
      message = 'pedidos_saldo quedo SIN security_invoker: un vendedor veria saldos ajenos.';
  end if;

  -- 8d. Nada de current_date: entre las 18:00 y la medianoche de CDMX
  --     adelantaria un dia el vencimiento.
  if pg_get_viewdef('public.pedidos_saldo'::regclass) ilike '%current_date%' then
    raise exception using message = 'pedidos_saldo quedo usando current_date en vez de hoy_mx().';
  end if;

  -- 8e. EL CHECK DEL FAN-OUT. `pagado` contra una suma independiente sacada
  --     de `pagos`. Si las partidas se hubieran colado como un join mas, cada
  --     pago se contaria una vez por partida y esto lo caza.
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

  -- 8f. Una fila por pedido no cancelado, ni mas ni menos.
  select count(*) into v_n from public.pedidos where status <> 'cancelado';
  if (select count(*) from public.pedidos_saldo) <> v_n then
    raise exception using
      message = 'pedidos_saldo no devuelve una fila por pedido no cancelado.',
      hint    = 'Se toco el where o el group by de la agregacion.';
  end if;

  -- 8g. Sin partidas gravadas, el IVA es 0 y el total es el de siempre.
  select count(*) into v_n from public.pedido_items where incluye_iva;
  if v_n = 0 then
    select count(*) into v_malos
      from public.pedidos_saldo v
     where v.iva_monto <> 0::numeric
        or v.base_gravable <> 0::numeric
        or v.total_con_envio <> v.total - v.descuento_monto + coalesce(v.costo_envio, 0::numeric);
    if v_malos > 0 then
      raise exception using
        message = format('%s pedidos cambiaron de total sin tener una sola partida gravada.', v_malos);
    end if;
  end if;

  -- 8h. El resumen no miente en ninguna fila.
  select count(*) into v_malos
    from public.pedidos p
   where p.incluye_iva is distinct from (
           public.pedido_todas_las_partidas_con_iva(p.id)
           and (coalesce(p.costo_envio, 0) = 0 or p.envio_incluye_iva)
         );
  if v_malos > 0 then
    raise exception using
      message = format('pedidos.incluye_iva no cuadra con la regla en %s pedidos.', v_malos),
      hint    = 'Revisa los triggers trg_pedidos_sync_iva y trg_pedido_items_sync_iva.';
  end if;

  -- 8i. Los triggers quedaron, y en SECURITY DEFINER.
  select count(*) into v_n
    from pg_trigger t
   where not t.tgisinternal
     and t.tgname in ('trg_pedido_items_sync_iva', 'trg_pedidos_sync_iva');
  if v_n <> 2 then
    raise exception using message = format('Faltan triggers del resumen de IVA (%s de 2).', v_n);
  end if;

  select count(*) into v_n
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public'
     and f.proname in ('pedido_todas_las_partidas_con_iva', 'trg_sync_incluye_iva_items', 'trg_sync_incluye_iva_pedido')
     and f.prosecdef;
  if v_n <> 3 then
    raise exception using
      message = format('Las funciones del resumen no quedaron en SECURITY DEFINER (%s de 3).', v_n),
      hint    = 'Sin eso, el trigger corre bajo RLS y para un vendedor afecta cero filas en silencio.';
  end if;

  -- 8j. La funcion del resumen NO es una API.
  if has_function_privilege('anon', 'public.pedido_todas_las_partidas_con_iva(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.pedido_todas_las_partidas_con_iva(uuid)', 'execute') then
    raise exception using
      message = 'pedido_todas_las_partidas_con_iva sigue ejecutable por anon/authenticated.',
      hint    = 'Es SECURITY DEFINER y PostgREST la publicaria como RPC: revoca el execute.';
  end if;

  raise notice 'IVA por partida listo: pedidos_saldo con 25 columnas, pagado intacto, resumen coherente.';
end $$;

commit;
