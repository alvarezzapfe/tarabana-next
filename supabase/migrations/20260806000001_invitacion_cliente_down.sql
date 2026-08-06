-- ROLLBACK
alter table public.profiles drop column if exists invitacion_enviada_at;
alter table public.profiles drop column if exists cuenta_activada_at;
