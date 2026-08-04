-- ============================================================
-- RPC atómica para aplicar pagos (ya aplicado en producción)
-- ============================================================

create or replace function public.aplicar_pago(
  p_cliente_id uuid,
  p_metodo text,
  p_referencia text,
  p_fecha_pago date,
  p_aplicaciones jsonb,   -- [{"pedido_id":"...","monto":123.45}, ...]
  p_registrado_por uuid
) returns void language plpgsql security definer
set search_path = public as $$
declare
  a jsonb;
  v_saldo numeric;
begin
  for a in select * from jsonb_array_elements(p_aplicaciones) loop
    select saldo into v_saldo from pedidos_saldo
    where id = (a->>'pedido_id')::uuid;

    if v_saldo is null then
      raise exception 'Pedido no encontrado: %', a->>'pedido_id';
    end if;
    if (a->>'monto')::numeric > v_saldo then
      raise exception 'El monto excede el saldo del pedido %', a->>'pedido_id';
    end if;

    insert into pagos (pedido_id, monto, metodo, referencia, fecha_pago, registrado_por)
    values ((a->>'pedido_id')::uuid, (a->>'monto')::numeric,
            p_metodo, p_referencia, p_fecha_pago, p_registrado_por);
  end loop;
end $$;

-- Solo service_role llama esta función (desde el route handler que ya validó canWrite)
revoke execute on function public.aplicar_pago from public, anon, authenticated;
