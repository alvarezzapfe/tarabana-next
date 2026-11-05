-- ROLLBACK del trigger duplicado
--
-- NO recrea `set_fecha_vencimiento()`, y no es un olvido.
--
-- Su fuente esta abajo, textual, rescatada con `pg_get_functiondef` antes de
-- tirarla (tambien quedo en docs/SCHEMA_NOTES.md). Va COMENTADA y no
-- ejecutable a proposito: esa funcion es el bug. Dejarla a un solo `psql` de
-- distancia de volver a existir es un pie de banco; que alguien tenga que
-- descomentarla a mano es justo la friccion que corresponde.
--
-- Para volver atras de verdad:
--
--   1. Descomenta el bloque CREATE FUNCTION de abajo y correlo.
--   2. Corre el `create trigger` del final, que valida que exista.
--
-- Y ten claro lo que significa revertir: dos triggers BEFORE escribiendo
-- `fecha_vencimiento`, el no documentado ganando por orden alfabetico, las
-- fechas retroactivas sin efecto y el vencimiento otra vez calculado en UTC.
--
-- ── Fuente original, tal como estaba en produccion ──────────
--
-- CREATE OR REPLACE FUNCTION public.set_fecha_vencimiento()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- begin
--   if new.condiciones_pago = '15_dias' then
--     new.fecha_vencimiento := (new.created_at::date + 15);
--   elsif new.condiciones_pago = '30_dias' then
--     new.fecha_vencimiento := (new.created_at::date + 30);
--   else
--     new.fecha_vencimiento := new.created_at::date;
--   end if;
--   return new;
-- end $function$
--
-- Ahi se ve el bug completo: la base es `new.created_at::date`, que se evalua
-- en UTC. De ahi que una fecha de pedido retroactiva no cambiara nada y que
-- entre las 18:00 y la medianoche de CDMX el vencimiento saliera un dia
-- tarde.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_fecha_vencimiento'
  ) then
    raise exception using
      message = 'public.set_fecha_vencimiento() no existe, asi que no se le puede colgar el trigger.',
      hint    = 'Recrea la funcion con la fuente que imprimio 20261105100000 y vuelve a correr esto.';
  end if;
end $$;

create trigger trg_fecha_vencimiento
  before insert or update of condiciones_pago on public.pedidos
  for each row execute function public.set_fecha_vencimiento();

commit;
