-- ============================================================
-- Tracking de invitacion de clientes al portal (ya aplicado)
-- ============================================================

alter table public.profiles
  add column if not exists invitacion_enviada_at timestamptz;

alter table public.profiles
  add column if not exists cuenta_activada_at timestamptz;

-- No se agregan a los grants de columna para authenticated:
-- solo service_role los escribe (desde el helper y el update-password handler)
