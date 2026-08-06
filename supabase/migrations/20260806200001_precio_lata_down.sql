-- ROLLBACK
alter table public.productos drop column if exists precio_lata_publico;
alter table public.productos drop column if exists precio_lata_taproom;
