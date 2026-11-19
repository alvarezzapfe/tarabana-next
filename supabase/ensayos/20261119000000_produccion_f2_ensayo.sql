-- ############################################################
-- #  ENSAYO EN SECO F2 (v3)  —  TERMINA EN ROLLBACK           #
-- ############################################################
--
-- Pegar COMPLETO en el SQL Editor y correr UNA vez. Sin una sola linea con
-- barra invertida.
--
--   Todo bien  -> un grid de ~82 renglones, todos PASS.
--   Algo falla -> un error con el detalle, y la transaccion se aborta sola.
--
-- ── Historial de los dos fallos de este ensayo ──
--
-- v1: aborto en el guard con "avanzar_lote quedo usando current_date". Falso
--     positivo del ENSAYO, no de la migracion: `pg_get_functiondef` devuelve
--     el cuerpo verbatim, comentarios incluidos, y dos cuerpos tenian una
--     nota que decia "hoy_mx() y no current_date". El guard se disparo contra
--     la explicacion del arreglo. Ningun cuerpo nombra ya la palabra.
--
-- v2: fallo en #90, que esperaba 500 L en camino y obtuvo 1300. Tambien era
--     el ensayo el que estaba mal: la expectativa olvidaba que el PRIMER lote
--     de Brasa queda en `envasado` con 800 L reales y 3 dias de envasado, asi
--     que su fin estimado es hoy + 3 y cae dentro de la ventana. La cuenta
--     completa esta escrita junto a la comprobacion, y se agrego #94 (son 2
--     lotes, no 1), que es lo que habria delatado el error en vez de dejarlo
--     escondido detras de un total.
--
-- De paso: las comprobaciones ya no comparten numero. Antes doce pares
-- distintos usaban el mismo id, asi que "fallo #52" era ambiguo entre dos
-- pruebas de cosas diferentes. Cada bloque tiene su rango.
--
-- El cuerpo de la migracion es byte-identico a
-- supabase/migrations/20261119000000_produccion_f2.sql salvo los dos timeouts
-- y commit -> rollback.
-- ############################################################

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
-- ── Una regla sobre los comentarios ──
--
-- Dentro del cuerpo de una funcion NO se puede escribir la palabra que nombra
-- a la fecha del servidor en UTC. No es mania: el guard del bloque 8 revisa
-- las funciones con `pg_get_functiondef`, que reconstruye el CREATE FUNCTION
-- con el cuerpo VERBATIM —comentarios incluidos—, asi que un comentario que
-- diga "usamos hoy_mx() y no <esa palabra>" hace que el guard se dispare
-- contra si mismo y aborte la migracion completa. Ya paso una vez.
--
-- Las vistas no tienen el problema: `pg_get_viewdef` imprime la definicion
-- reconstruida desde el arbol de parseo, y ahi los comentarios no sobreviven.
--
-- Aqui arriba, fuera de todo cuerpo de funcion, se puede nombrar sin riesgo.
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

set local lock_timeout = '5s';
set local statement_timeout = '180s';


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

  -- hoy_mx() y no la fecha del servidor, que se evalua en UTC: un lote
  -- capturado la noche del 31 de diciembre se foliaria con el año siguiente.
  --
  -- Esta nota NO nombra la funcion de UTC a proposito. Ver "Una regla sobre
  -- los comentarios" en el encabezado.
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

  -- hoy_mx() y no la fecha del servidor, que se evalua en UTC: envasar a las
  -- 19:00 CDMX estampaba la fecha de mañana. `fecha_liberado` es timestamptz
  -- y se queda con now(), que no tiene el problema (guarda el instante, no
  -- el dia).
  --
  -- Esta nota NO nombra la funcion de UTC a proposito. Ver "Una regla sobre
  -- los comentarios" en el encabezado.
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
--
-- OJO al revisar esto: `pg_get_functiondef` devuelve el cuerpo con sus
-- COMENTARIOS, asi que el guard no distingue codigo de comentario. Por eso
-- ningun cuerpo de funcion de este archivo puede nombrar la palabra; ver la
-- regla del encabezado. Este bloque es un `do`, no una funcion, asi que
-- `pg_get_functiondef` nunca lo mira y aqui la palabra es inofensiva.

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

  -- TODAS las funciones del modulo, no solo las dos que la F1 tenia mal.
  -- Antes esto no se podia: con la palabra en los comentarios de dos cuerpos,
  -- ampliar el guard habria disparado mas falsos positivos. Ahora que ningun
  -- cuerpo la nombra, cubrirlas todas sale gratis y protege a la siguiente.
  foreach v in array array[
    'public.avanzar_lote(uuid, public.lote_etapa, uuid, text)',
    'public.lote_asigna_folio()',
    'public.lote_sincroniza_asignacion()',
    'public.aplicar_envasado_a_inventario(uuid, uuid)',
    'public.fecha_mx(timestamptz)',
    'public.hoy_mx()'
  ] loop
    if pg_get_functiondef(v::regprocedure) ilike '%current_date%' then
      raise exception using
        message = format('%s quedo usando current_date (UTC) en vez de hoy_mx().', v),
        hint    = 'Abortando: el "hoy" se adelanta un dia entre las 18:00 y la medianoche de CDMX. Si esto salta por un COMENTARIO que nombra la palabra, el arreglo es quitarla del comentario: ver la regla del encabezado.';
    end if;
  end loop;

  -- El otro lado del mismo error: un `::date` crudo sobre un timestamptz
  -- castea en la zona de la sesion. En la vista tiene que ir fecha_mx().
  if pg_get_viewdef('public.lotes_vista'::regclass) ilike '%etapa_desde)::date%'
     or pg_get_viewdef('public.lotes_vista'::regclass) ilike '%fecha_liberado)::date%' then
    raise exception using
      message = 'lotes_vista castea un timestamptz con ::date en vez de fecha_mx().',
      hint    = 'Abortando: ::date usa la zona de la sesion (UTC) y mezcla dos calendarios con hoy_mx().';
  end if;
end $guard_fecha$;


-- ============================================================
-- VERIFICACIONES  (dentro de la transaccion, antes del rollback)
-- ============================================================

create temp table _ensayo (n int, seccion text, prueba text, resultado text, esperado text);

create or replace function pg_temp.chk(
  p_n int, p_seccion text, p_prueba text, p_resultado anyelement, p_esperado text
) returns void language sql as $chk$
  insert into _ensayo values (p_n, p_seccion, p_prueba, coalesce(p_resultado::text,'<null>'), p_esperado);
$chk$;

-- ── 1. recetas ──
select pg_temp.chk(1,'1 recetas','la tabla existe',
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='recetas' and c.relkind='r'), '1');

select pg_temp.chk(2,'1 recetas','columnas esperadas',
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='recetas'
      and column_name in ('producto_id','og_obj','fg_obj','temp_ferm_min','temp_ferm_max',
        'dias_coccion','dias_fermentacion','dias_maduracion','dias_envasado',
        'levadura_cepa','levadura_proveedor','notas','created_by','created_at','updated_at')), '15');

select pg_temp.chk(3,'1 recetas','unique por producto',
  (select count(*) from pg_indexes where schemaname='public' and indexname='recetas_producto_key'), '1');

select pg_temp.chk(4,'1 recetas','los 3 checks existen',
  (select count(*) from pg_constraint where conrelid='public.recetas'::regclass
     and conname in ('recetas_gravedades_chk','recetas_temp_chk','recetas_dias_chk')), '3');

select pg_temp.chk(5,'1 recetas','trigger de updated_at',
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='recetas' and not t.tgisinternal), '1');

select pg_temp.chk(6,'1 recetas','RLS encendido',
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='recetas'), 'true');

select pg_temp.chk(7,'1 recetas','policies: select/insert/update, sin delete',
  (select string_agg(polname,',' order by polname) from pg_policy
    where polrelid='public.recetas'::regclass), 'recetas_insert,recetas_select,recetas_update');

select pg_temp.chk(8,'1 recetas','sin policy de DELETE',
  (select count(*) from pg_policy where polrelid='public.recetas'::regclass and polcmd='d'), '0');

-- ── 2. El arreglo de current_date ──
select pg_temp.chk(10,'2 hoy_mx','lotes_vista ya NO usa current_date',
  (select position('current_date' in pg_get_viewdef('public.lotes_vista'::regclass)) = 0), 'true');

select pg_temp.chk(11,'2 hoy_mx','lotes_vista SI usa hoy_mx',
  (select position('hoy_mx' in pg_get_viewdef('public.lotes_vista'::regclass)) > 0), 'true');

-- Las SEIS funciones que el guard revisa. Esta comprobacion cubre tanto el
-- bug de verdad (codigo que usa la fecha en UTC) como el falso positivo que
-- aborto el primer ensayo: `pg_get_functiondef` devuelve el cuerpo con sus
-- COMENTARIOS, asi que un comentario que nombre la palabra tambien cuenta.
select pg_temp.chk(12,'2 hoy_mx','ninguna de las 6 funciones nombra current_date (ni en comentarios)',
  (select count(*) from unnest(array[
     'public.avanzar_lote(uuid, public.lote_etapa, uuid, text)',
     'public.lote_asigna_folio()',
     'public.lote_sincroniza_asignacion()',
     'public.aplicar_envasado_a_inventario(uuid, uuid)',
     'public.fecha_mx(timestamptz)',
     'public.hoy_mx()'
   ]) f
   where pg_get_functiondef(f::regprocedure) ilike '%current_date%'), '0');

select pg_temp.chk(13,'2 hoy_mx','y las 4 del modulo SI usan hoy_mx o fecha_mx',
  (select count(*) from unnest(array[
     'public.avanzar_lote(uuid, public.lote_etapa, uuid, text)',
     'public.lote_asigna_folio()',
     'public.lote_sincroniza_asignacion()',
     'public.fecha_mx(timestamptz)'
   ]) f
   where pg_get_functiondef(f::regprocedure) ilike '%hoy_mx%'
      or pg_get_functiondef(f::regprocedure) ilike '%time zone%'), '4');

select pg_temp.chk(14,'2 hoy_mx','inventario_en_camino ya NO usa current_date',
  (select position('current_date' in pg_get_viewdef('public.inventario_en_camino'::regclass)) = 0), 'true');

select pg_temp.chk(15,'2 hoy_mx','hoy_mx devuelve la fecha de Mexico',
  (select public.hoy_mx() = (now() at time zone 'America/Mexico_City')::date), 'true');

-- ── 3. lotes_vista v2 ──
select pg_temp.chk(20,'3 vista','columnas nuevas presentes',
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='lotes_vista'
      and column_name in ('tiene_receta','receta_id','og_obj','fg_obj','temp_ferm_min',
        'temp_ferm_max','dias_objetivo_etapa','dias_objetivo_total','fecha_fin_estimada',
        'alerta_motivos','alerta_nivel')), '11');

select pg_temp.chk(21,'3 vista','las columnas de la F1 siguen ahi',
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='lotes_vista'
      and column_name in ('folio','etapa','dias_en_etapa','merma_pct','ultima_gravedad',
        'tanque_nombre','producto_nombre','litros_envasados')), '8');

select pg_temp.chk(22,'3 vista','security_invoker sigue encendido',
  (select array_to_string(c.reloptions,',') from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='lotes_vista'), 'security_invoker=on');

select pg_temp.chk(23,'3 vista','grants recuperados tras el DROP',
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='lotes_vista'
      and privilege_type='SELECT' and grantee in ('authenticated','service_role')), '2');

select pg_temp.chk(24,'3 vista','corre y devuelve el lote real',
  (select count(*) from public.lotes_vista), '1');

select pg_temp.chk(25,'3 vista','inventario_en_camino existe y corre',
  (select count(*) >= 0 from public.inventario_en_camino), 'true');

select pg_temp.chk(26,'3 vista','receta_dias_etapa es inmutable',
  (select p.provolatile = 'i' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='receta_dias_etapa'), 'true');

select pg_temp.chk(16,'2 hoy_mx','fecha_mx existe y convierte a la zona del negocio',
  (select public.fecha_mx(now()) = (now() at time zone 'America/Mexico_City')::date), 'true');

select pg_temp.chk(17,'2 hoy_mx','lotes_vista usa fecha_mx y no ::date crudo',
  (select position('fecha_mx' in pg_get_viewdef('public.lotes_vista'::regclass)) > 0), 'true');

-- ── 9. Historia de ocupacion ──
select pg_temp.chk(150,'9 ocupacion','la tabla existe',
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='lote_tanque_asignaciones' and c.relkind='r'), '1');

select pg_temp.chk(151,'9 ocupacion','unique: solo una asignacion abierta por lote',
  (select count(*) from pg_indexes where schemaname='public' and indexname='lta_abierta_unica'), '1');

select pg_temp.chk(152,'9 ocupacion','tanque_id es on delete RESTRICT, no cascade',
  (select confdeltype from pg_constraint
    where conrelid='public.lote_tanque_asignaciones'::regclass and confrelid='public.tanques'::regclass), 'r');

select pg_temp.chk(153,'9 ocupacion','el trigger esta puesto en lotes',
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='lotes' and t.tgname='lote_asignacion_trg' and not t.tgisinternal), '1');

select pg_temp.chk(154,'9 ocupacion','RLS encendido y SOLO policy de select',
  (select string_agg(polname,',') from pg_policy
    where polrelid='public.lote_tanque_asignaciones'::regclass), 'lta_select');

select pg_temp.chk(155,'9 ocupacion','siembra: un renglon por el lote real con tanque',
  (select count(*) from public.lote_tanque_asignaciones), '1');

select pg_temp.chk(156,'9 ocupacion','y abierto, porque el lote esta vivo',
  (select hasta is null from public.lote_tanque_asignaciones limit 1), 'true');

select pg_temp.chk(157,'9 ocupacion','desde = la fecha de coccion del lote',
  (select a.desde = l.fecha_coccion from public.lote_tanque_asignaciones a
     join public.lotes l on l.id=a.lote_id limit 1), 'true');

select pg_temp.chk(158,'9 ocupacion','la vista tanque_ocupacion corre',
  (select count(*) from public.tanque_ocupacion), '1');

-- ============================================================
-- PRUEBA DE HUMO: las 4 alertas, la proyeccion y "en camino"
-- ============================================================
-- Todo dentro de la transaccion que se revierte.

do $humo$
declare
  v_brasa   uuid;
  v_carb    uuid;
  v_tanque  uuid;
  v_lote    uuid;
  v_nivel   text;
  v_mot     text[];
  v_fin     date;
  v_dias    int;
  v_litros  numeric;
  v_sinf    int;
  v_lotes   int;
  v_choco   boolean := false;
begin
  select id into v_brasa from public.productos where nombre='Brasa';
  select id into v_carb  from public.productos where nombre='Carboncillo';
  select id into v_tanque from public.tanques where nombre='FV1';

  -- ── Receta de Brasa ──
  insert into public.recetas (producto_id, og_obj, fg_obj, temp_ferm_min, temp_ferm_max,
                              dias_coccion, dias_fermentacion, dias_maduracion, dias_envasado,
                              levadura_cepa)
  values (v_brasa, 1.048, 1.010, 18.0, 21.0, 1, 14, 21, 3, 'W-34/70');

  -- Se intenta DE VERDAD una segunda receta del mismo producto.
  begin
    insert into public.recetas (producto_id, dias_coccion) values (v_brasa, 2);
  exception when unique_violation then v_choco := true;
  end;
  perform pg_temp.chk(30,'4 receta','una segunda receta del mismo producto choca', v_choco, 'true');
  perform pg_temp.chk(36,'4 receta','y sigue habiendo una sola',
    (select count(*) from public.recetas where producto_id=v_brasa), '1');

  -- ── Lote con receta: objetivos y proyeccion ──
  insert into public.lotes (producto_id, tanque_id, litros_objetivo, fecha_coccion)
  values (v_brasa, v_tanque, 800, public.hoy_mx())
  returning id into v_lote;

  select tiene_receta::text, dias_objetivo_total, fecha_fin_estimada
    into strict v_nivel, v_dias, v_fin
    from public.lotes_vista where id=v_lote;

  perform pg_temp.chk(31,'4 receta','el lote ve su receta', v_nivel, 'true');
  perform pg_temp.chk(32,'4 receta','dias objetivo total 1+14+21+3', v_dias, '39');
  perform pg_temp.chk(33,'4 receta','fin estimado = coccion + 39',
    v_fin, (public.hoy_mx() + 39)::text);

  perform pg_temp.chk(34,'4 receta','og_obj llega a la vista',
    (select og_obj from public.lotes_vista where id=v_lote), '1.048');

  -- En planeado no hay dias objetivo de etapa: planeado no tiene duracion.
  perform pg_temp.chk(35,'4 receta','dias_objetivo_etapa en planeado es null',
    (select dias_objetivo_etapa from public.lotes_vista where id=v_lote), '<null>');

  -- ── ALERTA 1: sin lectura > 48h, solo en fermentacion ──
  perform public.avanzar_lote(v_lote,'coccion',null);

  perform pg_temp.chk(40,'5 alertas','en coccion sin lecturas NO alerta por lectura',
    (select not ('sin_lectura_48h' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  perform public.avanzar_lote(v_lote,'fermentacion',null);

  perform pg_temp.chk(41,'5 alertas','en fermentacion sin ninguna lectura SI alerta',
    (select 'sin_lectura_48h' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');
  perform pg_temp.chk(42,'5 alertas','y el nivel es ambar',
    (select alerta_nivel from public.lotes_vista where id=v_lote), 'ambar');

  -- Una lectura reciente la apaga.
  insert into public.lote_lecturas (lote_id, gravedad) values (v_lote, 1.040);
  perform pg_temp.chk(43,'5 alertas','una lectura reciente apaga la alerta',
    (select not ('sin_lectura_48h' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  -- Una lectura de hace 50h NO la apaga.
  update public.lote_lecturas set fecha = now() - interval '50 hours' where lote_id=v_lote;
  perform pg_temp.chk(44,'5 alertas','una lectura de hace 50h vuelve a alertar',
    (select 'sin_lectura_48h' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');

  -- Y una de hace 47h no.
  update public.lote_lecturas set fecha = now() - interval '47 hours' where lote_id=v_lote;
  perform pg_temp.chk(45,'5 alertas','una de hace 47h no alerta (el corte es 48)',
    (select not ('sin_lectura_48h' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  -- ── ALERTA 2: dias en etapa > objetivo ──
  -- fermentacion objetivo = 14. Se mueve etapa_desde hacia atras.
  update public.lotes set etapa_desde = now() - interval '15 days' where id=v_lote;
  perform pg_temp.chk(50,'5 alertas','15 dias contra objetivo 14: etapa_vencida',
    (select 'etapa_vencida' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');
  perform pg_temp.chk(51,'5 alertas','y 15 dias aun es ambar, no rojo',
    (select alerta_nivel from public.lotes_vista where id=v_lote), 'ambar');

  update public.lotes set etapa_desde = now() - interval '29 days' where id=v_lote;
  perform pg_temp.chk(52,'5 alertas','29 dias pasa del doble: etapa_muy_vencida',
    (select 'etapa_muy_vencida' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');
  perform pg_temp.chk(53,'5 alertas','y eso si es rojo',
    (select alerta_nivel from public.lotes_vista where id=v_lote), 'rojo');

  update public.lotes set etapa_desde = now() - interval '14 days' where id=v_lote;
  perform pg_temp.chk(54,'5 alertas','exactamente 14 dias NO alerta (el corte es >)',
    (select not ('etapa_vencida' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  -- ── ALERTA 3: FG fuera de +-0.003 ──
  update public.lotes set etapa_desde = now(), og = 1.048, fg = 1.010 where id=v_lote;
  perform pg_temp.chk(60,'5 alertas','FG exacta al objetivo: sin alerta',
    (select not ('fg_fuera_rango' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  update public.lotes set fg = 1.013 where id=v_lote;
  perform pg_temp.chk(61,'5 alertas','FG a +0.003 justo: sin alerta (el corte es >)',
    (select not ('fg_fuera_rango' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  update public.lotes set fg = 1.014 where id=v_lote;
  perform pg_temp.chk(62,'5 alertas','FG a +0.004: alerta y es rojo',
    (select alerta_nivel from public.lotes_vista where id=v_lote), 'rojo');

  update public.lotes set fg = 1.006 where id=v_lote;
  perform pg_temp.chk(63,'5 alertas','FG a -0.004 tambien alerta (es valor absoluto)',
    (select 'fg_fuera_rango' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');

  -- ── ALERTA 4: merma > 10% ──
  update public.lotes set fg = 1.010, litros_reales = 800 where id=v_lote;
  perform public.avanzar_lote(v_lote,'envasado',null);
  -- 84 cajas de 24 = 715.68 L -> merma 84.32 L = 10.54%
  insert into public.lote_envasado (lote_id, producto_id, columna_stock, cantidad)
  values (v_lote, v_brasa, 'stock_caja24', 84);

  perform pg_temp.chk(70,'5 alertas','merma 10.54% supera el 10: rojo',
    (select alerta_nivel from public.lotes_vista where id=v_lote), 'rojo');
  perform pg_temp.chk(71,'5 alertas','y el motivo es merma_alta',
    (select 'merma_alta' = any(alerta_motivos) from public.lotes_vista where id=v_lote), 'true');

  -- 88 cajas = 749.76 -> merma 50.24 = 6.28%, por debajo del 10
  update public.lote_envasado set cantidad = 88 where lote_id=v_lote;
  perform pg_temp.chk(72,'5 alertas','merma 6.28% no alerta',
    (select not ('merma_alta' = any(alerta_motivos)) from public.lotes_vista where id=v_lote), 'true');

  -- ── Sin receta: las reglas que dependen de ella no disparan ──
  -- El lote real CAR-26-001 (Carboncillo, maduracion) no tiene receta.
  perform pg_temp.chk(80,'6 sin receta','el lote de Carboncillo no tiene receta',
    (select tiene_receta from public.lotes_vista where producto_id=v_carb limit 1), 'false');
  perform pg_temp.chk(81,'6 sin receta','sin receta no hay fin estimado',
    (select fecha_fin_estimada from public.lotes_vista where producto_id=v_carb limit 1), '<null>');
  perform pg_temp.chk(82,'6 sin receta','sin receta no alerta por etapa ni por FG',
    (select alerta_nivel from public.lotes_vista where producto_id=v_carb limit 1), 'ninguna');

  -- Receta incompleta: no se proyecta a medias.
  insert into public.recetas (producto_id, dias_coccion, dias_fermentacion)
  values (v_carb, 1, 14);
  perform pg_temp.chk(83,'6 sin receta','receta incompleta: total null, no una suma parcial',
    (select dias_objetivo_total from public.lotes_vista where producto_id=v_carb limit 1), '<null>');
  perform pg_temp.chk(84,'6 sin receta','y por lo tanto sin fin estimado',
    (select fecha_fin_estimada from public.lotes_vista where producto_id=v_carb limit 1), '<null>');

  -- ── EN CAMINO ──
  --
  -- Aqui Brasa termina con DOS lotes, y los dos caen en la ventana de 14
  -- dias. Vale la pena escribir la cuenta completa, porque la primera version
  -- de este ensayo esperaba 500 y la razon de que fallara fue olvidar el
  -- primero:
  --
  --   lote 1 (el de arriba): quedo en `envasado` con litros_reales = 800.
  --     dias_restantes('envasado') = dias_envasado = 3, y avanzar_lote le
  --     puso etapa_desde = now(), asi que su fin estimado es hoy + 3.
  --     DENTRO de la ventana  ->  aporta 800.
  --
  --   lote 2 (el de abajo): `planeado`, 500 L de objetivo, cocido hace 35
  --     dias. Planeado se ancla en fecha_coccion, asi que su fin es
  --     (hoy - 35) + 39 = hoy + 4.
  --     DENTRO de la ventana  ->  aporta 500.
  --
  --   total: 1300 L en 2 lotes.
  insert into public.lotes (producto_id, litros_objetivo, fecha_coccion)
  values (v_brasa, 500, public.hoy_mx() - 35);

  select litros, lotes, lotes_sin_fecha into v_litros, v_lotes, v_sinf
    from public.inventario_en_camino where producto_id=v_brasa;

  perform pg_temp.chk(90,'7 en camino','suma los litros de los DOS lotes que llegan (800 + 500)', v_litros, '1300');

  -- Esta comprobacion es la que de verdad falta en la version que fallo: el
  -- total por si solo no dice CUALES lotes entraron, y una suma correcta por
  -- las razones equivocadas se ve igual que una correcta.
  perform pg_temp.chk(94,'7 en camino','y son 2 lotes, no 1', v_lotes, '2');

  perform pg_temp.chk(91,'7 en camino','los dos tienen fin estimado, asi que no hay huecos', v_sinf, '0');

  -- Un lote sin receta completa se reporta aparte, no se suma.
  --
  -- Carboncillo tiene UN solo lote (el real, CAR-26-001), asi que el `limit 1`
  -- de las comprobaciones de arriba apunta a ese. Se verifica en vez de
  -- asumirlo: si algun dia hay dos, este ensayo estaria midiendo un renglon
  -- al azar y diria que todo bien.
  perform pg_temp.chk(95,'7 en camino','Carboncillo tiene un solo lote, que es lo que asume el limit 1',
    (select count(*) from public.lotes_vista where producto_id=v_carb), '1');

  select lotes_sin_fecha into v_sinf from public.inventario_en_camino where producto_id=v_carb;
  perform pg_temp.chk(92,'7 en camino','el lote sin fecha se cuenta aparte', v_sinf, '1');
  perform pg_temp.chk(93,'7 en camino','y NO entra en los litros',
    (select litros from public.inventario_en_camino where producto_id=v_carb), '0');
end $humo$;

do $humo2$
declare
  v_brasa  uuid;
  v_fv2    uuid;
  v_fv4    uuid;
  v_lote   uuid;
  v_fin    date;
  v_n      int;
begin
  select id into v_brasa from public.productos where nombre='Brasa';
  select id into v_fv2 from public.tanques where nombre='FV2';
  select id into v_fv4 from public.tanques where nombre='FV4';

  -- Receta de 39 dias ya sembrada arriba por el bloque anterior.

  -- ── La proyeccion se ancla en el reloj del lote, no en la coccion ──
  -- Un lote atrasado: cocido hace 50 dias, plan de 39, pero lleva 2 dias en
  -- fermentacion. Anclado en la coccion daria un fin 11 dias en el PASADO.
  insert into public.lotes (producto_id, tanque_id, litros_objetivo, fecha_coccion)
  values (v_brasa, v_fv2, 800, public.hoy_mx() - 50) returning id into v_lote;

  perform public.avanzar_lote(v_lote,'coccion',null);
  perform public.avanzar_lote(v_lote,'fermentacion',null);
  update public.lotes set etapa_desde = now() - interval '2 days' where id=v_lote;

  select fecha_fin_estimada into v_fin from public.lotes_vista where id=v_lote;

  perform pg_temp.chk(200,'10 proyeccion','un lote atrasado NO proyecta un fin en el pasado',
    (v_fin >= public.hoy_mx()), 'true');
  -- fermentacion restante = 14+21+3 = 38, desde hace 2 dias -> hoy + 36
  perform pg_temp.chk(201,'10 proyeccion','fin = etapa_desde + dias restantes',
    v_fin, (public.hoy_mx() - 2 + 38)::text);

  perform pg_temp.chk(202,'10 proyeccion','dias_restantes desde fermentacion es 38',
    (select dias_restantes from public.lotes_vista where id=v_lote), '38');

  -- ── El trigger de asignacion ──
  perform pg_temp.chk(210,'11 trigger','crear el lote abrio su asignacion',
    (select count(*) from public.lote_tanque_asignaciones
      where lote_id=v_lote and hasta is null and tanque_id=v_fv2), '1');

  -- Mover de tanque cierra el tramo y abre otro.
  update public.lotes set tanque_id = v_fv4 where id=v_lote;

  perform pg_temp.chk(211,'11 trigger','mover de tanque deja DOS tramos',
    (select count(*) from public.lote_tanque_asignaciones where lote_id=v_lote), '2');
  perform pg_temp.chk(212,'11 trigger','el tramo viejo quedo cerrado',
    (select count(*) from public.lote_tanque_asignaciones
      where lote_id=v_lote and tanque_id=v_fv2 and hasta is not null), '1');
  perform pg_temp.chk(213,'11 trigger','y el nuevo abierto',
    (select count(*) from public.lote_tanque_asignaciones
      where lote_id=v_lote and tanque_id=v_fv4 and hasta is null), '1');
  perform pg_temp.chk(214,'11 trigger','sigue habiendo UNA sola abierta',
    (select count(*) from public.lote_tanque_asignaciones
      where lote_id=v_lote and hasta is null), '1');

  -- El pasado ya se puede afirmar: el tramo cerrado dice que estuvo en FV2.
  perform pg_temp.chk(215,'11 trigger','la historia conserva el tanque anterior',
    (select tanque_nombre from public.tanque_ocupacion
      where lote_id=v_lote and not abierta), 'FV2');

  -- Soft-delete cierra el tramo: el tanque se libera.
  update public.lotes set deleted_at = now() where id=v_lote;
  perform pg_temp.chk(216,'11 trigger','borrar el lote libera el tanque',
    (select count(*) from public.lote_tanque_asignaciones
      where lote_id=v_lote and hasta is null), '0');
end $humo2$;

-- ── 8. Negacion por rol ──
do $neg$
declare v_n int; v_r int;
begin
  begin
    execute 'set local role authenticated';
  exception when others then
    perform pg_temp.chk(99,'8 negacion','SET ROLE authenticated','no permitido'::text,'OMITIDA');
    return;
  end;
  execute 'select count(*) from public.recetas'     into v_r;
  execute 'select count(*) from public.lotes_vista' into v_n;
  execute 'reset role';
  perform pg_temp.chk(100,'8 negacion','recetas visibles sin sesion', v_r, '0');
  perform pg_temp.chk(101,'8 negacion','lotes_vista visible sin sesion', v_n, '0');
  if v_r <> 0 or v_n <> 0 then
    raise exception 'FALLA DEL ENSAYO: un rol sin sesion vio datos';
  end if;
end $neg$;

-- ============================================================
-- VEREDICTO
-- ============================================================

do $veredicto$
declare v_fallas text;
begin
  select string_agg(format('  #%s [%s] %s -> obtuvo "%s", esperaba "%s"', n, seccion, prueba, resultado, esperado), E'\n' order by n)
    into v_fallas
    from _ensayo
   where case
           when esperado = 'security_invoker=on' then position('security_invoker=on' in resultado) = 0
           when esperado = 'OMITIDA' then false
           else resultado <> esperado
         end;

  if v_fallas is not null then
    raise exception E'ENSAYO F2 FALLIDO:\n%\n\nNada quedo aplicado: la transaccion se aborta.', v_fallas;
  end if;
end $veredicto$;

select n as "#", seccion, prueba, resultado, esperado,
       case when esperado='OMITIDA' then 'omitida' else 'PASS' end as veredicto
  from _ensayo order by n;

rollback;
