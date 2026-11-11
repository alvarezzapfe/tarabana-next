-- ============================================================
-- set_pedido_items(): reemplaza las partidas de un pedido — NO APLICADA AUN
-- ============================================================
--
-- Editar las partidas de un pedido existente es BORRAR las que tiene e
-- INSERTAR las nuevas. Desde el cliente de Supabase eso son dos llamadas sin
-- transaccion, y un fallo entre una y otra deja el pedido sin sus productos.
--
-- `crearPedido` vive con eso porque al CREAR lo peor que pasa es que no se
-- cree nada: inserta la cabecera, inserta las partidas y, si lo segundo falla,
-- borra la cabecera (src/lib/crear-pedido.ts). Al EDITAR no hay nada que
-- compensar: las partidas viejas ya no estan.
--
-- Esta funcion es el hermano de `set_comision_tramos` (20261104100000), que
-- resuelve el mismo problema —reemplazar un conjunto de filas hijas— con la
-- misma forma: plpgsql, SECURITY INVOKER, payload jsonb.
--
-- ── Lo que valida adentro, y por que no basta validarlo en la ruta ──────
--
--   * Status. Un pedido entregado ya desconto inventario y uno cancelado no
--     va a salir; cambiarles las partidas descuadra el stock o revive un
--     pedido muerto. La ruta tambien lo checa, pero la ruta es una de varias
--     puertas: esta es la ultima.
--
--   * El total. Se recalcula EN SQL desde las partidas que quedaron escritas
--     y se compara contra el que mando el cliente. Si no cuadran, aborta. Asi
--     `pedidos.total` no puede quedar diciendo una cosa y las partidas otra,
--     que es el error que nadie ve hasta que el cliente reclama la factura.
--
--   * Cuantas filas se borraron. Es el guard que de verdad importa. Con
--     SECURITY INVOKER el DELETE pasa por RLS, y RLS no tira error cuando no
--     hay policy: afecta CERO filas en silencio. Sin este check, quien no
--     puede borrar igual insertaria, y el pedido quedaria con las partidas
--     viejas MAS las nuevas — cobrado al doble. Con el check, ese caso es un
--     error 42501 legible.
--
-- ── Quien puede llamarla ───────────────────────────────────────────────
--
-- Se queda en SECURITY INVOKER (el default) a proposito, igual que
-- `set_comision_tramos`: el permiso real lo da RLS, no la funcion. Hoy eso
-- significa que la puede usar `is_admin()` via `pedido_items_admin_write` y
-- `pedidos_admin_write`.
--
-- El VENDEDOR no puede, y es deliberado: 20261103100000 anota "No hay policy
-- de UPDATE ni de DELETE a proposito: el vendedor no edita pedidos". Esta
-- migracion NO cambia eso. Si se decide abrirlo, son dos policies nuevas
-- (DELETE sobre pedido_items y UPDATE sobre pedidos, acotadas a
-- `vendedor_id = mi_vendedor_id()`), y es una decision de superficie de
-- ataque que no se toma de pasada. Mientras no existan, un vendedor que
-- llegue aqui recibe el 42501 del guard de arriba en vez de duplicar
-- partidas.

begin;

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
  end loop;

  -- ── 3. Reemplazo ────────────────────────────────────────────
  select count(*) into v_previas from public.pedido_items where pedido_id = p_pedido_id;

  delete from public.pedido_items where pedido_id = p_pedido_id;
  get diagnostics v_borradas = row_count;

  -- El guard que convierte un no-op de RLS en un error. Ver la nota de
  -- arriba: sin esto, quien no puede borrar igual insertaria y el pedido
  -- quedaria con las partidas viejas mas las nuevas.
  if v_borradas <> v_previas then
    raise exception 'Se esperaba borrar % partidas y se borraron %', v_previas, v_borradas
      using errcode = '42501',
            hint    = 'Sin permiso para borrar las partidas de este pedido. No se escribio nada.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.pedido_items (
      pedido_id, producto_id, unidad, cantidad, precio_unitario, subtotal, metadata
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
      end
    );
  end loop;

  select count(*) into v_insertadas from public.pedido_items where pedido_id = p_pedido_id;
  if v_insertadas <> v_esperadas then
    raise exception 'Se esperaban % partidas y quedaron %', v_esperadas, v_insertadas
      using errcode = '42501';
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

comment on function public.set_pedido_items(uuid, jsonb, numeric) is
  'Reemplaza las partidas de un pedido y recalcula su total, en una transaccion. '
  'SECURITY INVOKER: el permiso lo da RLS. Aborta si el pedido esta entregado o '
  'cancelado, si el total no cuadra con las partidas, o si RLS impidio borrar.';

revoke execute on function public.set_pedido_items(uuid, jsonb, numeric) from public, anon;
grant  execute on function public.set_pedido_items(uuid, jsonb, numeric) to authenticated;

-- ── Verificacion ────────────────────────────────────────────
--
-- Que la funcion quedo como se quiso: con la firma exacta, en INVOKER y sin
-- ejecucion para anon. Una funcion de escritura que quede en DEFINER por un
-- descuido se saltaria RLS y le daria a cualquier `authenticated` el poder de
-- reescribir las partidas de cualquier pedido.

do $$
declare
  v_oid      oid;
  v_definer  boolean;
  v_anon     boolean;
begin
  select p.oid, p.prosecdef
    into v_oid, v_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'set_pedido_items'
     and pg_get_function_identity_arguments(p.oid) = 'p_pedido_id uuid, p_items jsonb, p_total numeric';

  if v_oid is null then
    raise exception using message = 'No quedo public.set_pedido_items(uuid, jsonb, numeric). Abortando.';
  end if;

  if v_definer then
    raise exception using
      message = 'set_pedido_items quedo en SECURITY DEFINER',
      hint    = 'Tiene que ser INVOKER para que RLS siga decidiendo quien puede editar. Abortando.';
  end if;

  v_anon := has_function_privilege('anon', v_oid, 'execute');
  if v_anon then
    raise exception using message = 'anon puede ejecutar set_pedido_items. Abortando.';
  end if;

  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception using message = 'authenticated NO puede ejecutar set_pedido_items. Abortando.';
  end if;

  raise notice 'set_pedido_items(uuid, jsonb, numeric) creada: INVOKER, ejecutable solo por authenticated.';
end $$;

commit;
