-- Cliente como negocio — NO APLICADA AUN
-- ============================================================
--
-- El alta de clientes modelaba al cliente como una PERSONA que a veces
-- factura: el formulario abria preguntando "fisica o moral?" y de ahi
-- derivaban los campos de nombre. El caso real mas comun del negocio es una
-- persona FISICA que opera un bar o un restaurante con su propia marca, y ese
-- modelo obliga a elegir entre registrar a la persona o registrar al negocio.
--
-- Esta migracion agrega lo que falta para que el cliente sea el NEGOCIO
-- (nombre comercial + giro) y lo fiscal sea un bloque aparte.
--
-- LO QUE NO SE AGREGA, PORQUE YA EXISTE:
--
--   nombre_comercial -> ya es `marca_negocio`, y el formulario viejo ya la
--                       etiquetaba "Nombre comercial". Se reusa.
--   razon_social, rfc, uso_cfdi, requiere_factura, contacto_nombre,
--   nivel_precio, vendedor_id, y la direccion SEPOMEX completa
--   (calle, num_ext, num_int, colonia, municipio, estado, cp, referencias).
--
--   regimen_fiscal y cp_fiscal tambien existen en produccion, pero NO tienen
--   migracion en este repo: se aplicaron a mano. No se recrean aqui para no
--   pelear con el estado real; quedan anotadas como deuda.
--
-- SOBRE `giro` Y `tipo_consumidor`:
--
--   `tipo_consumidor` ya era un catalogo de giro (ocasional, tiene_tap,
--   tiene_bar, restaurante, distribuidor, hotel, tienda, eventos) y lo usa el
--   onboarding del portal con su propia UX de 8 tarjetas. Se deja INTACTO.
--   `giro` es la taxonomia del lado admin, mas fina, y es la que manda ahi.
--   El backfill de abajo la siembra desde `tipo_consumidor`.
--
-- SOBRE LOS GRANTS DE COLUMNA:
--
--   Ninguna de estas columnas entra al `grant update (...)` de `authenticated`,
--   a proposito y con el mismo criterio que ya se uso para `nivel_precio`
--   (20260803100000_nivel_precio.sql: "Solo service_role puede modificar
--   nivel_precio"): un cliente no se pone su propio limite de credito, sus
--   propios dias de credito ni su propio giro.
--
--   Las tres rutas admin que escriben clientes
--   (clientes/crear, clientes/[id]/actualizar, clientes/[id]/nivel-precio)
--   usan createServiceClient(), que salta RLS y los grants de columna, asi que
--   el admin funciona sin grant. El portal no toca estos campos.
--
-- Sin enums, text + CHECK, como todo el proyecto: agregar un valor a un enum
-- es ALTER TYPE y no se puede correr en la misma transaccion (ver la nota en
-- 20261103100000_rol_vendedor.sql).

begin;

-- ── Columnas nuevas ─────────────────────────────────────────

alter table public.profiles
  add column if not exists giro text
    check (giro in (
      'bar', 'restaurante', 'taproom', 'cafeteria', 'hotel',
      'vinateria', 'abarrotes', 'autoservicio', 'club', 'eventos',
      'corporativo', 'distribuidor', 'tienda_linea',
      'consumidor_final', 'otro'
    )),
  add column if not exists instagram         text,
  add column if not exists sitio_web         text,
  add column if not exists contacto_whatsapp text,
  add column if not exists horario_recepcion text,
  add column if not exists dias_credito      integer       check (dias_credito   >= 0),
  add column if not exists limite_credito    numeric(12,2) check (limite_credito >= 0);

comment on column public.profiles.giro is
  'Giro del negocio, taxonomia del admin. Sugiere nivel_precio. Distinto de tipo_consumidor, que es lo que el cliente declaro de si mismo en el portal.';
comment on column public.profiles.contacto_whatsapp is
  'WhatsApp de quien recibe. Puede ser distinto de phone, que es el del titular de la cuenta.';
comment on column public.profiles.horario_recepcion is
  'Texto libre: en que horario reciben entregas. Antes se escribia en notas.';
comment on column public.profiles.dias_credito is
  'Dias de credito acordados. Informa el default de pedidos.condiciones_pago, no lo reemplaza.';
comment on column public.profiles.limite_credito is
  'Limite de credito en pesos. 0 o null = sin limite definido, no "sin credito".';

-- ── Backfill ────────────────────────────────────────────────
--
-- No borra ni reescribe nada: las dos sentencias solo tocan filas donde el
-- destino esta vacio.

-- `marca_negocio` es el nombre principal del cliente a partir de ahora, asi
-- que las filas que no lo traian necesitan algo legible. Lo que ya hay manda.
update public.profiles
   set marca_negocio = coalesce(nullif(razon_social, ''), full_name)
 where nullif(marca_negocio, '') is null
   and role = 'comprador'
   and coalesce(nullif(razon_social, ''), full_name) is not null;

-- `giro` desde `tipo_consumidor`. Los cuatro valores viejos que cambian de
-- nombre se mapean; los que ya coinciden pasan igual.
update public.profiles
   set giro = case tipo_consumidor
         when 'tiene_bar'    then 'bar'
         when 'tiene_tap'    then 'taproom'
         when 'tienda'       then 'abarrotes'
         when 'ocasional'    then 'consumidor_final'
         when 'restaurante'  then 'restaurante'
         when 'hotel'        then 'hotel'
         when 'eventos'      then 'eventos'
         when 'distribuidor' then 'distribuidor'
         else 'otro'
       end
 where giro is null
   and role = 'comprador';

-- ── Indice ──────────────────────────────────────────────────
--
-- La lista de clientes filtra por giro.
create index if not exists profiles_giro_idx on public.profiles(giro);

-- ── Verificacion ────────────────────────────────────────────
--
-- Que las siete columnas quedaron y que el backfill no dejo compradores sin
-- giro. Si algo falla, la transaccion no se queda a medias.
do $$
declare
  v_faltan text;
  v_sin_giro integer;
begin
  select string_agg(c, ', ')
    into v_faltan
    from unnest(array[
      'giro', 'instagram', 'sitio_web', 'contacto_whatsapp',
      'horario_recepcion', 'dias_credito', 'limite_credito'
    ]) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = c
   );

  if v_faltan is not null then
    raise exception using
      message = format('No se crearon las columnas: %s', v_faltan),
      hint    = 'Revisa si profiles tiene un trigger o una vista que bloquee el ALTER.';
  end if;

  select count(*) into v_sin_giro
    from public.profiles
   where role = 'comprador' and giro is null;

  if v_sin_giro > 0 then
    raise exception using
      message = format('%s compradores quedaron sin giro', v_sin_giro),
      hint    = 'El CASE del backfill tiene un ELSE, asi que esto solo pasa si role cambio durante la migracion.';
  end if;
end $$;

commit;
