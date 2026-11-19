-- ROLLBACK de 20261118000000_produccion.sql
--
-- Devuelve `lotes` a sus 9 columnas originales, tira el modulo completo y
-- restaura las policies viejas (`lotes_read` / `lotes_write` con
-- is_staff()/is_admin()).
--
-- ── Que ABORTA este rollback ──
--
-- Dos cosas, y las dos por la misma razon: bajar esto con datos adentro no
-- es un rollback, es un borrado silencioso.
--
--   1. Lotes con folio. Cada uno trae etapa, OG/FG, lecturas, envasado y su
--      log de eventos. Las columnas legacy que volverian (nombre_lote,
--      volumen_litros, latas_producidas...) no pueden recibir nada de eso:
--      el folio, la bitacora y la merma se irian sin dejar rastro.
--
--   2. Movimientos de inventario con lote_id. Esos son las entradas que YA
--      se sumaron a productos.stock_*. Tirar la tabla borra la unica
--      explicacion de por que el stock subio, y deja las existencias sin
--      respaldo. El stock NO se revierte aqui: revertirlo seria inventar
--      salidas que nunca pasaron.
--
-- Los guards van en el MISMO bloque que los drops: el SQL Editor de Supabase
-- confirma statement por statement y un `raise` suelto arriba no impide que
-- lo de abajo corra (ver docs/SCHEMA_NOTES.md).
--
-- `productos.folio_prefijo` se queda. Es un dato que el dueno capturo a mano
-- y no le estorba a nadie; tirarlo obligaria a recapturar los 11 prefijos si
-- el modulo vuelve a subir.

begin;

do $rollback$
declare
  v_lotes int;
  v_movs  int;
begin
  -- ── Guards ──
  --
  -- Condicionados a que la columna / la tabla EXISTAN: sin eso, re-correr
  -- este rollback despues de aplicarlo revienta con "column folio does not
  -- exist" en vez de no hacer nada, que es lo que corresponde.
  -- CUALQUIER fila, no solo las que tienen folio. Dos razones:
  --
  --   1. Cada lote trae etapa, OG/FG, lecturas, envasado y su log de
  --      eventos, y las columnas legacy que vuelven no pueden recibir nada de
  --      eso: se irian sin dejar rastro.
  --   2. Mas abajo esto hace `add column nombre_lote text not null` SIN
  --      default, que falla con la tabla no vacia. Un guard que solo mirara
  --      `folio is not null` dejaria pasar una fila sin folio y el rollback
  --      reventaria a medias, con las columnas nuevas ya tiradas.
  select count(*) into v_lotes from public.lotes;
  if v_lotes > 0 then
    raise exception
      'ABORTADO: public.lotes tiene % fila(s). Bajar esto borraria sus etapas, lecturas, envasado y eventos sin devolverlos a ninguna columna. Exportar antes y vaciar public.lotes a mano si de verdad se quiere bajar.',
      v_lotes;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inventario_movimientos'
  ) then
    execute 'select count(*) from public.inventario_movimientos where lote_id is not null' into v_movs;
    if v_movs > 0 then
      raise exception
        'ABORTADO: hay % movimiento(s) de inventario con lote_id. Son entradas que ya se sumaron a productos.stock_*; borrarlas deja el stock sin explicacion. El stock no se revierte: revisar a mano.',
        v_movs;
    end if;
  end if;

  -- ── Triggers ──
  drop trigger if exists lote_folio_trg      on public.lotes;
  drop trigger if exists lotes_updated_at_trg on public.lotes;
  drop trigger if exists tanques_updated_at_trg on public.tanques;

  -- ── Vista ──
  drop view if exists public.lotes_vista;

  -- ── Funciones del modulo ──
  drop function if exists public.avanzar_lote(uuid, public.lote_etapa, uuid, text);
  drop function if exists public.aplicar_envasado_a_inventario(uuid, uuid);
  drop function if exists public.lote_etapa_orden(public.lote_etapa);
  drop function if exists public.lote_asigna_folio();

  -- `toca_updated_at` es generica y la migracion la introdujo, pero ya no
  -- tiene triggers colgando. Se tira al final por si algo mas la adopto:
  -- con CASCADE se llevaria triggers ajenos, asi que va sin cascade y si
  -- alguien mas la usa, el drop falla y eso es la senal correcta.
  drop function if exists public.toca_updated_at();

  -- ── Tablas del modulo (orden por FK) ──
  drop table if exists public.inventario_movimientos;
  drop table if exists public.lote_eventos;
  drop table if exists public.lote_envasado;
  drop table if exists public.lote_lecturas;
  drop table if exists public.lote_folios;

  -- ── lotes: quitar lo nuevo ──
  -- `abv` es generada: se va con el drop de la columna, no hay que tocar la
  -- expresion. `tanque_id` tiene que irse ANTES de tirar public.tanques.
  alter table public.lotes
    drop column if exists folio,
    drop column if exists folio_prefijo,
    drop column if exists folio_anio,
    drop column if exists folio_consecutivo,
    drop column if exists etapa,
    drop column if exists etapa_desde,
    drop column if exists tanque_id,
    drop column if exists litros_objetivo,
    drop column if exists litros_reales,
    drop column if exists og,
    drop column if exists fg,
    drop column if exists abv,
    drop column if exists levadura_cepa,
    drop column if exists levadura_proveedor,
    drop column if exists levadura_generacion,
    drop column if exists fecha_coccion,
    drop column if exists fecha_envasado,
    drop column if exists fecha_liberado,
    drop column if exists notas,
    drop column if exists deleted_at,
    drop column if exists created_by;

  alter table public.lotes drop constraint if exists lotes_gravedades_chk;
  alter table public.lotes drop constraint if exists lotes_litros_chk;

  drop table if exists public.tanques;

  -- ── Tipos (ya sin columnas que los usen) ──
  drop type if exists public.lote_etapa;
  drop type if exists public.tanque_tipo;

  -- ── lotes: devolver las columnas originales ──
  -- Con la tabla vacia (lo garantiza el guard de arriba) se pueden poner
  -- NOT NULL directo, igual que en tarabana_schema.sql:241.
  alter table public.lotes
    add column if not exists nombre_lote         text    not null,
    add column if not exists volumen_litros      numeric not null default 0,
    add column if not exists latas_producidas    integer not null default 0,
    add column if not exists barriles_producidos integer not null default 0,
    add column if not exists fecha_produccion    date    not null default current_date;
end $rollback$;


-- ── Policies: volver a las de 20260731000000_three_level_roles.sql ──
--
-- Fuera del bloque `do` porque create policy no se puede ejecutar ahi sin
-- EXECUTE dinamico, y a esta altura los guards ya pasaron.

drop policy if exists "lotes_select" on public.lotes;
drop policy if exists "lotes_insert" on public.lotes;
drop policy if exists "lotes_update" on public.lotes;

drop policy if exists "lotes_read"  on public.lotes;
drop policy if exists "lotes_write" on public.lotes;
create policy "lotes_read"  on public.lotes
  for select to authenticated using (public.is_staff());
create policy "lotes_write" on public.lotes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ── Predicados nuevos ──
--
-- Se tiran al final, cuando ya no quedan policies que los llamen. Si algo
-- fuera de este modulo los adopto, el drop falla y hay que mirarlo: eso es
-- preferible a un CASCADE que se lleve policies ajenas sin avisar.

drop function if exists public.can_manage_inventory();
drop function if exists public.is_staff_sin_ventas();
drop function if exists public.can_manage_as_admin();

commit;
