-- ============================================================
-- MODULO PRODUCCION
-- ============================================================
--
-- Extiende `lotes` (no la recrea), agrega tanques, bitacora de lecturas,
-- envasado, log de etapas, y el libro de movimientos de inventario que hasta
-- hoy no existia.
--
-- ── Estado del que parte, verificado contra produccion el 2026-11-18 ──
--
-- `lotes` en produccion es la tabla ORIGINAL de tarabana_schema.sql:241, con
-- sus 9 columnas y **0 filas**. Nunca tuvo una migracion encima. El unico
-- codigo que la tocaba era `app/admin/produccion/page.tsx`, y solo leia.
--
-- Que este vacia es lo que permite tirar las cinco columnas legacy sin
-- perder un dato. El guard del bloque 3 lo vuelve a comprobar en el momento
-- de aplicar: si alguien metio filas entre la verificacion y el deploy, esto
-- aborta en vez de tirarlas.
--
-- ── El stock sigue viviendo en `productos` ──
--
-- Inventario NO tiene tabla de movimientos: el stock son 7 contadores
-- enteros en `productos` y esa sigue siendo la verdad de lo que hay. Lo que
-- agrega esta migracion (`inventario_movimientos`) es el LIBRO de entradas,
-- para que la entrada por produccion pueda referenciar su `lote_id`. No
-- cambia como se LEE el stock en ninguna pantalla.
--
-- ── Por que todo va en bloques `do` con su guard dentro ──
--
-- El SQL Editor de Supabase confirma statement por statement, asi que un
-- `raise` suelto arriba no impide que lo de abajo corra (ver
-- docs/SCHEMA_NOTES.md). Cada guard vive en el MISMO bloque que lo que
-- protege.
--
-- Idempotente: se puede correr dos veces sin cambiar nada la segunda.

begin;


-- ============================================================
-- 1. Predicados nuevos, espejo de src/lib/roles.ts
-- ============================================================
--
-- Mismo patron que is_staff/is_admin/is_super_admin/is_vendedor: `stable`,
-- `security definer` y `search_path` fijo, para que las policies no dependan
-- del search_path del llamador.
--
-- La regla de nombres: cada funcion es el snake_case EXACTO de su helper de
-- roles.ts. Si divergen, un usuario entra a la pantalla y RLS le vacia las
-- tablas sin error — el mismo riesgo que documenta docs/RLS.md.
--
--   can_manage_inventory()  <->  canManageInventory()
--   is_staff_sin_ventas()   <->  isStaffSinVentas()
--   can_manage_as_admin()   <->  canManageAsAdmin()
--
-- Las tres son MAS ESTRECHAS que is_admin(), que incluye a ventas. Eso es el
-- punto: hasta hoy `lotes_write` usaba is_admin(), asi que ventas podia
-- escribir produccion aunque el sidebar le esconda la seccion. La UI
-- esconde, RLS permitia. Esto los alinea.

create or replace function public.can_manage_inventory()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','produccion')
      and coalesce(active, true) = true
  );
$$;

create or replace function public.is_staff_sin_ventas()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin','produccion','contabilidad')
      and coalesce(active, true) = true
  );
$$;

create or replace function public.can_manage_as_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('super_admin','admin')
      and coalesce(active, true) = true
  );
$$;

revoke execute on function public.can_manage_inventory() from public, anon;
revoke execute on function public.is_staff_sin_ventas()  from public, anon;
revoke execute on function public.can_manage_as_admin()  from public, anon;
grant  execute on function public.can_manage_inventory() to authenticated;
grant  execute on function public.is_staff_sin_ventas()  to authenticated;
grant  execute on function public.can_manage_as_admin()  to authenticated;

comment on function public.can_manage_inventory() is
  'Espejo de canManageInventory() en src/lib/roles.ts. Mas estrecha que is_admin(): excluye ventas.';
comment on function public.is_staff_sin_ventas() is
  'Espejo de isStaffSinVentas() en src/lib/roles.ts. Staff menos ventas; incluye contabilidad en solo lectura.';
comment on function public.can_manage_as_admin() is
  'Espejo de canManageAsAdmin() en src/lib/roles.ts. Solo super_admin y admin.';


-- ============================================================
-- 2. Tipos
-- ============================================================

do $enums$
begin
  if not exists (select 1 from pg_type where typname = 'lote_etapa') then
    create type public.lote_etapa as enum (
      'planeado', 'coccion', 'fermentacion', 'maduracion',
      'envasado', 'liberado', 'descartado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tanque_tipo') then
    create type public.tanque_tipo as enum ('fermentador', 'madurador', 'brite');
  end if;
end $enums$;


-- ============================================================
-- 3. productos.folio_prefijo
-- ============================================================
--
-- Las 3 letras del folio salen de una columna PROPIA, no derivadas del
-- nombre ni del estilo. Razon: `productos.estilo` es texto libre y choca
-- —'Lager' y 'Lager Mexicana' dan 'LAG' las dos— y derivar del nombre ataria
-- el folio a un nombre que puede cambiar. Aqui el prefijo se captura una vez
-- y se congela.
--
-- Nullable a proposito, con unique parcial: un producto que nunca se cocina
-- en casa no necesita prefijo, y volverla NOT NULL romperia
-- `/api/admin/inventario/crear`, que hoy no manda el campo. Quien intente
-- crear un lote de un producto sin prefijo recibe un error explicito del
-- trigger del bloque 8, no un folio inventado.

alter table public.productos add column if not exists folio_prefijo text;

create unique index if not exists productos_folio_prefijo_key
  on public.productos (folio_prefijo)
  where folio_prefijo is not null;

alter table public.productos drop constraint if exists productos_folio_prefijo_fmt;
alter table public.productos add constraint productos_folio_prefijo_fmt
  check (folio_prefijo is null or folio_prefijo ~ '^[A-Z]{3}$');

comment on column public.productos.folio_prefijo is
  'Tres letras mayusculas para el folio de lote (BRA-26-014). Unica entre productos. null = no se cocina en casa.';

-- Semilla de los 11 productos vivos. `where folio_prefijo is null` la vuelve
-- idempotente y hace que un prefijo ya editado a mano no se pise.
update public.productos p
   set folio_prefijo = v.prefijo
  from (values
    ('Sílice',      'SIL'),
    ('Carboncillo', 'CAR'),
    ('Caliza',      'CAL'),
    ('Solarsteinn', 'SOL'),
    ('Brisa',       'BRI'),
    ('Terragrana',  'TER'),
    ('Zap Helles',  'ZAP'),
    ('Chula Vista', 'CHU'),
    ('Magma',       'MAG'),
    ('Oleaje',      'OLE'),
    ('Brasa',       'BRA')
  ) as v(nombre, prefijo)
 where p.nombre = v.nombre
   and p.folio_prefijo is null;


-- ============================================================
-- 4. tanques
-- ============================================================

create table if not exists public.tanques (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  tipo              public.tanque_tipo not null,
  capacidad_litros  numeric(10,2) not null check (capacidad_litros > 0),
  activo            boolean not null default true,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Unique sobre lower(nombre): 'FV1' y 'fv1' son el mismo tanque fisico.
create unique index if not exists tanques_nombre_key on public.tanques (lower(nombre));
create index if not exists tanques_activo_idx on public.tanques (activo);

comment on table public.tanques is
  'Vasijas fisicas. El CRUD vive en Configuracion (can_manage_as_admin); produccion las ve en solo lectura.';


-- ============================================================
-- 5. lotes: tirar lo legacy, agregar el modelo nuevo
-- ============================================================
--
-- Las cinco columnas que se van y quien las reemplaza:
--
--   nombre_lote          -> folio (generado, unico)
--   volumen_litros       -> litros_objetivo / litros_reales
--   latas_producidas     -> lote_envasado
--   barriles_producidos  -> lote_envasado
--   fecha_produccion     -> fecha_coccion
--
-- Son NOT NULL, asi que dejarlas obligaria a inventar un valor en cada
-- insert del modelo nuevo. El guard y los drops van en el mismo bloque.
--
-- El bloque entero esta condicionado a que `nombre_lote` TODAVIA exista. Sin
-- eso, re-correr la migracion cuando ya hay lotes de verdad abortaria
-- —habria filas y el guard se dispararia— aunque no quede nada que tirar, y
-- la migracion dejaria de ser idempotente justo cuando el modulo ya esta en
-- uso. Si las columnas ya se fueron, aqui no hay nada que hacer.

do $legacy$
declare
  v_filas int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lotes' and column_name = 'nombre_lote'
  ) then
    return;   -- ya se aplico; nada que proteger ni que tirar
  end if;

  select count(*) into v_filas from public.lotes;

  if v_filas > 0 then
    raise exception
      'ABORTADO: lotes tiene % filas y todavia trae las columnas legacy. Esta migracion se escribio contra una tabla VACIA (verificado 2026-11-18) y tira 5 columnas NOT NULL. Revisar que contienen esas filas antes de continuar.',
      v_filas;
  end if;

  alter table public.lotes
    drop column if exists nombre_lote,
    drop column if exists volumen_litros,
    drop column if exists latas_producidas,
    drop column if exists barriles_producidos,
    drop column if exists fecha_produccion;
end $legacy$;

alter table public.lotes
  add column if not exists folio               text,
  add column if not exists folio_prefijo       text,
  add column if not exists folio_anio          smallint,
  add column if not exists folio_consecutivo   integer,
  add column if not exists etapa               public.lote_etapa not null default 'planeado',
  add column if not exists etapa_desde         timestamptz not null default now(),
  add column if not exists tanque_id           uuid references public.tanques(id) on delete set null,
  add column if not exists litros_objetivo     numeric(10,2),
  add column if not exists litros_reales       numeric(10,2),
  add column if not exists og                  numeric(5,3),
  add column if not exists fg                  numeric(5,3),
  add column if not exists levadura_cepa       text,
  add column if not exists levadura_proveedor  text,
  add column if not exists levadura_generacion integer,
  add column if not exists fecha_coccion       date,
  add column if not exists fecha_envasado      date,
  add column if not exists fecha_liberado      timestamptz,
  add column if not exists notas               text,
  add column if not exists deleted_at          timestamptz,
  add column if not exists created_by          uuid references public.profiles(id) on delete set null;

-- `abv` aparte: una columna generada no admite `add column if not exists`
-- con expresion en todas las versiones, y hay que poder re-correr esto.
do $abv$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lotes' and column_name = 'abv'
  ) then
    alter table public.lotes
      add column abv numeric(5,2)
      generated always as (round((og - fg) * 131.25, 2)) stored;
  end if;
end $abv$;

alter table public.lotes drop constraint if exists lotes_gravedades_chk;
alter table public.lotes add constraint lotes_gravedades_chk
  check (og is null or fg is null or fg <= og);

alter table public.lotes drop constraint if exists lotes_litros_chk;
alter table public.lotes add constraint lotes_litros_chk
  check (
    (litros_objetivo is null or litros_objetivo > 0) and
    (litros_reales   is null or litros_reales   >= 0)
  );

create unique index if not exists lotes_folio_key on public.lotes (folio);
create unique index if not exists lotes_folio_serie_key
  on public.lotes (folio_prefijo, folio_anio, folio_consecutivo);
create index if not exists lotes_etapa_idx     on public.lotes (etapa) where deleted_at is null;
create index if not exists lotes_tanque_idx    on public.lotes (tanque_id) where deleted_at is null;
create index if not exists lotes_coccion_idx   on public.lotes (fecha_coccion desc);
create index if not exists lotes_liberado_idx  on public.lotes (fecha_liberado desc);

comment on column public.lotes.abv is
  'Generada: round((og - fg) * 131.25, 2). Es el ABV MEDIDO del lote; productos.abv es el nominal del estilo.';
comment on column public.lotes.etapa_desde is
  'Desde cuando el lote esta en su etapa actual. La escribe avanzar_lote() junto con el renglon de lote_eventos, para que el log y el "dias en etapa" no puedan divergir.';
comment on column public.lotes.deleted_at is
  'Soft-delete. Se llama deleted_at y no descontinuado_at (el de productos) porque aqui no es una baja de catalogo: un lote borrado es una captura equivocada.';


-- ============================================================
-- 6. Consecutivo del folio
-- ============================================================
--
-- Tabla contador en vez de `max(folio_consecutivo) + 1`: dos cocciones
-- capturadas al mismo tiempo leerian el mismo max y chocarian contra
-- lotes_folio_key. El `on conflict do update ... returning` toma el lock del
-- renglon, asi que la segunda transaccion espera y se lleva el siguiente.

create table if not exists public.lote_folios (
  prefijo  text     not null,
  anio     smallint not null,
  ultimo   integer  not null default 0,
  primary key (prefijo, anio)
);

comment on table public.lote_folios is
  'Contador del consecutivo por (prefijo, anio). No tocar a mano: bajar un contador reusaria un folio ya emitido.';


-- ============================================================
-- 7. lote_lecturas, lote_envasado, lote_eventos
-- ============================================================

create table if not exists public.lote_lecturas (
  id             uuid primary key default gen_random_uuid(),
  lote_id        uuid not null references public.lotes(id) on delete cascade,
  fecha          timestamptz not null default now(),
  gravedad       numeric(5,3),
  temperatura_c  numeric(5,2),
  ph             numeric(4,2),
  nota           text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Una lectura sin ninguna medicion ni nota es ruido en la grafica.
  constraint lote_lecturas_algo_chk check (
    gravedad is not null or temperatura_c is not null
    or ph is not null or nullif(btrim(nota), '') is not null
  )
);

create index if not exists lote_lecturas_lote_idx on public.lote_lecturas (lote_id, fecha desc);


-- El envasado habla en COLUMNAS DE STOCK, que es el vocabulario de
-- inventario (src/lib/unidades.ts), no en unidades de venta de pedido_items.
-- Son dos vocabularios distintos y mezclarlos manda el stock a la columna
-- equivocada.
create table if not exists public.lote_envasado (
  id            uuid primary key default gen_random_uuid(),
  lote_id       uuid not null references public.lotes(id) on delete cascade,
  producto_id   uuid not null references public.productos(id),
  columna_stock text not null,
  cantidad      integer not null check (cantidad > 0),
  -- GENERADA, no capturada: los factores son los de LITROS_POR_UNIDAD en
  -- src/lib/unidades.ts (lata = 355 ml, asi que caja12 = 4.26 L y
  -- caja24 = 8.52 L). Calcularla aqui impide que el cliente mande litros que
  -- no corresponden a la cantidad, que falsearia la merma en silencio.
  -- Si esos factores cambian, se cambian EN LOS DOS LADOS.
  litros_equivalentes numeric(10,3) generated always as (
    cantidad * case columna_stock
      when 'stock_latas'          then 0.355
      when 'stock_caja12'         then 4.26
      when 'stock_caja24'         then 8.52
      when 'stock_barril_pet'     then 20
      when 'stock_barril_acero'   then 20
      when 'stock_barril10_pet'   then 10
      when 'stock_barril10_acero' then 10
    end
  ) stored,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint lote_envasado_columna_chk check (columna_stock in (
    'stock_latas', 'stock_caja12', 'stock_caja24',
    'stock_barril_pet', 'stock_barril_acero',
    'stock_barril10_pet', 'stock_barril10_acero'
  ))
);

-- Un renglon por (lote, producto, presentacion): capturar dos veces la misma
-- presentacion es corregir la cantidad, no sumar otro renglon.
create unique index if not exists lote_envasado_unico
  on public.lote_envasado (lote_id, producto_id, columna_stock);


-- Log de etapas. Append-only: nadie con `authenticated` lo escribe, solo
-- avanzar_lote() con su actor real. Sin eso, el log se puede forjar y deja
-- de ser evidencia de quien movio que.
create table if not exists public.lote_eventos (
  id         uuid primary key default gen_random_uuid(),
  lote_id    uuid not null references public.lotes(id) on delete cascade,
  etapa_de   public.lote_etapa,
  etapa_a    public.lote_etapa not null,
  actor_id   uuid references public.profiles(id) on delete set null,
  nota       text,
  created_at timestamptz not null default now()
);

create index if not exists lote_eventos_lote_idx on public.lote_eventos (lote_id, created_at desc);


-- ============================================================
-- 8. inventario_movimientos
-- ============================================================
--
-- La tabla que hacia falta para que "la entrada a inventario referencie el
-- lote" signifique algo: hasta hoy no habia movimiento al que ponerle un
-- lote_id. El historial de inventario era `audit_log`, que es bitacora de
-- acciones y no libro de existencias.
--
-- `productos.stock_*` sigue siendo la verdad de lo que HAY. Esto es el libro
-- de lo que ENTRO y salio. Nace solo con las entradas por produccion; el
-- ajuste manual (/api/admin/inventario/[id]/stock) y la entrega se le pueden
-- conectar despues sin migrar nada.

create table if not exists public.inventario_movimientos (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos(id),
  columna_stock text not null,
  delta         integer not null check (delta <> 0),
  motivo        text not null,
  lote_id       uuid references public.lotes(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint inventario_mov_columna_chk check (columna_stock in (
    'stock_latas', 'stock_caja12', 'stock_caja24',
    'stock_barril_pet', 'stock_barril_acero',
    'stock_barril10_pet', 'stock_barril10_acero'
  ))
);

-- El guard de idempotencia que impide duplicar stock: si alguien libera el
-- mismo lote dos veces, el segundo insert choca, la transaccion aborta y
-- `productos.stock_*` NO se suma dos veces. `avanzar_lote()` ya lo rechaza
-- por etapa terminal; esto es el cinturon debajo del tirante.
create unique index if not exists inventario_mov_lote_unico
  on public.inventario_movimientos (lote_id, producto_id, columna_stock)
  where lote_id is not null;

create index if not exists inventario_mov_producto_idx
  on public.inventario_movimientos (producto_id, created_at desc);

comment on table public.inventario_movimientos is
  'Libro de entradas/salidas de inventario. productos.stock_* sigue siendo la existencia actual; esto es el rastro con referencia al lote.';


-- ============================================================
-- 9. Trigger: folio y updated_at
-- ============================================================

create or replace function public.lote_asigna_folio()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_prefijo text;
  v_anio    smallint;
  v_cons    integer;
begin
  if new.folio is not null then
    return new;   -- folio explicito (migracion, carga historica)
  end if;

  select folio_prefijo into v_prefijo from public.productos where id = new.producto_id;

  if v_prefijo is null then
    raise exception
      'El producto no tiene prefijo de folio. Capturalo en Inventario (3 letras, p.ej. BRA) antes de crear un lote.'
      using errcode = 'check_violation';
  end if;

  v_anio := (extract(year from coalesce(new.fecha_coccion, current_date))::int % 100)::smallint;

  insert into public.lote_folios (prefijo, anio, ultimo)
  values (v_prefijo, v_anio, 1)
  on conflict (prefijo, anio) do update set ultimo = lote_folios.ultimo + 1
  returning ultimo into v_cons;

  new.folio_prefijo     := v_prefijo;
  new.folio_anio        := v_anio;
  new.folio_consecutivo := v_cons;
  new.folio := v_prefijo || '-' || lpad(v_anio::text, 2, '0') || '-' || lpad(v_cons::text, 3, '0');

  return new;
end $$;

drop trigger if exists lote_folio_trg on public.lotes;
create trigger lote_folio_trg
  before insert on public.lotes
  for each row execute function public.lote_asigna_folio();


-- No habia trigger de updated_at en ningun lado del proyecto: el codigo lo
-- seteaba a mano. Aqui si hace falta, porque lotes se escribe desde varias
-- rutas y desde dos funciones SQL, y una de ellas que se olvide deja el
-- updated_at mintiendo.
create or replace function public.toca_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lotes_updated_at_trg on public.lotes;
create trigger lotes_updated_at_trg
  before update on public.lotes
  for each row execute function public.toca_updated_at();

drop trigger if exists tanques_updated_at_trg on public.tanques;
create trigger tanques_updated_at_trg
  before update on public.tanques
  for each row execute function public.toca_updated_at();


-- ============================================================
-- 10. avanzar_lote(): la transicion de etapa, con sus requisitos
-- ============================================================
--
-- Unico camino para mover la etapa. Valida, mueve, loguea el evento con el
-- actor real y —si la etapa destino es 'liberado'— mete la entrada a
-- inventario, todo en la MISMA transaccion. Si la entrada falla, la etapa no
-- se movio.
--
-- Reglas estructurales:
--   • Solo hacia adelante. Se puede SALTAR una etapa (hay cervezas que no
--     maduran) pero no retroceder: un lote que ya se envaso no vuelve a
--     fermentar, y permitirlo dejaria el log contando una historia falsa.
--   • 'liberado' y 'descartado' son terminales.
--   • 'descartado' se alcanza desde cualquier etapa no terminal.
--
-- Requisitos de datos (los dos que pidio el dueno del proyecto):
--   • No se pasa a 'envasado' sin FG.
--   • No se libera sin al menos un renglon de lote_envasado.

create or replace function public.lote_etapa_orden(p_etapa public.lote_etapa)
returns integer language sql immutable as $$
  select case p_etapa
    when 'planeado'     then 0
    when 'coccion'      then 1
    when 'fermentacion' then 2
    when 'maduracion'   then 3
    when 'envasado'     then 4
    when 'liberado'     then 5
    when 'descartado'   then 99
  end;
$$;


create or replace function public.aplicar_envasado_a_inventario(
  p_lote_id uuid,
  p_actor   uuid
) returns void language plpgsql security definer
set search_path = public as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select producto_id, columna_stock, cantidad
    from public.lote_envasado
    where lote_id = p_lote_id
    order by producto_id, columna_stock
  loop
    -- La columna viene de una tabla con CHECK sobre esas 7, pero se vuelve a
    -- validar aqui para que el `format('%I')` de abajo sea obviamente seguro
    -- para quien lea esto, sin tener que ir a buscar el constraint.
    if r.columna_stock not in (
      'stock_latas', 'stock_caja12', 'stock_caja24',
      'stock_barril_pet', 'stock_barril_acero',
      'stock_barril10_pet', 'stock_barril10_acero'
    ) then
      raise exception 'Columna de stock no reconocida: %', r.columna_stock;
    end if;

    execute format(
      'update public.productos set %1$I = %1$I + $1, updated_at = now() where id = $2',
      r.columna_stock
    ) using r.cantidad, r.producto_id;

    -- Este insert es el guard de idempotencia: choca contra
    -- inventario_mov_lote_unico si el lote ya se libero, y aborta la
    -- transaccion completa antes de que el stock quede sumado dos veces.
    insert into public.inventario_movimientos
      (producto_id, columna_stock, delta, motivo, lote_id, created_by)
    values
      (r.producto_id, r.columna_stock, r.cantidad, 'lote.liberado', p_lote_id, p_actor);

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El lote no tiene envasado registrado: no hay nada que subir a inventario.'
      using errcode = 'check_violation';
  end if;
end $$;


create or replace function public.avanzar_lote(
  p_lote_id uuid,
  p_etapa   public.lote_etapa,
  p_actor   uuid,
  p_nota    text default null
) returns public.lotes language plpgsql security definer
set search_path = public as $$
declare
  l            public.lotes;
  v_envasado   int;
  v_etapa_de   public.lote_etapa;
begin
  select * into l from public.lotes
   where id = p_lote_id and deleted_at is null
     for update;

  if not found then
    raise exception 'Lote no encontrado.' using errcode = 'no_data_found';
  end if;

  if l.etapa = p_etapa then
    raise exception 'El lote % ya esta en etapa %.', l.folio, p_etapa
      using errcode = 'check_violation';
  end if;

  if l.etapa in ('liberado', 'descartado') then
    raise exception 'El lote % esta en % y ya no avanza.', l.folio, l.etapa
      using errcode = 'check_violation';
  end if;

  if p_etapa <> 'descartado'
     and public.lote_etapa_orden(p_etapa) < public.lote_etapa_orden(l.etapa) then
    raise exception 'No se puede volver de % a %: las etapas solo avanzan.', l.etapa, p_etapa
      using errcode = 'check_violation';
  end if;

  -- ── Requisitos ──
  if p_etapa = 'envasado' and l.fg is null then
    raise exception 'No se puede envasar el lote % sin FG registrada.', l.folio
      using errcode = 'check_violation';
  end if;

  if p_etapa = 'liberado' then
    select count(*) into v_envasado from public.lote_envasado where lote_id = p_lote_id;
    if v_envasado = 0 then
      raise exception 'No se puede liberar el lote % sin registro de envasado.', l.folio
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── Mover ──
  -- La etapa de origen se guarda ANTES del update: `l` se reasigna con el
  -- `returning` y ya trae la etapa nueva.
  v_etapa_de := l.etapa;

  update public.lotes set
    etapa          = p_etapa,
    etapa_desde    = now(),
    fecha_envasado = case when p_etapa = 'envasado' and fecha_envasado is null
                          then current_date else fecha_envasado end,
    fecha_liberado = case when p_etapa = 'liberado' and fecha_liberado is null
                          then now() else fecha_liberado end
  where id = p_lote_id
  returning * into l;

  insert into public.lote_eventos (lote_id, etapa_de, etapa_a, actor_id, nota)
  values (p_lote_id, v_etapa_de, p_etapa, p_actor, p_nota);

  -- La entrada a inventario va DESPUES del update y en la misma
  -- transaccion: si choca con el unique, la etapa tampoco queda movida.
  if p_etapa = 'liberado' then
    perform public.aplicar_envasado_a_inventario(p_lote_id, p_actor);
  end if;

  return l;
end $$;


-- Solo las rutas que ya validaron el rol llaman estas funciones, con el
-- service client. Mismo criterio que public.aplicar_pago.
--
-- El grant a service_role va EXPLICITO y no se deja al default: revocar de
-- `public` quita el EXECUTE que las funciones nuevas heredan de PUBLIC, y si
-- el proyecto no tuviera el `alter default privileges` de Supabase que se lo
-- concede aparte, service_role se quedaria sin poder llamarlas — o sea, con
-- la unica via de ejecucion cerrada.
revoke execute on function public.avanzar_lote(uuid, public.lote_etapa, uuid, text) from public, anon, authenticated;
revoke execute on function public.aplicar_envasado_a_inventario(uuid, uuid)          from public, anon, authenticated;
grant  execute on function public.avanzar_lote(uuid, public.lote_etapa, uuid, text) to service_role;
grant  execute on function public.aplicar_envasado_a_inventario(uuid, uuid)          to service_role;


-- ============================================================
-- 11. Vista lotes_vista: merma, dias en etapa, ultima gravedad
-- ============================================================
--
-- Columnas ENUMERADAS y no `l.*` a proposito: `create or replace view` con
-- `*` congela la lista del momento en que se creo, asi que un
-- `alter table lotes add column` posterior NO aparece en la vista y nadie se
-- entera. El proyecto ya se quemo con eso en pedidos_saldo (ver
-- docs/SCHEMA_NOTES.md: el archivo declara 11 columnas, produccion tiene 16).
--
-- `security_invoker = on` igual que pedidos_saldo: las policies de lotes se
-- evaluan con el rol que consulta, no con el dueno de la vista.

drop view if exists public.lotes_vista;

create view public.lotes_vista with (security_invoker = on) as
select
  l.id,
  l.folio,
  l.folio_prefijo,
  l.folio_anio,
  l.folio_consecutivo,
  l.producto_id,
  l.etapa,
  l.etapa_desde,
  l.tanque_id,
  l.litros_objetivo,
  l.litros_reales,
  l.og,
  l.fg,
  l.abv,
  l.levadura_cepa,
  l.levadura_proveedor,
  l.levadura_generacion,
  l.fecha_coccion,
  l.fecha_envasado,
  l.fecha_liberado,
  l.notas,
  l.created_by,
  l.created_at,
  l.updated_at,

  p.nombre  as producto_nombre,
  p.estilo  as producto_estilo,

  t.nombre           as tanque_nombre,
  t.tipo             as tanque_tipo,
  t.capacidad_litros as tanque_capacidad,

  env.litros_envasados,

  -- Merma = litros_reales - sum(litros_equivalentes).
  -- null, no 0, cuando falta un lado: un lote sin litros_reales capturados o
  -- sin envasado no tiene merma "de cero", tiene merma DESCONOCIDA, y
  -- promediarla como 0 bajaria el KPI con lotes que no dicen nada.
  case
    when l.litros_reales is null or env.litros_envasados is null then null
    else round(l.litros_reales - env.litros_envasados, 3)
  end as merma_litros,

  case
    when l.litros_reales is null or l.litros_reales = 0 or env.litros_envasados is null then null
    else round((l.litros_reales - env.litros_envasados) / l.litros_reales * 100, 2)
  end as merma_pct,

  ult.gravedad as ultima_gravedad,
  ult.fecha    as ultima_lectura_fecha,

  -- Dias enteros desde etapa_desde. En date, igual que dias_vencido de
  -- pedidos_saldo, para que "1 dia" signifique "ayer" y no "hace 24 horas".
  greatest(0, (current_date - l.etapa_desde::date)) as dias_en_etapa

from public.lotes l
join public.productos p on p.id = l.producto_id
left join public.tanques t on t.id = l.tanque_id
left join (
  select lote_id, round(sum(litros_equivalentes), 3) as litros_envasados
  from public.lote_envasado
  group by lote_id
) env on env.lote_id = l.id
left join lateral (
  select gravedad, fecha
  from public.lote_lecturas
  where lote_id = l.id and gravedad is not null
  order by fecha desc
  limit 1
) ult on true
where l.deleted_at is null;

comment on view public.lotes_vista is
  'Lotes vivos (deleted_at is null) con producto, tanque, merma, dias en etapa y ultima gravedad. Columnas enumeradas: agregar una a lotes pide tocar esta vista.';

grant select on public.lotes_vista to authenticated, service_role;


-- ============================================================
-- 12. RLS
-- ============================================================
--
--   select  -> is_staff_sin_ventas()   (super_admin, admin, produccion, contabilidad)
--   insert  -> can_manage_inventory()  (super_admin, admin, produccion)
--   update  -> can_manage_inventory()
--   delete  -> nadie. Soft-delete via deleted_at.
--   vendedor y ventas -> 0 filas.
--
-- Las policies viejas `lotes_read` / `lotes_write` se van: usaban
-- is_staff()/is_admin(), que incluyen a ventas.

alter table public.lotes                  enable row level security;
alter table public.tanques                enable row level security;
alter table public.lote_lecturas          enable row level security;
alter table public.lote_envasado          enable row level security;
alter table public.lote_eventos           enable row level security;
alter table public.lote_folios            enable row level security;
alter table public.inventario_movimientos enable row level security;

drop policy if exists "lotes_read"  on public.lotes;
drop policy if exists "lotes_write" on public.lotes;
drop policy if exists "lotes_admin" on public.lotes;

drop policy if exists "lotes_select" on public.lotes;
drop policy if exists "lotes_insert" on public.lotes;
drop policy if exists "lotes_update" on public.lotes;
create policy "lotes_select" on public.lotes
  for select to authenticated using (public.is_staff_sin_ventas());
create policy "lotes_insert" on public.lotes
  for insert to authenticated with check (public.can_manage_inventory());
create policy "lotes_update" on public.lotes
  for update to authenticated using (public.can_manage_inventory())
                             with check (public.can_manage_inventory());

-- tanques: los ve todo el modulo, los DEFINE admin. El CRUD esta en
-- Configuracion, cuyo item del sidebar es can_manage_as_admin, asi que el
-- predicado de la policy es el mismo guard que la pantalla ya impone.
drop policy if exists "tanques_select" on public.tanques;
drop policy if exists "tanques_write"  on public.tanques;
create policy "tanques_select" on public.tanques
  for select to authenticated using (public.is_staff_sin_ventas());
create policy "tanques_write" on public.tanques
  for all to authenticated using (public.can_manage_as_admin())
                          with check (public.can_manage_as_admin());

drop policy if exists "lote_lecturas_select" on public.lote_lecturas;
drop policy if exists "lote_lecturas_insert" on public.lote_lecturas;
drop policy if exists "lote_lecturas_update" on public.lote_lecturas;
create policy "lote_lecturas_select" on public.lote_lecturas
  for select to authenticated using (public.is_staff_sin_ventas());
create policy "lote_lecturas_insert" on public.lote_lecturas
  for insert to authenticated with check (public.can_manage_inventory());
create policy "lote_lecturas_update" on public.lote_lecturas
  for update to authenticated using (public.can_manage_inventory())
                             with check (public.can_manage_inventory());

drop policy if exists "lote_envasado_select" on public.lote_envasado;
drop policy if exists "lote_envasado_insert" on public.lote_envasado;
drop policy if exists "lote_envasado_update" on public.lote_envasado;
create policy "lote_envasado_select" on public.lote_envasado
  for select to authenticated using (public.is_staff_sin_ventas());
create policy "lote_envasado_insert" on public.lote_envasado
  for insert to authenticated with check (public.can_manage_inventory());
create policy "lote_envasado_update" on public.lote_envasado
  for update to authenticated using (public.can_manage_inventory())
                             with check (public.can_manage_inventory());

-- lote_eventos e inventario_movimientos: SOLO LECTURA para authenticated.
-- Los escribe avanzar_lote() con el actor real. Un log que el cliente puede
-- insertar deja de ser evidencia de quien movio que — el mismo criterio por
-- el que audit_log no se escribe desde el browser.
drop policy if exists "lote_eventos_select" on public.lote_eventos;
create policy "lote_eventos_select" on public.lote_eventos
  for select to authenticated using (public.is_staff_sin_ventas());

drop policy if exists "inventario_mov_select" on public.inventario_movimientos;
create policy "inventario_mov_select" on public.inventario_movimientos
  for select to authenticated using (public.is_staff_sin_ventas());

-- lote_folios: contador interno. Ninguna policy -> con RLS encendido y cero
-- policies, `authenticated` no lee ni escribe. Solo lo toca el trigger
-- (security definer) y service_role.

commit;
