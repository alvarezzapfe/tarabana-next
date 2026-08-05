-- ROLLBACK — Direccion + envio
alter table public.profiles drop column if exists calle;
alter table public.profiles drop column if exists num_ext;
alter table public.profiles drop column if exists num_int;
alter table public.profiles drop column if exists colonia;
alter table public.profiles drop column if exists municipio;
alter table public.profiles drop column if exists estado;
alter table public.profiles drop column if exists referencias;

drop policy if exists "cp_read" on public.codigos_postales;
drop table if exists public.codigos_postales;

alter table public.pedidos drop column if exists costo_envio;
alter table public.pedidos drop column if exists paqueteria;
alter table public.pedidos drop column if exists guia_envio;
alter table public.pedidos drop column if exists envio_cotizado_at;
