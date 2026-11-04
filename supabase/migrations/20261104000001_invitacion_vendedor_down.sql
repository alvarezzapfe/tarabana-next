-- ROLLBACK

begin;

drop index if exists public.invitaciones_vendedor_id_idx;
alter table public.invitaciones drop column if exists vendedor_id;

commit;
