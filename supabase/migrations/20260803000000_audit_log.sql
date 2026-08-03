-- ============================================================
-- Auditoría + last_seen_at (ya aplicado en producción)
-- ============================================================

-- ── audit_log ───────────────────────────────────────────────
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_email text,
  actor_role text,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb,
  ip text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Solo super_admin puede leer, nadie inserta vía RLS (solo service_role)
create policy "audit_log_super_read" on public.audit_log
  for select to authenticated using (public.is_super_admin());

-- Índices para queries de la bitácora
create index if not exists idx_audit_log_actor on public.audit_log(actor_id);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);
create index if not exists idx_audit_log_accion on public.audit_log(accion);

-- ── last_seen_at en profiles ────────────────────────────────
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Permitir que service_role actualice last_seen_at (ya tiene bypass)
-- Pero authenticated necesita que esté en los grants de columna
-- NO lo agregamos a los grants — solo service_role lo escribe
