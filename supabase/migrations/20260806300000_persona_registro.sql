-- ============================================================
-- Campos de persona fisica/moral en profiles (ya aplicado)
-- ============================================================

alter table public.profiles
  add column if not exists tipo_persona_registro text
    check (tipo_persona_registro in ('fisica', 'moral'));

alter table public.profiles add column if not exists nombre_pila text;
alter table public.profiles add column if not exists apellido_paterno text;
alter table public.profiles add column if not exists apellido_materno text;
alter table public.profiles add column if not exists contacto_nombre text;

-- Grants para authenticated (el cliente puede editarlos)
grant update (tipo_persona_registro, nombre_pila, apellido_paterno, apellido_materno, contacto_nombre)
  on public.profiles to authenticated;
