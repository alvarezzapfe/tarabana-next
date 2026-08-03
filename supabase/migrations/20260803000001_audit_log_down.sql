-- ============================================================
-- ROLLBACK — Auditoría + last_seen_at
-- ============================================================

drop policy if exists "audit_log_super_read" on public.audit_log;
drop index if exists idx_audit_log_actor;
drop index if exists idx_audit_log_created;
drop index if exists idx_audit_log_accion;
drop table if exists public.audit_log;

alter table public.profiles drop column if exists last_seen_at;
