-- ============================================================
-- Comisiones por tramos marginales (Fase 3) — NO APLICADA AUN
-- ============================================================
--
-- Reemplaza el modelo viejo (`vendedores.comision_pct`, un porcentaje fijo
-- sobre lo VENDIDO, materializado fila por fila en `comisiones` al crear el
-- pedido) por tramos marginales sobre lo COBRADO.
--
-- Marginales como el ISR: cada tramo paga su % solo sobre la porcion de la
-- base que cae dentro de el. Una base de 60k con tramos 0-50k al 5% y
-- 50k-100k al 8% paga 50k*5% + 10k*8%, no 60k*8%.
--
-- La base es lo COBRADO y es NETA de impuestos: los precios de la DB los
-- traen incluidos (`src/lib/whatsappPrompt.ts` lo dice explicito y ninguna
-- tabla desglosa impuestos), asi que la base se divide entre (1+IVA) y entre
-- (1+IEPS). Las dos tasas viven en `app_config.impuestos` y se copian dentro
-- de cada corte, para que cambiarlas no reescriba un mes ya cerrado.
--
-- Periodo mensual por FECHA DE PAGO. `pagos.fecha_pago` es `date` en
-- produccion (el archivo 20260803200000 la declara timestamptz; ver
-- docs/SCHEMA_NOTES.md), asi que el mes sale de la fecha sin zona horaria.
--
-- Lo que esta migracion NO toca, a proposito:
--
--   * `vendedores.comision_pct` — solo se comenta como obsoleta. Tirar una
--     columna es irreversible y sus dos valores vivos (12 y 10) son el unico
--     registro de lo que se pacto con cada vendedor, y la semilla natural de
--     su primera escalera. El drop va en una migracion aparte, despues de un
--     release donde ya nadie la lea.
--
--   * La tabla `comisiones` — vacia y ya sin generacion automatica (ver
--     app/api/admin/pedidos/crear/route.ts). Se comenta como obsoleta y se
--     tira en esa misma limpieza. Asi esta migracion es puramente aditiva.
--
-- Tampoco se siembra ninguna escalera: sin tramos el calculo devuelve 0 con
-- una bandera de "sin esquema" y la UI avisa, en vez de inventar un default
-- que nadie pacto.
--
-- TODO va en una sola transaccion: si algo falla, no queda nada a medias.
-- ============================================================

begin;

-- ── 1. Tasas de impuestos ───────────────────────────────────
--
-- En `app_config` y no hardcodeadas porque son una decision del negocio, no
-- del codigo. `src/lib/comisiones.ts` trae los mismos numeros como fallback:
-- si la fila no se puede leer, el calculo no cambia de resultado.

insert into public.app_config (key, value)
values ('impuestos', '{"iva_tasa": 0.16, "ieps_tasa": 0.265}'::jsonb)
on conflict (key) do nothing;

comment on table public.app_config is
  'Config global. Clave `impuestos`: tasas que traen incluidos los precios de productos, usadas para netear la base de comisiones.';

-- El vendedor NO es is_staff(), asi que `config_staff_read` no lo alcanza y
-- sin esto su Inicio no podria netear su propia base. Se le abre esa clave y
-- solo esa: nada de branding ni de negocio.
drop policy if exists "config_vendedor_read_impuestos" on public.app_config;

create policy "config_vendedor_read_impuestos" on public.app_config
  for select to authenticated
  using (public.is_vendedor() and key = 'impuestos');


-- ── 2. comision_tramos ──────────────────────────────────────
--
-- `vendedor_id` nullable: null = esquema global por default. La resolucion es
-- todo-o-nada, nunca mezcla: si un vendedor tiene tramos propios se usan solo
-- esos; si no tiene ninguno, los globales.

create table if not exists public.comision_tramos (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid references public.vendedores(id) on delete cascade,
  desde       numeric(14,2) not null,
  hasta       numeric(14,2),
  porcentaje  numeric(6,3) not null,
  created_at  timestamptz not null default now(),

  constraint comision_tramos_desde_no_negativo
    check (desde >= 0),
  -- `hasta` null = tramo abierto (el ultimo de la escalera).
  constraint comision_tramos_rango
    check (hasta is null or hasta > desde),
  constraint comision_tramos_porcentaje
    check (porcentaje >= 0 and porcentaje <= 100)
);

comment on table public.comision_tramos is
  'Escalera de comision marginal. vendedor_id null = esquema global por default. Un vendedor con tramos propios ignora los globales (no se mezclan).';
comment on column public.comision_tramos.hasta is
  'Limite superior. null = tramo abierto, solo valido en el ultimo tramo. Un ultimo tramo cerrado es un tope: lo cobrado arriba no paga comision.';

-- Dos indices unicos parciales y no uno solo sobre (vendedor_id, desde):
-- en un indice unico NULL <> NULL, asi que la version sin partir no
-- protegeria al esquema global de tener dos tramos con el mismo `desde`.
create unique index if not exists comision_tramos_vendedor_desde_key
  on public.comision_tramos(vendedor_id, desde) where vendedor_id is not null;

create unique index if not exists comision_tramos_global_desde_key
  on public.comision_tramos(desde) where vendedor_id is null;


-- ── 3. Validacion de la escalera completa ───────────────────
--
-- Que los tramos sean contiguos, que arranquen en 0 y que a lo mas haya uno
-- abierto son propiedades del CONJUNTO, no de una fila: ningun CHECK las
-- puede expresar. Va como constraint trigger DEFERRABLE INITIALLY DEFERRED
-- para que el patron "borra la escalera e inserta la nueva" sea valido
-- mientras la transaccion esta a medias y se valide solo al final.
--
-- Con el `desde` unico mas la contiguidad exacta, los traslapes quedan
-- imposibles sin necesidad de una exclusion constraint ni de btree_gist.

create or replace function public.validar_comision_tramos()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_vendedor    uuid;
  v_etiqueta    text;
  v_n           int;
  v_min         numeric;
  v_prev_hasta  numeric := null;
  v_primera     boolean := true;
  r             record;
begin
  -- A quien le cambio la escalera. En DELETE la fila viva es OLD.
  v_vendedor := case when TG_OP = 'DELETE' then OLD.vendedor_id else NEW.vendedor_id end;

  v_etiqueta := case
    when v_vendedor is null then 'el esquema global'
    else 'el vendedor ' || v_vendedor::text
  end;

  -- `is not distinct from` y no `=`: con v_vendedor null, `= null` no hace
  -- match con nada y el esquema global se quedaria sin validar.
  select count(*), min(desde)
    into v_n, v_min
  from public.comision_tramos
  where vendedor_id is not distinct from v_vendedor;

  -- Escalera borrada por completo: es un estado valido ("sin esquema").
  if v_n = 0 then
    return null;
  end if;

  if v_min <> 0 then
    raise exception 'Los tramos de comision de % deben empezar en 0, empiezan en %', v_etiqueta, v_min
      using errcode = '23514';
  end if;

  for r in
    select desde, hasta
    from public.comision_tramos
    where vendedor_id is not distinct from v_vendedor
    order by desde
  loop
    if not v_primera then
      if v_prev_hasta is null then
        raise exception 'Los tramos de comision de % tienen un tramo abierto que no es el ultimo', v_etiqueta
          using errcode = '23514';
      end if;
      if v_prev_hasta <> r.desde then
        raise exception 'Los tramos de comision de % no son contiguos: uno cierra en % y el siguiente abre en %',
          v_etiqueta, v_prev_hasta, r.desde
          using errcode = '23514';
      end if;
    end if;
    v_prev_hasta := r.hasta;
    v_primera := false;
  end loop;

  return null;
end $$;

drop trigger if exists trg_validar_comision_tramos on public.comision_tramos;

create constraint trigger trg_validar_comision_tramos
  after insert or update or delete on public.comision_tramos
  deferrable initially deferred
  for each row execute function public.validar_comision_tramos();


-- ── 4. Reemplazo atomico de la escalera ─────────────────────
--
-- La UI edita la escalera completa, no renglon por renglon: con contiguidad
-- obligatoria, mover un limite exige tocar dos filas a la vez y cualquier
-- orden intermedio es invalido.
--
-- Queda en SECURITY INVOKER (el default) a proposito: asi el delete y los
-- insert pasan por las policies de abajo y el permiso real lo da RLS. El
-- check de is_super_admin() de adentro es solo para dar un error legible en
-- vez de un "0 filas afectadas" silencioso.

create or replace function public.set_comision_tramos(p_vendedor_id uuid, p_tramos jsonb)
returns setof public.comision_tramos
language plpgsql
set search_path = public as $$
declare
  v_t jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Solo super admin puede editar los tramos de comision'
      using errcode = '42501';
  end if;

  if p_vendedor_id is not null
     and not exists (select 1 from public.vendedores where id = p_vendedor_id) then
    raise exception 'No existe la ficha de vendedor %', p_vendedor_id
      using errcode = '23503';
  end if;

  if p_tramos is not null and jsonb_typeof(p_tramos) <> 'array' then
    raise exception 'p_tramos debe ser un arreglo JSON, llego %', jsonb_typeof(p_tramos)
      using errcode = '22023';
  end if;

  delete from public.comision_tramos
  where vendedor_id is not distinct from p_vendedor_id;

  for v_t in select value from jsonb_array_elements(coalesce(p_tramos, '[]'::jsonb)) loop
    insert into public.comision_tramos (vendedor_id, desde, hasta, porcentaje)
    values (
      p_vendedor_id,
      (v_t->>'desde')::numeric,
      nullif(v_t->>'hasta', '')::numeric,
      (v_t->>'porcentaje')::numeric
    );
  end loop;

  -- Dispara aqui el trigger diferido. Sin esto el error de una escalera
  -- invalida saldria al hacer commit, fuera de esta llamada, y PostgREST lo
  -- reportaria sin relacion con la operacion que lo causo.
  set constraints all immediate;

  return query
    select *
    from public.comision_tramos
    where vendedor_id is not distinct from p_vendedor_id
    order by desde;
end $$;

comment on function public.set_comision_tramos(uuid, jsonb) is
  'Reemplaza la escalera completa de un vendedor (o la global con null) en una transaccion. p_tramos: [{desde, hasta, porcentaje}]. Arreglo vacio = sin esquema.';

revoke execute on function public.set_comision_tramos(uuid, jsonb) from public, anon;
grant  execute on function public.set_comision_tramos(uuid, jsonb) to authenticated;


-- ── 5. comision_cortes ──────────────────────────────────────
--
-- Snapshot mensual por vendedor. Que la fila EXISTA significa que el mes esta
-- cerrado; el mes abierto se calcula en vivo y no se persiste. Por eso no hay
-- estado 'abierto': 'pendiente' es cerrado sin pagar.
--
-- Guarda la base, el desglose y ADEMAS las tasas y la escalera que se usaron,
-- para que el corte sea reproducible aunque despues cambien los tramos o las
-- tasas.

create table if not exists public.comision_cortes (
  id            uuid primary key default gen_random_uuid(),
  vendedor_id   uuid not null references public.vendedores(id) on delete restrict,
  periodo       date not null,

  base          numeric(14,2) not null,
  comision      numeric(14,2) not null,

  iva_tasa      numeric(6,4) not null,
  ieps_tasa     numeric(6,4) not null,

  por_tramo     jsonb not null default '[]'::jsonb,
  detalle       jsonb not null default '[]'::jsonb,
  tramos_usados jsonb not null default '[]'::jsonb,

  estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'pagada')),

  cerrado_at    timestamptz not null default now(),
  cerrado_por   uuid references auth.users(id),
  pagado_at     timestamptz,
  pagado_por    uuid references auth.users(id),
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- El periodo siempre es el dia 1 del mes, para que (vendedor, periodo) sea
  -- una llave util y no haya dos cortes del mismo mes con fechas distintas.
  --
  -- El `::timestamp` es necesario, no decorativo: `date_trunc(text, date)`
  -- puede resolverse al overload de timestamptz, que es STABLE, y Postgres
  -- rechaza una funcion no IMMUTABLE dentro de un CHECK. Con el cast explicito
  -- se elige el overload de timestamp, que si es IMMUTABLE.
  constraint comision_cortes_periodo_dia1
    check (periodo = date_trunc('month', periodo::timestamp)::date),
  constraint comision_cortes_pagado_coherente
    check (
      (estado = 'pagada'    and pagado_at is not null) or
      (estado = 'pendiente' and pagado_at is null)
    )
);

comment on table public.comision_cortes is
  'Snapshot mensual de comision por vendedor. Su existencia = mes cerrado. Guarda tasas y escalera usadas para ser reproducible.';
comment on column public.comision_cortes.detalle is
  'Renglones por pedido que componen la base: [{pedido_id, cobrado, base}].';
comment on column public.comision_cortes.por_tramo is
  'Desglose marginal: [{desde, hasta, porcentaje, porcion, comision}].';

create unique index if not exists comision_cortes_vendedor_periodo_key
  on public.comision_cortes(vendedor_id, periodo);

create index if not exists comision_cortes_periodo_idx
  on public.comision_cortes(periodo desc);

-- `on delete restrict` en vendedor_id: un corte es un registro de dinero. Si
-- la ficha tiene cortes, borrarla falla, que es lo correcto — las fichas se
-- desactivan (`activo = false`), no se borran.


-- ── 6. Policies ─────────────────────────────────────────────
--
-- Lectura: staff ve todo; el vendedor ve su escalera (propia o la global que
-- le aplica) y sus propios cortes.
--
-- Escritura: is_super_admin() y no is_admin(). En SQL is_admin() incluye
-- `ventas` y `produccion`, mas ancho de lo que promete la pantalla: los
-- tramos y los cortes son dinero y los edita super admin.

alter table public.comision_tramos enable row level security;
alter table public.comision_cortes enable row level security;

drop policy if exists "comision_tramos_staff_read"    on public.comision_tramos;
drop policy if exists "comision_tramos_vendedor_read" on public.comision_tramos;
drop policy if exists "comision_tramos_super_write"   on public.comision_tramos;

create policy "comision_tramos_staff_read" on public.comision_tramos
  for select to authenticated
  using (public.is_staff());

-- El `is_vendedor()` de adelante no es redundante: sin el, la rama
-- `vendedor_id is null` seria verdadera para cualquier authenticated y le
-- abriria la escalera global a los compradores del portal.
create policy "comision_tramos_vendedor_read" on public.comision_tramos
  for select to authenticated
  using (
    public.is_vendedor()
    and (vendedor_id is null or vendedor_id = public.mi_vendedor_id())
  );

create policy "comision_tramos_super_write" on public.comision_tramos
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "comision_cortes_staff_read"    on public.comision_cortes;
drop policy if exists "comision_cortes_vendedor_read" on public.comision_cortes;
drop policy if exists "comision_cortes_super_write"   on public.comision_cortes;

create policy "comision_cortes_staff_read" on public.comision_cortes
  for select to authenticated
  using (public.is_staff());

-- Sus propios cortes cerrados. La pantalla de Fase 3 solo le muestra el
-- estimado del mes en curso, pero un vendedor no puede quedar ciego a su
-- propio historico de comisiones pagadas y agregarlo no deberia pedir otra
-- migracion.
create policy "comision_cortes_vendedor_read" on public.comision_cortes
  for select to authenticated
  using (
    public.is_vendedor()
    and vendedor_id = public.mi_vendedor_id()
  );

create policy "comision_cortes_super_write" on public.comision_cortes
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());


-- ── 7. Lo viejo, marcado obsoleto (sin tocar los datos) ─────

comment on column public.vendedores.comision_pct is
  'OBSOLETA: reemplazada por public.comision_tramos (Fase 3). Se conserva como registro del porcentaje pactado y semilla de la primera escalera. Ya no la lee nadie; se tira en una migracion de limpieza posterior.';

comment on table public.comisiones is
  'OBSOLETA: modelo viejo de comision fija sobre lo vendido, materializada al crear el pedido. Vacia y sin generacion automatica desde Fase 2. Reemplazada por comision_tramos + comision_cortes. Se tira en una migracion de limpieza posterior.';

commit;
