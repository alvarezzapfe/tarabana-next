-- ============================================================
-- Pagos, cobranza y app_config (ya aplicado en producción)
-- ============================================================

-- ── Tabla de pagos ──────────────────────────────────────────
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  monto numeric(12,2) not null check (monto > 0),
  metodo text,
  referencia text,
  fecha_pago timestamptz not null default now(),
  notas text,
  registrado_por uuid references auth.users(id),
  cancelado_at timestamptz,
  cancelado_por uuid references auth.users(id),
  cancelado_motivo text,
  created_at timestamptz not null default now()
);

alter table public.pagos enable row level security;

create policy "pagos_staff_read" on public.pagos
  for select to authenticated using (public.is_staff());
create policy "pagos_admin_write" on public.pagos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_pagos_pedido on public.pagos(pedido_id);
create index if not exists idx_pagos_fecha on public.pagos(fecha_pago desc);

-- ── Condiciones de pago en pedidos ──────────────────────────
alter table public.pedidos
  add column if not exists condiciones_pago text
    default 'contado'
    check (condiciones_pago in ('contado', '15_dias', '30_dias'));

alter table public.pedidos
  add column if not exists fecha_vencimiento timestamptz;

-- Trigger para calcular fecha_vencimiento automáticamente
create or replace function public.calc_fecha_vencimiento()
returns trigger language plpgsql as $$
begin
  if NEW.condiciones_pago = 'contado' then
    NEW.fecha_vencimiento := NEW.created_at;
  elsif NEW.condiciones_pago = '15_dias' then
    NEW.fecha_vencimiento := NEW.created_at + interval '15 days';
  elsif NEW.condiciones_pago = '30_dias' then
    NEW.fecha_vencimiento := NEW.created_at + interval '30 days';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_calc_fecha_vencimiento on public.pedidos;
create trigger trg_calc_fecha_vencimiento
  before insert or update of condiciones_pago on public.pedidos
  for each row execute function public.calc_fecha_vencimiento();

-- ── Vista de saldos ─────────────────────────────────────────
create or replace view public.pedidos_saldo as
select
  p.id,
  p.cliente_id,
  p.total,
  p.status,
  p.condiciones_pago,
  p.fecha_vencimiento,
  p.created_at,
  coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0) as pagado,
  p.total - coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0) as saldo,
  case
    when p.total - coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0) <= 0 then 'pagado'
    when p.fecha_vencimiento < now() then 'vencido'
    when coalesce(sum(pg.monto) filter (where pg.cancelado_at is null), 0) > 0 then 'parcial'
    else 'pendiente'
  end as estado_cobro,
  greatest(0, extract(day from now() - p.fecha_vencimiento))::int as dias_vencido
from public.pedidos p
left join public.pagos pg on pg.pedido_id = p.id
where p.status != 'cancelado'
group by p.id;

-- ── app_config ──────────────────────────────────────────────
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "config_staff_read" on public.app_config
  for select to authenticated using (public.is_staff());
create policy "config_super_write" on public.app_config
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Initial config
insert into public.app_config (key, value) values
  ('branding', '{"color_primary": "#E8531D", "sidebar_bg": "#EAF3DE", "sidebar_text": "#27500A"}'::jsonb),
  ('negocio', '{"dias_credito_default": 30, "dias_alerta_vencido": 7, "moneda": "MXN"}'::jsonb)
on conflict (key) do nothing;
