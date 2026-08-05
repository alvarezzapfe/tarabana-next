-- ============================================================
-- Direccion estructurada + codigos postales + envio (ya aplicado)
-- ============================================================

-- ── Columnas de direccion en profiles ───────────────────────
alter table public.profiles add column if not exists calle text;
alter table public.profiles add column if not exists num_ext text;
alter table public.profiles add column if not exists num_int text;
alter table public.profiles add column if not exists colonia text;
alter table public.profiles add column if not exists municipio text;
alter table public.profiles add column if not exists estado text;
alter table public.profiles add column if not exists referencias text;

-- Agregar a grants de columna para authenticated
grant update (calle, num_ext, num_int, colonia, municipio, estado, referencias)
  on public.profiles to authenticated;

-- ── Catalogo de codigos postales (SEPOMEX) ──────────────────
create table if not exists public.codigos_postales (
  id serial primary key,
  cp text not null,
  colonia text not null,
  municipio text not null,
  estado text not null,
  ciudad text
);

alter table public.codigos_postales enable row level security;

-- Lectura publica (catalogo), escritura solo service_role
create policy "cp_read" on public.codigos_postales
  for select to anon, authenticated using (true);

create index if not exists idx_cp_cp on public.codigos_postales(cp);

-- ── Envio en pedidos ────────────────────────────────────────
alter table public.pedidos add column if not exists costo_envio numeric(12,2) default 0;
alter table public.pedidos add column if not exists paqueteria text;
alter table public.pedidos add column if not exists guia_envio text;
alter table public.pedidos add column if not exists envio_cotizado_at timestamptz;
