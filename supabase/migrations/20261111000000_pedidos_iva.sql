-- ============================================================
-- IVA por pedido: pedidos.incluye_iva / iva_tasa y pedidos_saldo
-- ============================================================
--
-- Los precios de lista son SIN IVA. El IEPS si va incluido en el precio y se
-- queda como esta. Lo que falta es poder marcar un pedido como facturado con
-- IVA y que el saldo lo cobre.
--
-- ── Las columnas, y por que la tasa se guarda en el pedido ──────────────
--
-- `incluye_iva boolean not null default false` deja TODOS los pedidos
-- existentes sin IVA, asi que ningun saldo vivo se mueve. Eso es a proposito:
-- los 15 pedidos de la vista se facturaron sin IVA y reexpresarlos cambiaria
-- lo que se les debe cobrar. Prenderlo es una decision por pedido, desde la
-- UI, y queda en audit_log.
--
-- `iva_tasa` es una COPIA de la tasa vigente al momento de crear el pedido,
-- no una lectura de `app_config.impuestos.iva_tasa`. Si manana cambia la tasa
-- —reforma fiscal, region fronteriza— los pedidos viejos tienen que seguir
-- diciendo lo que se facturo. Una vista que leyera la tasa vigente reescribiria
-- la historia completa de un plumazo: un pedido cobrado y pagado al 16% pasaria
-- a tener saldo, y la cobranza empezaria a perseguir una diferencia que nadie
-- facturo nunca.
--
-- El default 0.16 es un respaldo para un INSERT hecho a mano: la aplicacion
-- siempre manda la tasa que leyo de `app_config`. Si la tasa legal cambia hay
-- que mover LAS DOS (la config y este default), y la config es la que manda.
--
-- ── La vista ───────────────────────────────────────────────────────────
--
--   base            = total - descuento_monto + costo_envio
--   iva_monto       = round(base * iva_tasa, 2) si incluye_iva, si no 0
--   total_con_envio = base + iva_monto
--   saldo           = total_con_envio - pagado
--
-- El IVA se calcula sobre la base DESPUES del descuento y CON el envio, que
-- es como se factura: el descuento baja la contraprestacion y el flete es
-- parte de ella.
--
-- `total` NO cambia de significado: sigue siendo el bruto de las partidas sin
-- IVA. `crearPedido` y `set_pedido_items` no se tocan, y su comparacion de
-- totales contra las partidas sigue cuadrando.
--
-- Dos efectos que si se quieren, y hay que decirlos:
--
--   * `aplicar_pago` (20260803200100) valida el abono contra `saldo`. Con IVA
--     el saldo es mayor, asi que deja cobrar el IVA. Es lo correcto: es parte
--     de lo que el cliente debe.
--
--   * `estado_cobro` y `dias_vencido` cuelgan del saldo nuevo. Un pedido con
--     IVA al que le pagan la base pero no el IVA queda 'parcial' y no
--     'pagado'. Tambien correcto, y por eso ningun pedido existente se
--     reexpresa: si lo hicieramos, 15 pedidos pagados amanecerian con deuda.
--
-- ── Por que el SELECT cambia de forma ──────────────────────────────────
--
-- La definicion viva (20261105000000) repite el CASE del descuento cuatro
-- veces porque se transcribio de pg_get_viewdef. Sumarle el IVA a mano lo
-- dejaria con el mismo CASE seis veces y la expresion del IVA tres, y una
-- discrepancia entre copias seria invisible en la revision.
--
-- Asi que la agregacion se baja a una subconsulta y el select de afuera es
-- pura proyeccion. La subconsulta conserva EXACTAMENTE el from, el left join,
-- el where y el group by de la definicion viva: lo que podia cambiar la
-- semantica del agregado —de que filas de `pagos` se suma `monto`— es
-- identico caracter por caracter. Lo unico que se movio es donde se escriben
-- las sumas y restas, que ahora se escriben una vez.
--
-- Las 21 columnas existentes conservan nombre, tipo y POSICION, porque
-- CREATE OR REPLACE VIEW no puede renombrarlas ni reordenarlas: las tres
-- nuevas van apendizadas al final, despues de folio_factura.
--
-- `hoy_mx()` y no `current_date`, igual que la definicion viva. Hay un guard
-- al final que aborta si se cuela `current_date`, porque entre las 18:00 y la
-- medianoche de CDMX adelantaria un dia el vencimiento.
--
-- WITH (security_invoker = on) va EXPLICITO y tambien se verifica al final:
-- sin el, las policies de pedidos y pagos se evaluarian con el dueno de la
-- vista y un vendedor veria saldos ajenos.
-- ============================================================

begin;

-- ── 0. Foto de los saldos de HOY ────────────────────────────
--
-- Se toma antes de tocar nada y se compara al final, dentro de la misma
-- transaccion. Es el check que de verdad importa de esta migracion: que
-- agregar IVA no haya movido ni un centavo de lo ya facturado. Si cambia
-- aunque sea una fila, la migracion aborta y no queda nada escrito.

create temp table _saldo_antes on commit drop as
select id, total_con_envio, pagado, saldo, estado_cobro, dias_vencido
  from public.pedidos_saldo;


-- ── 1. Columnas ─────────────────────────────────────────────

alter table public.pedidos
  add column if not exists incluye_iva boolean not null default false,
  add column if not exists iva_tasa    numeric(6,4) not null default 0.16;

comment on column public.pedidos.incluye_iva is
  'Si el pedido se factura con IVA. Los precios de lista son sin IVA (el IEPS si va incluido). Default false: un pedido no lleva IVA salvo que alguien lo marque.';

comment on column public.pedidos.iva_tasa is
  'Tasa de IVA vigente copiada al crear el pedido, para que un cambio de tasa no reescriba pedidos viejos. La aplicacion la toma de app_config.impuestos.iva_tasa; el default es solo respaldo para un INSERT a mano.';

-- Una tasa fuera de [0,1) seria un error de captura cobrado al cliente, y un
-- pedido marcado con IVA pero con tasa 0 es una contradiccion que la vista
-- resolveria en silencio cobrando cero.
alter table public.pedidos
  drop constraint if exists pedidos_iva_tasa_rango;
alter table public.pedidos
  add constraint pedidos_iva_tasa_rango
  check (iva_tasa >= 0 and iva_tasa < 1);

alter table public.pedidos
  drop constraint if exists pedidos_iva_tasa_util;
alter table public.pedidos
  add constraint pedidos_iva_tasa_util
  check (not incluye_iva or iva_tasa > 0);


-- ── 2. pedidos_saldo ────────────────────────────────────────

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
    when (b.base + b.iva_monto - b.pagado) <= 0::numeric then 'pagado'::text
    -- 'parcial' ANTES de 'vencido': un pedido con abono no se reporta como
    -- vencido aunque la fecha ya paso.
    when b.pagado > 0::numeric then 'parcial'::text
    when b.fecha_vencimiento is not null and b.fecha_vencimiento < public.hoy_mx()
      then 'vencido'::text
    else 'pendiente'::text
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
      when p.descuento_tipo = 'porcentaje'::text
        then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
      when p.descuento_tipo = 'monto'::text
        then coalesce(p.descuento_valor, 0::numeric)
      else 0::numeric
    end as descuento_monto,

    -- La base gravable: mercancia menos descuento mas envio. Es exactamente
    -- lo que `total_con_envio` valia antes de que existiera el IVA.
    p.total
      - case
          when p.descuento_tipo = 'porcentaje'::text
            then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
          when p.descuento_tipo = 'monto'::text
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
                  when p.descuento_tipo = 'porcentaje'::text
                    then round(p.total * coalesce(p.descuento_valor, 0::numeric) / 100::numeric, 2)
                  when p.descuento_tipo = 'monto'::text
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
  where p.status <> 'cancelado'::text
  group by p.id
) b;

-- Grants por default de Supabase. Con CREATE OR REPLACE la vista no se
-- recrea, asi que los existentes se conservan; estas lineas son no-op donde
-- ya estan dados y hacen la migracion autosuficiente en una base nueva.
--
-- La vista tiene GROUP BY, asi que no es auto-updatable: conceder ALL no
-- habilita escritura.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;


-- ── 3. Guard: security_invoker sigue activo ─────────────────

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
    raise exception using
      message = 'pedidos_saldo quedo SIN security_invoker: un vendedor veria saldos ajenos.',
      hint    = 'Abortando. Revisa el WITH (security_invoker = on) del CREATE OR REPLACE VIEW.';
  end if;
end $$;


-- ── 4. Guard: la vista no debe usar current_date ────────────

do $$
begin
  if pg_get_viewdef('public.pedidos_saldo'::regclass) ilike '%current_date%' then
    raise exception using
      message = 'pedidos_saldo quedo usando current_date (UTC) en vez de hoy_mx().',
      hint    = 'Abortando: entre las 18:00 y la medianoche de CDMX marcaria vencidos de mas.';
  end if;
end $$;


-- ── 5. Verificacion ─────────────────────────────────────────
--
-- Cuatro cosas: que las columnas quedaron como se quisieron, que las 24
-- columnas de la vista estan en su orden, que ningun pedido quedo con IVA
-- prendido, y que ni un centavo de los saldos vivos se movio.

do $$
declare
  v_cols       text;
  v_esperadas  text := 'id,cliente_id,total,costo_envio,status,condiciones_pago,'
                    || 'fecha_vencimiento,created_at,descuento_tipo,descuento_valor,'
                    || 'descuento_monto,total_con_envio,pagado,saldo,estado_cobro,'
                    || 'dias_vencido,fecha_pedido,fecha_entrega,fecha_entrega_real,'
                    || 'orden_compra,folio_factura,incluye_iva,iva_tasa,iva_monto';
  v_notnull    int;
  v_con_iva    int;
  v_movidos    int;
  v_total      int;
begin
  -- 5a. Las columnas nuevas, not null y con su default.
  select count(*) into v_notnull
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pedidos'
     and column_name in ('incluye_iva', 'iva_tasa')
     and is_nullable = 'NO';
  if v_notnull <> 2 then
    raise exception using
      message = format('pedidos.incluye_iva / iva_tasa no quedaron NOT NULL (%s de 2).', v_notnull),
      hint    = 'Abortando: una tasa en null dejaria el saldo entero en null.';
  end if;

  -- 5b. Las 24 columnas de la vista, en orden.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pedidos_saldo';
  if v_cols is distinct from v_esperadas then
    raise exception using
      message = 'pedidos_saldo no quedo con las 24 columnas esperadas en orden.',
      detail  = format('quedo: %s', v_cols),
      hint    = 'Abortando. CREATE OR REPLACE VIEW no renombra ni reordena: las nuevas van al final.';
  end if;

  -- 5c. Nadie amanece con IVA. El switch se prende desde la UI, pedido por
  --     pedido, y queda en audit_log.
  select count(*) into v_con_iva from public.pedidos where incluye_iva;
  if v_con_iva > 0 then
    raise exception using
      message = format('%s pedidos quedaron con incluye_iva = true.', v_con_iva),
      hint    = 'Abortando: esta migracion no reexpresa nada, todos arrancan en false.';
  end if;

  -- 5d. Ni un centavo movido. Se compara contra la foto de arriba.
  select count(*) into v_total from _saldo_antes;
  select count(*) into v_movidos
    from _saldo_antes a
    join public.pedidos_saldo d on d.id = a.id
   where (a.total_con_envio, a.pagado, a.saldo, a.estado_cobro, a.dias_vencido)
      is distinct from
         (d.total_con_envio, d.pagado, d.saldo, d.estado_cobro, d.dias_vencido);
  if v_movidos > 0 then
    raise exception using
      message = format('La vista nueva cambio el saldo de %s de %s pedidos.', v_movidos, v_total),
      hint    = 'Abortando. Con incluye_iva = false en todos, iva_monto es 0 y nada debia moverse.';
  end if;

  if (select count(*) from public.pedidos_saldo) <> v_total then
    raise exception using
      message = 'La vista nueva devuelve otra cantidad de pedidos.',
      hint    = 'Abortando: se toco el where o el group by de la agregacion.';
  end if;

  raise notice 'IVA listo: pedidos.incluye_iva/iva_tasa creadas, pedidos_saldo con 24 columnas, % pedidos intactos.', v_total;
end $$;

commit;
