-- ROLLBACK de 20261119000000_produccion_f2.sql
--
-- Quita recetas, la historia de ocupacion, las dos vistas nuevas y las
-- funciones de la F2, y devuelve `lotes_vista` a su forma de la F1.
--
-- ── Lo que NO se revierte, a proposito ──
--
-- Los tres `current_date` que esta migracion cambio por `hoy_mx()` se quedan
-- arreglados. Devolverlos seria reintroducir a mano un bug de zona horaria
-- conocido y documentado; un rollback sirve para quitar una feature, no para
-- volver a romper algo. Por eso `lotes_vista` se recrea con `hoy_mx()` y
-- `fecha_mx()`, no con `current_date`.
--
-- ── Lo que lo ABORTA ──
--
-- Historia de ocupacion con tramos ya cerrados. Esos renglones dicen en que
-- tanque estuvo un lote y cuando salio, y eso no se puede reconstruir desde
-- `lotes.tanque_id`, que solo guarda el tanque actual. Tirarlos borra el
-- pasado sin dejar rastro.
--
-- Las recetas NO lo abortan: son objetivos, se vuelven a capturar, y la
-- migracion de subida no las siembra.

begin;

do $rollback$
declare
  v_cerradas int;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='lote_tanque_asignaciones'
  ) then
    execute 'select count(*) from public.lote_tanque_asignaciones where hasta is not null'
      into v_cerradas;
    if v_cerradas > 0 then
      raise exception
        'ABORTADO: hay % tramo(s) de ocupacion ya cerrados. Dicen en que tanque estuvo cada lote y cuando salio, y eso no se reconstruye desde lotes.tanque_id. Exportar antes si de verdad se quiere bajar.',
        v_cerradas;
    end if;
  end if;

  -- ── Triggers y funciones del modulo F2 ──
  drop trigger if exists lote_asignacion_trg on public.lotes;
  drop trigger if exists recetas_updated_at_trg on public.recetas;

  drop view if exists public.tanque_ocupacion;
  drop view if exists public.inventario_en_camino;

  drop function if exists public.lote_sincroniza_asignacion();
  drop function if exists public.receta_dias_restantes(public.lote_etapa, integer, integer, integer, integer);
  drop function if exists public.receta_dias_etapa(public.lote_etapa, integer, integer, integer, integer);

  drop table if exists public.lote_tanque_asignaciones;
  drop table if exists public.recetas;

  -- `fecha_mx` se queda: la usa la vista que se recrea abajo, y es una
  -- utilidad de zona horaria que no pertenece a esta feature.
end $rollback$;


-- ── lotes_vista de vuelta a la forma de la F1 ──
--
-- Con hoy_mx()/fecha_mx() y no con current_date, por lo que dice el
-- encabezado. DROP + CREATE porque hay que quitar columnas, y re-grant
-- porque el drop se los lleva.

drop view if exists public.lotes_vista;

create view public.lotes_vista with (security_invoker = on) as
select
  l.id, l.folio, l.folio_prefijo, l.folio_anio, l.folio_consecutivo,
  l.producto_id, l.etapa, l.etapa_desde, l.tanque_id,
  l.litros_objetivo, l.litros_reales, l.og, l.fg, l.abv,
  l.levadura_cepa, l.levadura_proveedor, l.levadura_generacion,
  l.fecha_coccion, l.fecha_envasado, l.fecha_liberado, l.notas,
  l.created_by, l.created_at, l.updated_at,

  p.nombre as producto_nombre,
  p.estilo  as producto_estilo,

  t.nombre           as tanque_nombre,
  t.tipo             as tanque_tipo,
  t.capacidad_litros as tanque_capacidad,

  env.litros_envasados,

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

  greatest(0, (public.hoy_mx() - public.fecha_mx(l.etapa_desde))) as dias_en_etapa

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

grant select on public.lotes_vista to authenticated, service_role;

commit;
