-- ============================================================
-- Precio por lata como fuente unica (ya aplicado en produccion)
-- ============================================================

alter table public.productos
  add column if not exists precio_lata_publico numeric(10,2);

alter table public.productos
  add column if not exists precio_lata_taproom numeric(10,2);

-- Backfill from existing caja24 prices
update public.productos
  set precio_lata_publico = round(precio_caja24_publico / 24.0, 2)
  where precio_lata_publico is null and precio_caja24_publico is not null;

update public.productos
  set precio_lata_taproom = round(precio_caja24_taproom / 24.0, 2)
  where precio_lata_taproom is null and precio_caja24_taproom is not null;

-- Legacy columns precio_caja12_* and precio_caja24_* are NOT dropped.
-- They are referenced by historical pedido_items.
-- The code no longer reads or writes them.
