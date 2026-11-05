-- ============================================================
-- Tira el trigger duplicado de vencimiento — NO APLICADA AUN
-- ============================================================
--
-- `public.pedidos` tiene DOS triggers que calculan `fecha_vencimiento`:
--
--   trg_calc_fecha_vencimiento  -> calc_fecha_vencimiento()
--       BEFORE INSERT OR UPDATE OF condiciones_pago, fecha_pedido,
--       fecha_vencimiento. Es el documentado, el que vive en las migraciones
--       (20260803200000 y 20261105000000) y el que calcula desde
--       `fecha_pedido` con la fecha de Mexico.
--
--   trg_fecha_vencimiento       -> set_fecha_vencimiento()
--       BEFORE INSERT OR UPDATE OF condiciones_pago. Calcula desde
--       `created_at`. NO existe en ninguna migracion, ni en
--       tarabana_schema.sql, ni en docs/: se creo directo contra la base y
--       nunca quedo en el repo.
--
-- Los dos son BEFORE sobre la misma tabla, asi que Postgres los corre en
-- orden ALFABETICO: `trg_c...` y despues `trg_f...`. El no documentado corre
-- al final y pisa el resultado del documentado.
--
-- Como se veia el sintoma, medido contra produccion:
--
--   INSERT con fecha_pedido = 2026-10-01 y condiciones 30_dias
--     esperado (fecha_pedido + 30)  2026-10-31
--     real     (created_at  + 30)   2026-12-05
--
--   Y un `fecha_vencimiento` capturado a mano en el INSERT tambien se perdia.
--
-- Por eso el UPDATE de `fecha_pedido` si funcionaba y el INSERT no: el viejo
-- no dispara con `update of fecha_pedido`, asi que ahi no alcanzaba a pisar.
--
-- Esto ademas mantenia vivo el bug de zona horaria en los INSERT: `created_at`
-- es timestamptz y su `::date` sale en UTC, asi que un pedido de las 19:00 de
-- CDMX vencia un dia tarde.
-- ============================================================

begin;

-- ── 0. Que quede registro de lo que se tira ─────────────────
--
-- La fuente de `set_fecha_vencimiento()` YA esta respaldada: textual en
-- docs/SCHEMA_NOTES.md y comentada en el archivo _down de esta migracion.
--
-- El print se queda igual. Es redundante a proposito: si alguien corre esto
-- en otra base donde la funcion sea distinta a la que respaldamos, la salida
-- es lo unico que lo va a mostrar.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_fecha_vencimiento';

  if v_def is null then
    raise notice 'set_fecha_vencimiento() no existe; nada que respaldar.';
  else
    raise notice E'Fuente de la funcion que se va a tirar (guardala):\n%', v_def;
  end if;
end $$;


-- ── 1. El trigger duplicado ─────────────────────────────────

drop trigger if exists trg_fecha_vencimiento on public.pedidos;


-- ── 2. La funcion, solo si ya nadie la usa ──────────────────
--
-- Se revisa DESPUES de tirar el trigger: a estas alturas no deberia quedar
-- ningun trigger apuntandole, en pedidos ni en ninguna otra tabla. Si queda
-- alguno, la migracion aborta en vez de romperlo.

do $$
declare
  v_usos  int;
  v_lista text;
begin
  select count(*),
         string_agg(format('%s.%s -> %s', tn.nspname, tc.relname, t.tgname), ', ')
    into v_usos, v_lista
  from pg_trigger t
  join pg_class     tc on tc.oid = t.tgrelid
  join pg_namespace tn on tn.oid = tc.relnamespace
  join pg_proc      p  on p.oid  = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and pn.nspname = 'public'
    and p.proname  = 'set_fecha_vencimiento';

  if v_usos > 0 then
    raise exception using
      message = format('set_fecha_vencimiento() todavia la usan %s trigger(s): %s', v_usos, v_lista),
      hint    = 'Abortando sin tirar la funcion. Revisa esos triggers antes de volver a correr esta migracion.';
  end if;

  -- Sin CASCADE a proposito: si algo mas dependiera de ella (una vista, otra
  -- funcion), el RESTRICT por default hace fallar el drop en vez de
  -- arrastrarse ese objeto por delante.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_fecha_vencimiento'
  ) then
    drop function public.set_fecha_vencimiento();
    raise notice 'set_fecha_vencimiento() tirada.';
  else
    raise notice 'set_fecha_vencimiento() ya no existia.';
  end if;
end $$;


-- ── 3. Guard: un solo trigger en pedidos ────────────────────
--
-- El punto de la migracion. Si queda cualquier otro, aborta: dos triggers
-- BEFORE escribiendo la misma columna es un bug que no se ve hasta que
-- alguien captura una fecha retroactiva.

do $$
declare
  v_lista text;
  v_n     int;
begin
  select count(*), string_agg(format('%s -> %s()', t.tgname, p.proname), ', ' order by t.tgname)
    into v_n, v_lista
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc      p on p.oid = t.tgfoid
  where n.nspname = 'public'
    and c.relname = 'pedidos'
    and not t.tgisinternal;

  if v_n <> 1 or v_lista is distinct from 'trg_calc_fecha_vencimiento -> calc_fecha_vencimiento()' then
    raise exception using
      message = format('public.pedidos quedo con %s trigger(s): %s', v_n, coalesce(v_lista, 'ninguno')),
      hint    = 'Se esperaba solo trg_calc_fecha_vencimiento -> calc_fecha_vencimiento(). Abortando.';
  end if;

  raise notice 'public.pedidos quedo con un solo trigger: %', v_lista;
end $$;

commit;
