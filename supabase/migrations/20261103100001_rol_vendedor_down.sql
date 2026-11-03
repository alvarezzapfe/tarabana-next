-- ROLLBACK del rol vendedor

begin;

drop policy if exists "pedidos_vendedor_read"        on public.pedidos;
drop policy if exists "pedidos_vendedor_insert"      on public.pedidos;
drop policy if exists "pedido_items_vendedor_read"   on public.pedido_items;
drop policy if exists "pedido_items_vendedor_insert" on public.pedido_items;
drop policy if exists "profiles_vendedor_read"       on public.profiles;

commit;

drop function if exists public.mi_vendedor_id();
drop function if exists public.is_vendedor();

drop index if exists public.profiles_vendedor_id_idx;
drop index if exists public.pedidos_vendedor_id_idx;
drop index if exists public.vendedores_profile_id_key;

-- Las columnas van al final: tirarlas pierde la asignacion de clientes y la
-- liga de los logins. Si quedo algun usuario con role = 'vendedor', al
-- eliminarlas se queda sin forma de ver nada; hay que reasignarle rol antes.
alter table public.profiles   drop column if exists vendedor_id;
alter table public.vendedores drop column if exists profile_id;
