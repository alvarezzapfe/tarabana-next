-- ============================================================
-- PRODUCCION FASE 2
-- ============================================================
--
-- Agrega recetas (los objetivos por producto), reescribe `lotes_vista` con
-- esos objetivos, la fecha estimada de fin y las alertas, y agrega la vista
-- de litros en camino para Inventario.
--
-- Y arregla tres `current_date` que se colaron en la migracion de la F1.
--
-- ── Lo primero, porque es un arreglo y no una feature ──
--
-- `20261118000000_produccion.sql` usa `current_date` en tres lugares. Este
-- proyecto ya habia pasado por eso: `20261105000000_pedidos_fechas.sql:49`
-- creo `public.hoy_mx()` justo porque `current_date` se evalua en UTC, y
-- despues de las 18:00 CDMX ya esta en el dia siguiente. Esa migracion hasta
-- dejo un guard que aborta si `pedidos_saldo` reincide (:330-343).
--
-- Lo que la version con `current_date` hace mal, en concreto:
--
--   * `avanzar_lote` sella `fecha_envasado = current_date`. Envasar a las
--     19:00 de un martes estampa el miercoles.
--   * `lotes_vista.dias_en_etapa` sale un dia de mas seis horas cada noche.
--     Ese numero alimenta el "parado" del tablero y, desde esta migracion,
--     tambien las alertas.
--   * El trigger del folio saca el año de `current_date` cuando no hay
--     `fecha_coccion`. Un lote creado la noche del 31 de diciembre se
--     folaria con el año siguiente.
--
-- Los tres pasan a `public.hoy_mx()`, y al final va el mismo guard para la
-- vista nueva.
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
-- 1. recetas
-- ============================================================
--
-- Una por producto (`unique`), no versionada. Editar una receta mueve los
-- objetivos de los lotes que ya corren; es lo que se decidio y para una
-- fabrica de un solo tanque por estilo es lo que se quiere. Si algun dia hay
-- que comparar un lote viejo contra la receta con la que se hizo, eso pide
-- versionar y guardar `receta_id` en el lote.
--
-- Los dias son por ETAPA y en columnas explicitas, no en jsonb: la vista los
-- suma y los compara, y un jsonb ahi obligaria a castear en cada expresion.

create table if not exists public.recetas (
  id                  uuid primary key default gen_random_uuid(),
  producto_id         uuid not null references public.productos(id) on delete cascade,

  og_obj              numeric(5,3),
  fg_obj              numeric(5,3),

  temp_ferm_min       numeric(4,1),
  temp_ferm_max       numeric(4,1),

  -- Dias objetivo por etapa. `planeado` no tiene: es la bandeja de entrada,
  -- no una etapa con duracion.
  dias_coccion        integer,
  dias_fermentacion   integer,
  dias_maduracion     integer,
  dias_envasado       integer,

  levadura_cepa       text,
  levadura_proveedor  text,

  notas               text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists recetas_producto_key on public.recetas (producto_id);

alter table public.recetas drop constraint if exists recetas_gravedades_chk;
alter table public.recetas add constraint recetas_gravedades_chk
  check (og_obj is null or fg_obj is null or fg_obj <= og_obj);

alter table public.recetas drop constraint if exists recetas_temp_chk;
alter table public.recetas add constraint recetas_temp_chk
  check (temp_ferm_min is null or temp_ferm_max is null or temp_ferm_min <= temp_ferm_max);

alter table public.recetas drop constraint if exists recetas_dias_chk;
alter table public.recetas add constraint recetas_dias_chk
  check (
    coalesce(dias_coccion, 0)      >= 0 and
    coalesce(dias_fermentacion, 0) >= 0 and
    coalesce(dias_maduracion, 0)   >= 0 and
    coalesce(dias_envasado, 0)     >= 0
  );

comment on table public.recetas is
  'Objetivos de proceso por producto. Una por producto. La vista lotes_vista los usa para proyectar el fin del lote y para las alertas.';

drop trigger if exists recetas_updated_at_trg on public.recetas;
create trigger recetas_updated_at_trg
  before update on public.recetas
  for each row execute function public.toca_updated_at();


-- ============================================================
-- 2. Arreglo: current_date -> hoy_mx() en el trigger del folio
-- ============================================================
--
-- Igual que la version de la F1 salvo esa linea. Se reescribe completa para
-- que el archivo sea la definicion y no un parche ilegible.

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

  -- hoy_mx() y no current_date: un lote capturado la noche del 31 de
  -- diciembre se folaria con el año siguiente.
  v_anio := (extract(year from coalesce(new.fecha_coccion, public.hoy_mx()))::int % 100)::smallint;

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


-- ============================================================
-- 3. Arreglo: current_date -> hoy_mx() en avanzar_lote
-- ============================================================

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
  v_etapa_de := l.etapa;

  -- hoy_mx() y no current_date: envasar a las 19:00 CDMX estampaba la fecha
  -- de mañana. `fecha_liberado` es timestamptz y se queda con now(), que no
  -- tiene el problema (guarda el instante, no el dia).
  update public.lotes set
    etapa          = p_etapa,
    etapa_desde    = now(),
    fecha_envasado = case when p_etapa = 'envasado' and fecha_envasado is null
                          then public.hoy_mx() else fecha_envasado end,
    fecha_liberado = case when p_etapa = 'liberado' and fecha_liberado is null
                          then now() else fecha_liberado end
  where id = p_lote_id
  returning * into l;

  insert into public.lote_eventos (lote_id, etapa_de, etapa_a, actor_id, nota)
  values (p_lote_id, v_etapa_de, p_etapa, p_actor, p_nota);

  if p_etapa = 'liberado' then
    perform public.aplicar_envasado_a_inventario(p_lote_id, p_actor);
  end if;

  return l;
end $$;

revoke execute on function public.avanzar_lote(uuid, public.lote_etapa, uuid, text) from public, anon, authenticated;
grant  execute on function public.avanzar_lote(uuid, public.lote_etapa, uuid, text) to service_role;


-- ============================================================
-- 3b. fecha_mx(): el dia de un instante, en la zona del negocio
-- ============================================================
--
-- Hermana de `hoy_mx()`, y hace falta por la misma razon. Castear un
-- timestamptz a date con `::date` usa la zona de la SESION —en Supabase, UTC—
-- asi que `etapa_desde::date` daba el dia UTC mientras `hoy_mx()` daba el de
-- Mexico. Restar uno del otro mezcla dos calendarios y vuelve a meter el
-- error de un dia que esta migracion vino a quitar, solo que mas dificil de
-- ver.
--
-- STABLE y no IMMUTABLE por lo mismo que hoy_mx(): depende de la zona, no del
-- reloj, pero `at time zone` sobre timestamptz no es inmutable.

create or replace function public.fecha_mx(p_momento timestamptz)
returns date
language sql
stable
set search_path = public as $$
  select (p_momento at time zone 'America/Mexico_City')::date
$$;

comment on function public.fecha_mx(timestamptz) is
  'El dia calendario de un instante en la zona del negocio. Usar en vez de ::date, que castea en la zona de la sesion (UTC) y da el dia equivocado 6 horas cada noche.';

grant execute on function public.fecha_mx(timestamptz) to authenticated, service_role;


-- ============================================================
-- 4. Dias objetivo de una etapa: una funcion, no cuatro CASE
-- ============================================================
--
-- La vista la necesita dos veces (la etapa actual y el total restante) y la
-- de "en camino" otra vez. Una funcion inmutable evita tres copias del mismo
-- CASE que se desincronizarian al agregar una etapa.
--
-- Devuelve null cuando la receta no define esa etapa: null no es cero. Un
-- producto sin dias de maduracion capturados no madura "cero dias", no se
-- sabe cuanto madura, y tratarlo como 0 adelantaria la proyeccion.

create or replace function public.receta_dias_etapa(
  p_etapa public.lote_etapa,
  p_coccion integer,
  p_fermentacion integer,
  p_maduracion integer,
  p_envasado integer
) returns integer language sql immutable as $$
  select case p_etapa
    when 'coccion'      then p_coccion
    when 'fermentacion' then p_fermentacion
    when 'maduracion'   then p_maduracion
    when 'envasado'     then p_envasado
    else null            -- planeado, liberado, descartado: sin duracion objetivo
  end;
$$;


-- ============================================================
-- 1b. lote_tanque_asignaciones: en que tanque estuvo cada lote
-- ============================================================
--
-- `lotes.tanque_id` es UNA columna mutable y sin historia. La ruta PATCH la
-- cambia sin registrar nada y `lote_eventos` solo guarda cambios de ETAPA.
-- Con eso, un calendario dibujado desde `fecha_coccion` afirma que el lote
-- estuvo en su tanque ACTUAL desde el dia de la coccion — y mover un lote de
-- fermentador a madurador es justamente lo normal.
--
-- Una pantalla de planeacion que miente sobre el pasado es peor que una que
-- admite no saberlo, asi que el pasado se guarda.
--
-- `hasta is null` significa "sigue ahi". El unique parcial garantiza que un
-- lote no pueda tener dos asignaciones abiertas a la vez.
--
-- `on delete restrict` en tanque_id y NO cascade: borrar un tanque no puede
-- borrar la historia de lo que se hizo en el. La ruta de borrado ya lo
-- impide contando lotes; el bloque 7b le agrega contar asignaciones, porque
-- un lote que se movio a otro tanque deja de contar por `lotes.tanque_id`
-- pero su historia sigue aqui.

create table if not exists public.lote_tanque_asignaciones (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references public.lotes(id)   on delete cascade,
  tanque_id   uuid not null references public.tanques(id) on delete restrict,
  desde       date not null,
  hasta       date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.lote_tanque_asignaciones drop constraint if exists lta_rango_chk;
alter table public.lote_tanque_asignaciones add constraint lta_rango_chk
  check (hasta is null or hasta >= desde);

create unique index if not exists lta_abierta_unica
  on public.lote_tanque_asignaciones (lote_id) where hasta is null;

create index if not exists lta_tanque_idx on public.lote_tanque_asignaciones (tanque_id, desde);
create index if not exists lta_lote_idx   on public.lote_tanque_asignaciones (lote_id, desde);

comment on table public.lote_tanque_asignaciones is
  'Historia de ocupacion: en que tanque estuvo cada lote y desde cuando. hasta is null = sigue ahi. La escribe SOLO el trigger lote_asignacion_trg; no hay policy de escritura.';


-- ── El trigger que la mantiene ──
--
-- En un trigger y no en la ruta PATCH a proposito: `lotes` lo escriben la
-- ruta, `avanzar_lote()` y cualquier cosa futura. Si la sincronizacion
-- viviera en la ruta, el primer camino que se olvide de llamarla deja la
-- historia incompleta y el calendario vuelve a mentir, pero esta vez sin que
-- nadie sepa por que.

create or replace function public.lote_sincroniza_asignacion()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_desde date;
  v_cierre date;
begin
  if tg_op = 'INSERT' then
    if new.tanque_id is not null then
      insert into public.lote_tanque_asignaciones (lote_id, tanque_id, desde, created_by)
      values (new.id, new.tanque_id, coalesce(new.fecha_coccion, public.hoy_mx()), new.created_by);
    end if;
    return new;
  end if;

  -- ── Cambio de tanque ──
  if new.tanque_id is distinct from old.tanque_id then
    -- `greatest` porque un lote planeado puede tener fecha_coccion futura: su
    -- asignacion abrio en el futuro y cerrarla "hoy" violaria hasta >= desde.
    update public.lote_tanque_asignaciones
       set hasta = greatest(desde, public.hoy_mx())
     where lote_id = new.id and hasta is null;

    if new.tanque_id is not null then
      insert into public.lote_tanque_asignaciones (lote_id, tanque_id, desde, created_by)
      values (new.id, new.tanque_id, public.hoy_mx(), new.created_by);
    end if;
  end if;

  -- ── El lote termina: el tanque se libera ──
  -- Sin esto, la barra de un lote liberado corre hasta hoy para siempre,
  -- porque `lotes.tanque_id` nunca se limpia.
  if new.etapa in ('liberado', 'descartado')
     and old.etapa not in ('liberado', 'descartado') then
    v_cierre := coalesce(public.fecha_mx(new.fecha_liberado), public.hoy_mx());
    update public.lote_tanque_asignaciones
       set hasta = greatest(desde, v_cierre)
     where lote_id = new.id and hasta is null;
  end if;

  -- ── Soft-delete: tampoco sigue ocupando ──
  if new.deleted_at is not null and old.deleted_at is null then
    update public.lote_tanque_asignaciones
       set hasta = greatest(desde, public.hoy_mx())
     where lote_id = new.id and hasta is null;
  end if;

  return new;
end $$;

drop trigger if exists lote_asignacion_trg on public.lotes;
create trigger lote_asignacion_trg
  after insert or update on public.lotes
  for each row execute function public.lote_sincroniza_asignacion();


-- ── Siembra de lo que ya existe ──
--
-- Un renglon por lote con tanque. `where not exists` lo vuelve idempotente.
-- Para los lotes ya liberados se cierra con su fecha real; para los vivos
-- queda abierto.

insert into public.lote_tanque_asignaciones (lote_id, tanque_id, desde, hasta, created_by)
select
  l.id,
  l.tanque_id,
  coalesce(l.fecha_coccion, public.fecha_mx(l.created_at)),
  case
    when l.deleted_at is not null then greatest(coalesce(l.fecha_coccion, public.fecha_mx(l.created_at)), public.fecha_mx(l.deleted_at))
    when l.etapa in ('liberado','descartado') then greatest(coalesce(l.fecha_coccion, public.fecha_mx(l.created_at)), coalesce(public.fecha_mx(l.fecha_liberado), public.hoy_mx()))
    else null
  end,
  l.created_by
from public.lotes l
where l.tanque_id is not null
  and not exists (
    select 1 from public.lote_tanque_asignaciones a where a.lote_id = l.id
  );


-- ============================================================
-- 4b. Dias que FALTAN desde la etapa actual
-- ============================================================
--
-- Cualquier null hace null el total, y eso es lo correcto: una receta
-- incompleta no se proyecta a medias.

create or replace function public.receta_dias_restantes(
  p_etapa public.lote_etapa,
  p_coccion integer,
  p_fermentacion integer,
  p_maduracion integer,
  p_envasado integer
) returns integer language sql immutable as $$
  select case p_etapa
    -- Planeado y coccion: todavia falta el plan completo.
    when 'planeado'     then p_coccion + p_fermentacion + p_maduracion + p_envasado
    when 'coccion'      then p_coccion + p_fermentacion + p_maduracion + p_envasado
    when 'fermentacion' then p_fermentacion + p_maduracion + p_envasado
    when 'maduracion'   then p_maduracion + p_envasado
    when 'envasado'     then p_envasado
    else null            -- liberado y descartado: ya no falta nada
  end;
$$;


-- ============================================================
-- 5. lotes_vista v2: objetivos, proyeccion y alertas
-- ============================================================
--
-- DROP + CREATE y no CREATE OR REPLACE: este agrega columnas en medio de la
-- lista, y `create or replace view` solo admite agregarlas al final. El drop
-- pierde los grants, asi que se vuelven a dar explicitamente — misma leccion
-- que documenta 20261113000001_pedido_ajuste_down.sql.
--
-- ── Los umbrales de las alertas viven AQUI ──
--
-- Una sola verdad. La UI pinta `alerta_nivel` y `alerta_motivos` sin
-- recalcular nada, y el contador del sidebar es un `count(*)` barato sobre
-- esta vista. Cambiarlos pide una migracion, que es el precio de no tener la
-- regla escrita en dos lenguajes.
--
--   HORAS_SIN_LECTURA = 48    ambar, solo en fermentacion
--   FG_TOLERANCIA     = 0.003 rojo
--   MERMA_PCT_MAX     = 10    rojo
--   dias en etapa > objetivo  ambar; > 2x objetivo  rojo
--
-- Las reglas que dependen de la receta NO disparan cuando no hay receta.
-- Eso no se esconde: `tiene_receta` es una columna, y la tarjeta lo dice.

drop view if exists public.lotes_vista;

create view public.lotes_vista with (security_invoker = on) as
with base as (
  select
    l.*,
    p.nombre  as producto_nombre,
    p.estilo  as producto_estilo,
    t.nombre           as tanque_nombre,
    t.tipo             as tanque_tipo,
    t.capacidad_litros as tanque_capacidad,
    env.litros_envasados,
    ult.gravedad as ultima_gravedad,
    ult.fecha    as ultima_lectura_fecha,

    -- Los DOS lados en la zona del negocio. `hoy_mx()` arregla la mitad
    -- izquierda; `fecha_mx()` la derecha, porque `etapa_desde::date` castea
    -- en la zona de la sesion (UTC) y restarle una fecha de Mexico mezcla
    -- dos calendarios.
    greatest(0, (public.hoy_mx() - public.fecha_mx(l.etapa_desde))) as dias_en_etapa,

    r.id       as receta_id,
    r.og_obj,
    r.fg_obj,
    r.temp_ferm_min,
    r.temp_ferm_max,
    r.dias_coccion,
    r.dias_fermentacion,
    r.dias_maduracion,
    r.dias_envasado,

    public.receta_dias_etapa(
      l.etapa, r.dias_coccion, r.dias_fermentacion, r.dias_maduracion, r.dias_envasado
    ) as dias_objetivo_etapa,

    public.receta_dias_restantes(
      l.etapa, r.dias_coccion, r.dias_fermentacion, r.dias_maduracion, r.dias_envasado
    ) as dias_restantes

  from public.lotes l
  join public.productos p on p.id = l.producto_id
  left join public.tanques t on t.id = l.tanque_id
  left join public.recetas r on r.producto_id = l.producto_id
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
  where l.deleted_at is null
),
calc as (
  select
    b.*,

    (b.receta_id is not null) as tiene_receta,

    -- Total de dias del plan completo. null si la receta no define alguna de
    -- las cuatro etapas: un total a medias proyectaria una fecha falsa.
    case
      when b.receta_id is null then null
      when b.dias_coccion is null or b.dias_fermentacion is null
        or b.dias_maduracion is null or b.dias_envasado is null then null
      else b.dias_coccion + b.dias_fermentacion + b.dias_maduracion + b.dias_envasado
    end as dias_objetivo_total,

    case
      when b.litros_reales is null or b.litros_envasados is null then null
      else round(b.litros_reales - b.litros_envasados, 3)
    end as merma_litros,

    case
      when b.litros_reales is null or b.litros_reales = 0 or b.litros_envasados is null then null
      else round((b.litros_reales - b.litros_envasados) / b.litros_reales * 100, 2)
    end as merma_pct
  from base b
),
proyeccion as (
  select
    c.*,

    -- Fecha estimada de fin del lote.
    --
    -- Se ancla en el reloj del PROPIO lote —`etapa_desde` mas los dias que
    -- faltan— y no en `fecha_coccion` mas el plan completo. La version
    -- anclada en la coccion tiene un defecto que se ve en cuanto un lote se
    -- atrasa: con un plan de 39 dias y 50 dias desde la coccion, proyecta el
    -- fin ONCE DIAS EN EL PASADO, o sea una barra que termina antes de hoy
    -- mientras el tanque esta visiblemente lleno.
    --
    -- `planeado` es la excepcion y se ancla en `fecha_coccion`: ahi el lote
    -- no ha empezado, asi que la fecha de coccion planeada ES el inicio.
    --
    -- El `greatest(hoy_mx(), ...)` evita que un lote atrasado proyecte hacia
    -- atras. No esconde el atraso: para eso esta la alerta `etapa_vencida`,
    -- que es donde el retraso se tiene que ver.
    --
    -- Un lote ya liberado no se proyecta: su fin es su fecha real.
    case
      when c.etapa = 'liberado'   then public.fecha_mx(c.fecha_liberado)
      when c.etapa = 'descartado' then null
      when c.dias_restantes is null then null
      when c.etapa = 'planeado' then
        case when c.fecha_coccion is null then null
             else greatest(public.hoy_mx(), c.fecha_coccion + c.dias_restantes) end
      else greatest(public.hoy_mx(), public.fecha_mx(c.etapa_desde) + c.dias_restantes)
    end as fecha_fin_estimada
  from calc c
),
alertas as (
  select
    p.*,
    -- Los motivos, en un array. Cada uno es una clave estable que la UI
    -- traduce; el texto no viaja desde SQL para no tener copy en dos idiomas
    -- de programacion.
    (
      case when p.etapa = 'fermentacion'
             and (p.ultima_lectura_fecha is null
                  or p.ultima_lectura_fecha < now() - interval '48 hours')
           then array['sin_lectura_48h']::text[] else array[]::text[] end
      ||
      case when p.dias_objetivo_etapa is not null
             and p.dias_en_etapa > p.dias_objetivo_etapa * 2
           then array['etapa_muy_vencida']::text[]
           when p.dias_objetivo_etapa is not null
             and p.dias_en_etapa > p.dias_objetivo_etapa
           then array['etapa_vencida']::text[] else array[]::text[] end
      ||
      case when p.fg is not null and p.fg_obj is not null
             and abs(p.fg - p.fg_obj) > 0.003
           then array['fg_fuera_rango']::text[] else array[]::text[] end
      ||
      case when p.merma_pct is not null and p.merma_pct > 10
           then array['merma_alta']::text[] else array[]::text[] end
    ) as alerta_motivos
  from proyeccion p
)
select
  a.id,
  a.folio,
  a.folio_prefijo,
  a.folio_anio,
  a.folio_consecutivo,
  a.producto_id,
  a.etapa,
  a.etapa_desde,
  a.tanque_id,
  a.litros_objetivo,
  a.litros_reales,
  a.og,
  a.fg,
  a.abv,
  a.levadura_cepa,
  a.levadura_proveedor,
  a.levadura_generacion,
  a.fecha_coccion,
  a.fecha_envasado,
  a.fecha_liberado,
  a.notas,
  a.created_by,
  a.created_at,
  a.updated_at,

  a.producto_nombre,
  a.producto_estilo,

  a.tanque_nombre,
  a.tanque_tipo,
  a.tanque_capacidad,

  a.litros_envasados,
  a.merma_litros,
  a.merma_pct,
  a.ultima_gravedad,
  a.ultima_lectura_fecha,
  a.dias_en_etapa,

  -- ── F2: receta y proyeccion ──
  a.tiene_receta,
  a.receta_id,
  a.og_obj,
  a.fg_obj,
  a.temp_ferm_min,
  a.temp_ferm_max,
  a.dias_objetivo_etapa,
  a.dias_objetivo_total,
  a.dias_restantes,
  a.fecha_fin_estimada,

  -- ── F2: alertas ──
  a.alerta_motivos,
  case
    when 'fg_fuera_rango'    = any(a.alerta_motivos) then 'rojo'
    when 'merma_alta'        = any(a.alerta_motivos) then 'rojo'
    when 'etapa_muy_vencida' = any(a.alerta_motivos) then 'rojo'
    when cardinality(a.alerta_motivos) > 0           then 'ambar'
    else 'ninguna'
  end as alerta_nivel

from alertas a;

comment on view public.lotes_vista is
  'Lotes vivos con producto, tanque, merma, dias en etapa, objetivos de su receta, fecha estimada de fin y alertas. Columnas ENUMERADAS: agregar una a lotes o a recetas pide tocar esta vista y el tipo LoteFila en app/admin/produccion/produccion-ui.ts.';

grant select on public.lotes_vista to authenticated, service_role;


-- ============================================================
-- 6. inventario_en_camino: litros que llegan por producto
-- ============================================================
--
-- Por PRODUCTO y en litros, no por presentacion: hasta que el lote se envasa
-- no se sabe en que presentacion va a salir, y repartirlo adivinando seria
-- inventar cajas. Litros es la unica unidad honesta aqui, y es la misma que
-- ya usan las tres columnas de litros de Inventario.
--
-- `litros_reales` cuando ya se midieron, `litros_objetivo` mientras no. Un
-- lote recien encubado no aporta cero.
--
-- Los lotes SIN fecha estimada (sin receta, o receta incompleta) quedan
-- fuera de la suma y se cuentan aparte en `lotes_sin_fecha`, para que el
-- hueco se vea en la pantalla en vez de desaparecer dentro de un total.

create or replace view public.inventario_en_camino with (security_invoker = on) as
select
  l.producto_id,
  count(*) filter (
    where l.fecha_fin_estimada is not null
      and l.fecha_fin_estimada between public.hoy_mx() and public.hoy_mx() + 14
  ) as lotes,
  coalesce(sum(coalesce(l.litros_reales, l.litros_objetivo)) filter (
    where l.fecha_fin_estimada is not null
      and l.fecha_fin_estimada between public.hoy_mx() and public.hoy_mx() + 14
  ), 0) as litros,
  count(*) filter (where l.fecha_fin_estimada is null) as lotes_sin_fecha
from public.lotes_vista l
where l.etapa not in ('liberado', 'descartado')
group by l.producto_id;

comment on view public.inventario_en_camino is
  'Litros proyectados por producto para los proximos 14 dias, de lotes en proceso. lotes_sin_fecha son los que no se pueden proyectar (sin receta o receta incompleta) y NO estan sumados en litros.';

grant select on public.inventario_en_camino to authenticated, service_role;


-- ============================================================
-- 6b. tanque_ocupacion: lo que el calendario dibuja
-- ============================================================
--
-- Una fila por tramo de ocupacion. `fin` es un HECHO cuando la asignacion ya
-- cerro, y una ESTIMACION mientras siga abierta — `estimado` lo dice, para
-- que el calendario pueda dibujar lo proyectado distinto de lo ocurrido en
-- vez de presentar los dos como lo mismo.
--
-- Un tramo abierto de un lote sin receta no tiene `fin`: se deja null y el
-- calendario lo dibuja como un trozo sin cierre. Inventarle un fin con los
-- umbrales de DIAS_NORMALES seria usar un umbral de atencion como si fuera
-- un plan.

create or replace view public.tanque_ocupacion with (security_invoker = on) as
select
  a.id,
  a.lote_id,
  a.tanque_id,
  t.nombre  as tanque_nombre,
  t.tipo    as tanque_tipo,
  t.activo  as tanque_activo,
  a.desde,
  a.hasta,
  (a.hasta is null) as abierta,
  l.folio,
  l.producto_id,
  l.producto_nombre,
  l.producto_estilo,
  l.etapa,
  l.litros_reales,
  l.litros_objetivo,
  l.tiene_receta,
  l.alerta_nivel,
  coalesce(a.hasta, l.fecha_fin_estimada) as fin,
  (a.hasta is null and l.fecha_fin_estimada is not null) as estimado
from public.lote_tanque_asignaciones a
join public.tanques t on t.id = a.tanque_id
join public.lotes_vista l on l.id = a.lote_id;

comment on view public.tanque_ocupacion is
  'Tramos de ocupacion por tanque para el calendario. `fin` es hecho si la asignacion cerro, estimado si sigue abierta (ver `estimado`), y null si el lote no tiene receta completa.';

grant select on public.tanque_ocupacion to authenticated, service_role;


-- ============================================================
-- 7. RLS de recetas
-- ============================================================

alter table public.recetas enable row level security;

drop policy if exists "recetas_select" on public.recetas;
drop policy if exists "recetas_insert" on public.recetas;
drop policy if exists "recetas_update" on public.recetas;

create policy "recetas_select" on public.recetas
  for select to authenticated using (public.is_staff_sin_ventas());
create policy "recetas_insert" on public.recetas
  for insert to authenticated with check (public.can_manage_inventory());
create policy "recetas_update" on public.recetas
  for update to authenticated using (public.can_manage_inventory())
                               with check (public.can_manage_inventory());

-- ── lote_tanque_asignaciones: solo lectura para authenticated ──
--
-- La escribe el trigger (security definer), nunca el cliente. Mismo criterio
-- que `lote_eventos` e `inventario_movimientos`: una historia que el cliente
-- puede insertar deja de ser evidencia de donde estuvo cada lote.

alter table public.lote_tanque_asignaciones enable row level security;

drop policy if exists "lta_select" on public.lote_tanque_asignaciones;
create policy "lta_select" on public.lote_tanque_asignaciones
  for select to authenticated using (public.is_staff_sin_ventas());


-- Sin policy de DELETE: una receta se edita, no se borra. Si de verdad hay
-- que quitarla, va por service_role desde una ruta que lo justifique.


-- ============================================================
-- 8. Guard: ninguna vista del modulo debe usar current_date
-- ============================================================
--
-- Mismo guard que 20261105000000_pedidos_fechas.sql:330 puso para
-- pedidos_saldo, ahora para las dos vistas de produccion. Si alguien vuelve
-- a colar un current_date, esto aborta en vez de dejar un "hoy" en UTC que
-- se equivoca seis horas cada noche.

do $guard_fecha$
declare
  v text;
begin
  foreach v in array array['lotes_vista', 'inventario_en_camino', 'tanque_ocupacion'] loop
    if pg_get_viewdef(('public.' || v)::regclass) ilike '%current_date%' then
      raise exception using
        message = format('%s quedo usando current_date (UTC) en vez de hoy_mx().', v),
        hint    = 'Abortando: entre las 18:00 y la medianoche de CDMX el "hoy" se adelanta un dia.';
    end if;
  end loop;

  if pg_get_functiondef('public.avanzar_lote(uuid, public.lote_etapa, uuid, text)'::regprocedure) ilike '%current_date%' then
    raise exception using
      message = 'avanzar_lote quedo usando current_date (UTC) en vez de hoy_mx().',
      hint    = 'Abortando: fecha_envasado se estamparia con el dia de mañana despues de las 18:00 CDMX.';
  end if;

  if pg_get_functiondef('public.lote_asigna_folio()'::regprocedure) ilike '%current_date%' then
    raise exception using
      message = 'lote_asigna_folio quedo usando current_date (UTC) en vez de hoy_mx().',
      hint    = 'Abortando: el año del folio se adelantaria la noche del 31 de diciembre.';
  end if;

  -- El otro lado del mismo error: un `::date` crudo sobre un timestamptz
  -- castea en la zona de la sesion. En la vista tiene que ir fecha_mx().
  if pg_get_viewdef('public.lotes_vista'::regclass) ilike '%etapa_desde)::date%'
     or pg_get_viewdef('public.lotes_vista'::regclass) ilike '%fecha_liberado)::date%' then
    raise exception using
      message = 'lotes_vista castea un timestamptz con ::date en vez de fecha_mx().',
      hint    = 'Abortando: ::date usa la zona de la sesion (UTC) y mezcla dos calendarios con hoy_mx().';
  end if;
end $guard_fecha$;

commit;
