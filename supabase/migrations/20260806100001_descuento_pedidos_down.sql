-- ROLLBACK
alter table public.pedidos drop column if exists descuento_tipo;
alter table public.pedidos drop column if exists descuento_valor;
alter table public.pedidos drop column if exists descuento_motivo;
