-- ============================================================
-- nivel_precio en profiles (ya aplicado en producción)
-- ============================================================

-- Columna con check constraint
alter table public.profiles
  add column if not exists nivel_precio text
  default 'publico'
  check (nivel_precio in ('publico', 'taproom', 'distribuidor'));

-- Backfill desde tipo_consumidor
update public.profiles
  set nivel_precio = 'taproom'
  where tipo_consumidor in ('tiene_tap', 'tiene_bar')
    and (nivel_precio is null or nivel_precio = 'publico');

-- NO se agrega a los grants de columna para authenticated.
-- Solo service_role puede modificar nivel_precio.
-- Ver docs/RLS.md para justificación.
