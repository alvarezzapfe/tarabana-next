-- ROLLBACK — aplicar_pago RPC
drop function if exists public.aplicar_pago(uuid, text, text, date, jsonb, uuid);
