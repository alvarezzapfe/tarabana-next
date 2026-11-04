-- ============================================================
-- Limpieza del modelo viejo de comisiones — NO APLICAR TODAVIA
-- ============================================================
--
-- Esta migracion es el segundo paso, deliberadamente separado de
-- 20261104100000_comisiones_tramos.sql. Correrla antes de tiempo no rompe la
-- app (el release de Fase 3 ya dejo de leer las dos cosas), pero si tira
-- datos que no se pueden recuperar.
--
-- Correla cuando se cumplan las dos:
--
--   1. El release de Fase 3 esta en produccion y las escaleras de comision
--      ya estan capturadas (public.comision_tramos tiene filas). Mientras no
--      lo esten, `vendedores.comision_pct` es el unico registro de lo que se
--      pacto con cada vendedor: 12% Enrique Ejival, 10% Rafael Pulido.
--
--   2. Confirmaste que `public.comisiones` sigue vacia. Estaba vacia al
--      escribir esto; el guard de abajo aborta si alguien le metio filas.
--
-- Despues de esto hay que quitar `comision_pct` de tarabana_schema.sql y de
-- la lista de columnas de docs/SCHEMA_NOTES.md.
-- ============================================================

begin;

-- ── Guard: no borrar historial sin querer ───────────────────

do $$
declare
  v_comisiones int;
  v_tramos     int;
begin
  select count(*) into v_comisiones from public.comisiones;
  if v_comisiones > 0 then
    raise exception using
      message = format('public.comisiones tiene %s filas y esta migracion la tira', v_comisiones),
      hint    = 'Exporta esas filas (o borra el guard a sabiendas) antes de correr esto.';
  end if;

  select count(*) into v_tramos from public.comision_tramos;
  if v_tramos = 0 then
    raise exception using
      message = 'No hay ni un tramo capturado en public.comision_tramos',
      hint    = 'vendedores.comision_pct es ahora mismo el unico registro del % pactado. Captura las escaleras en Comercial -> Comisiones antes de tirarla.';
  end if;
end $$;


-- ── El modelo viejo ─────────────────────────────────────────

drop table if exists public.comisiones;

alter table public.vendedores drop column if exists comision_pct;

commit;
