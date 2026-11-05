-- ============================================================
-- Fechas y datos del pedido — NO APLICADA AUN
-- ============================================================
--
-- Hoy todo lo que es "cuando pasó este pedido" cuelga de `created_at`, que es
-- cuando se capturó. No es lo mismo: un pedido que se levantó el lunes y se
-- capturó el jueves vive en el mes equivocado del dashboard y vence tres días
-- tarde. Esta migración separa las dos cosas.
--
--   fecha_pedido        la fecha del pedido. Editable, retroactiva, no futura.
--   created_at          se queda como AUDITORIA: cuando se capturó. No se toca.
--   fecha_vencimiento   pasa a calcularse de fecha_pedido, y sigue editable.
--   fecha_entrega       YA EXISTIA: es la entrega programada. Se reusa.
--   fecha_entrega_real  nueva: se llena al pasar el pedido a entregado.
--   orden_compra        OC del cliente.
--   folio_factura       folio de la factura.
--
-- `fecha_entrega` no se renombra a proposito. El portal ya le muestra al
-- cliente "Entrega estimada" con esa columna (app/portal/(auth)/catalogo),
-- asi que agregar una `fecha_entrega_programada` dejaria al portal leyendo la
-- vieja y daria dos columnas con el mismo significado.
--
-- Las comisiones NO se tocan: van por `pagos.fecha_pago`, que es otra cosa.
--
-- TODO va en una sola transaccion: si algo falla, no queda nada a medias.
-- ============================================================

begin;

-- ── 0. La fecha de hoy en Mexico ────────────────────────────
--
-- `current_date` y `created_at::date` se evaluan en la zona del servidor, que
-- en Supabase es UTC. Despues de las 18:00 de CDMX la DB ya esta en "manana",
-- y eso rompe tres cosas distintas:
--
--   * un vendedor no podria capturar en la noche, porque su fecha de hoy ya
--     no coincidiria con la del servidor;
--   * un pedido nocturno quedaria fechado al dia siguiente;
--   * `dias_vencido` saldria 1 de mas y `estado_cobro` marcaria vencido un
--     dia antes, todas las noches.
--
-- Una sola funcion para no repetir la expresion seis veces y para que la zona
-- del negocio quede en un lugar nombrado.
--
-- STABLE y no IMMUTABLE: depende de `now()`. Eso la hace usable en la vista,
-- en el trigger y como default de columna, pero NO en un CHECK — que es la
-- misma restriccion que ya tenia `current_date`.

create or replace function public.hoy_mx()
returns date
language sql
stable
set search_path = public as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

comment on function public.hoy_mx() is
  'La fecha de HOY en la zona del negocio (America/Mexico_City). Usar en vez de current_date, que se evalua en UTC y despues de las 18:00 CDMX ya esta en el dia siguiente.';

grant execute on function public.hoy_mx() to authenticated, service_role, anon;


-- ── 1. Columnas nuevas ──────────────────────────────────────

alter table public.pedidos
  add column if not exists fecha_pedido       date,
  add column if not exists fecha_entrega_real timestamptz,
  add column if not exists orden_compra       text,
  add column if not exists folio_factura      text;

-- Backfill antes del NOT NULL: la fecha del pedido de lo que ya existe es el
-- dia en que se capturo, que es la mejor aproximacion disponible.
update public.pedidos
set fecha_pedido = (created_at at time zone 'America/Mexico_City')::date
where fecha_pedido is null;

alter table public.pedidos
  alter column fecha_pedido set default public.hoy_mx(),
  alter column fecha_pedido set not null;

comment on column public.pedidos.fecha_pedido is
  'Fecha del pedido, editable y retroactiva (nunca futura). Es la que usan dashboard, reportes y cartera. created_at se queda como auditoria de captura.';
comment on column public.pedidos.created_at is
  'AUDITORIA: cuando se capturo el pedido en el sistema. Para agrupar por fecha de negocio se usa fecha_pedido.';
comment on column public.pedidos.fecha_entrega is
  'Entrega PROGRAMADA. Es la que el portal muestra al cliente como "entrega estimada".';
comment on column public.pedidos.fecha_entrega_real is
  'Entrega REAL. La llena la ruta de status al pasar el pedido a entregado.';
comment on column public.pedidos.orden_compra is
  'Numero de orden de compra del cliente. Opcional.';
comment on column public.pedidos.folio_factura is
  'Folio de la factura emitida. Opcional.';

-- Se filtra y se ordena por fecha_pedido en casi toda la aplicacion.
create index if not exists pedidos_fecha_pedido_idx on public.pedidos(fecha_pedido desc);


-- ── 2. Vencimiento y validacion de fecha ────────────────────
--
-- El trigger se mantiene con el mismo nombre (`calc_fecha_vencimiento`)
-- porque docs/SCHEMA_NOTES.md y el archivo 20260803200000 lo documentan asi.
-- Lo que cambia es de donde sale la base y que ahora tambien valida.
--
-- Reglas, en orden:
--
--   1. fecha_pedido nunca futura, contra la fecha de MEXICO (hoy_mx()). No
--      puede ser un CHECK: la funcion es STABLE y Postgres solo admite
--      IMMUTABLE ahi, igual que pasaba con current_date.
--   2. Un vendedor solo captura con la fecha de hoy. Tercera capa, ademas de
--      la UI y de crearPedido: un vendedor no deberia poder mover un pedido a
--      un mes ya cerrado de comisiones. Con service_role `is_vendedor()` es
--      false, asi que scripts y migraciones no quedan atados.
--   3. fecha_vencimiento = fecha_pedido + dias(condiciones_pago), pero una
--      edicion EXPLICITA de fecha_vencimiento gana y no se recalcula. Eso es
--      lo que la vuelve editable sin perder el automatico.

create or replace function public.calc_fecha_vencimiento()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_dias int;
  v_hoy  date := public.hoy_mx();
begin
  if NEW.fecha_pedido is null then
    NEW.fecha_pedido := v_hoy;
  end if;

  if NEW.fecha_pedido > v_hoy then
    raise exception 'La fecha del pedido no puede ser futura (llego %, hoy en Mexico es %).',
      NEW.fecha_pedido, v_hoy
      using errcode = '23514';
  end if;

  -- El vendedor captura con la fecha de hoy y nada mas.
  --
  -- El `auth.uid() is not null` de adelante no es decorativo: con el service
  -- client no hay usuario, asi que corta antes de llamar a is_vendedor() y el
  -- camino de scripts y migraciones no queda atado a esa funcion.
  if auth.uid() is not null and public.is_vendedor() and NEW.fecha_pedido <> v_hoy then
    raise exception 'Un vendedor solo puede capturar pedidos con la fecha de hoy.'
      using errcode = '42501',
            hint = 'Pide a la oficina que capture el pedido con fecha retroactiva.';
  end if;

  v_dias := case NEW.condiciones_pago
    when '15_dias' then 15
    when '30_dias' then 30
    else 0
  end;

  if TG_OP = 'INSERT' then
    -- Un insert que ya trae vencimiento explicito se respeta.
    if NEW.fecha_vencimiento is null then
      NEW.fecha_vencimiento := NEW.fecha_pedido + v_dias;
    end if;
    return NEW;
  end if;

  -- UPDATE: la edicion manual del vencimiento manda.
  if NEW.fecha_vencimiento is distinct from OLD.fecha_vencimiento then
    return NEW;
  end if;

  -- Si cambio la base del calculo, se recalcula.
  if NEW.fecha_pedido is distinct from OLD.fecha_pedido
     or NEW.condiciones_pago is distinct from OLD.condiciones_pago then
    NEW.fecha_vencimiento := NEW.fecha_pedido + v_dias;
  end if;

  return NEW;
end $$;

-- `fecha_pedido` entra a la lista de columnas que disparan: antes solo
-- `condiciones_pago`, asi que mover la fecha del pedido no recalculaba nada.
drop trigger if exists trg_calc_fecha_vencimiento on public.pedidos;

create trigger trg_calc_fecha_vencimiento
  before insert or update of condiciones_pago, fecha_pedido, fecha_vencimiento
  on public.pedidos
  for each row execute function public.calc_fecha_vencimiento();

-- `is_vendedor()` se otorgo a `authenticated` en 20261103100000 y a nadie
-- mas. Ahora la llama un trigger de `pedidos`, asi que service_role tambien
-- la necesita: sin esto, un insert hecho con el service client falla con
-- "permission denied for function is_vendedor". No filtra nada — service_role
-- salta RLS de todos modos.
grant execute on function public.is_vendedor() to service_role;

-- Los vencimientos que ya existen se dejan como estan: con el backfill
-- `fecha_pedido = created_at::date` el calculo da lo mismo, y se verifico
-- contra produccion que los 14 pedidos ya cuadran con created_at + dias.
-- Recalcularlos seria tocar dinero vencido sin necesidad.


-- ── 3. pedidos_saldo ────────────────────────────────────────
--
-- Se reescribe COMPLETA porque CREATE OR REPLACE no permite reordenar ni
-- quitar columnas: las nuevas van apendizadas al final, despues de
-- dias_vencido. El resto es identico a
-- 20261103000000_pedidos_saldo_definicion_real.sql, que es la definicion viva
-- verificada con pg_get_viewdef.
--
-- `estado_cobro` y `dias_vencido` siguen colgando de fecha_vencimiento, pero
-- cambian su "hoy": pasan de `current_date` (UTC) a `hoy_mx()`. Es un arreglo,
-- no un efecto colateral — entre las 18:00 y la medianoche de CDMX la vista
-- adelantaba un dia el vencimiento y reportaba `dias_vencido` de mas.
--
-- WITH (security_invoker = on) va EXPLICITO. Sin el, las policies de pedidos
-- y pagos se evaluarian con el dueno de la vista y un vendedor veria saldos
-- ajenos. Al final de la migracion hay un guard que lo verifica y aborta.

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
    -- hoy_mx() y no current_date: con UTC, entre las 18:00 y la medianoche de
    -- CDMX un pedido se marcaba vencido un dia antes de tiempo.
    when p.fecha_vencimiento is not null and p.fecha_vencimiento < public.hoy_mx()
      then 'vencido'::text
    else 'pendiente'::text
  end as estado_cobro,

  case
    when p.fecha_vencimiento is null then 0
    -- Con current_date esto daba 1 dia de mas todas las noches.
    else greatest(0, public.hoy_mx() - p.fecha_vencimiento)
  end as dias_vencido,

  -- ── Columnas nuevas, al final ─────────────────────────────
  p.fecha_pedido,
  p.fecha_entrega,
  p.fecha_entrega_real,
  p.orden_compra,
  p.folio_factura

from pedidos p
  left join pagos pg on pg.pedido_id = p.id
where p.status <> 'cancelado'::text
group by p.id;

-- Grants por default de Supabase. Con CREATE OR REPLACE la vista no se
-- recrea, asi que los existentes se conservan; estas lineas son no-op donde
-- ya estan dados y hacen la migracion autosuficiente en una base nueva.
grant all on public.pedidos_saldo to anon;
grant all on public.pedidos_saldo to authenticated;
grant all on public.pedidos_saldo to service_role;
grant all on public.pedidos_saldo to postgres;


-- ── 4. Guard: security_invoker sigue activo ─────────────────
--
-- Si se perdiera, la vista evaluaria RLS con su dueno y un vendedor veria el
-- saldo de pedidos que no son suyos. Se verifica dentro de la transaccion
-- para que la migracion aborte en vez de dejar la fuga.

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


-- ── 4b. Guard: la vista no debe usar current_date ───────────
--
-- Si se vuelve a colar un current_date, la vista regresa a la zona del
-- servidor y el vencimiento se adelanta un dia cada noche. Mejor que aborte.

do $$
begin
  if pg_get_viewdef('public.pedidos_saldo'::regclass) ilike '%current_date%' then
    raise exception using
      message = 'pedidos_saldo quedo usando current_date (UTC) en vez de hoy_mx().',
      hint    = 'Abortando: entre las 18:00 y la medianoche de CDMX marcaria vencidos de mas.';
  end if;
end $$;


-- ── 5. Verificacion del backfill ────────────────────────────

do $$
declare
  v_nulos    int;
  v_futuras  int;
  v_distinta int;
begin
  select count(*) into v_nulos   from public.pedidos where fecha_pedido is null;
  select count(*) into v_futuras from public.pedidos where fecha_pedido > public.hoy_mx();
  select count(*) into v_distinta
  from public.pedidos
  where fecha_pedido <> (created_at at time zone 'America/Mexico_City')::date;

  if v_nulos > 0 then
    raise exception 'Quedaron % pedidos sin fecha_pedido.', v_nulos;
  end if;
  if v_futuras > 0 then
    raise exception 'Hay % pedidos con fecha_pedido futura.', v_futuras;
  end if;

  raise notice 'fecha_pedido: backfill completo. % pedidos difieren de la fecha mexicana de created_at (deberia ser 0 recien aplicada).', v_distinta;
end $$;

commit;
