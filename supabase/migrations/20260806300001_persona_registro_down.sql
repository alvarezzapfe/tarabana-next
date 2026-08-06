-- ROLLBACK
alter table public.profiles drop column if exists tipo_persona_registro;
alter table public.profiles drop column if exists nombre_pila;
alter table public.profiles drop column if exists apellido_paterno;
alter table public.profiles drop column if exists apellido_materno;
alter table public.profiles drop column if exists contacto_nombre;
