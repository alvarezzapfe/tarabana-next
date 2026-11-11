-- ============================================================
-- Revierte 20261110000000_set_pedido_items.sql
-- ============================================================
--
-- Tira la funcion. No hay datos que restaurar: `set_pedido_items` no crea ni
-- migra nada, solo reemplaza partidas cuando alguien la llama. Lo que SI deja
-- de funcionar al tirarla es la pantalla de editar productos de un pedido,
-- que la invoca por RPC; la ruta responderia 404 de PostgREST.

begin;

drop function if exists public.set_pedido_items(uuid, jsonb, numeric);

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_pedido_items'
  ) then
    raise exception using message = 'set_pedido_items sigue ahi. Abortando.';
  end if;

  raise notice 'set_pedido_items eliminada.';
end $$;

commit;
