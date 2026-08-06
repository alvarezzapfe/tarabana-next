-- ============================================================
-- Descuento en pedidos (ya aplicado en produccion)
-- ============================================================

alter table public.pedidos
  add column if not exists descuento_tipo text
    check (descuento_tipo in ('porcentaje', 'monto'));

alter table public.pedidos
  add column if not exists descuento_valor numeric(12,2);

alter table public.pedidos
  add column if not exists descuento_motivo text;

-- pedidos_saldo ya calcula descuento_monto y lo resta:
-- saldo = total - descuento + envio - pagado
-- El total en la tabla sigue siendo el subtotal de productos.
