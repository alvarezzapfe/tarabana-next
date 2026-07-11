-- ============================================================
-- Tarabaña · Esquema completo para Supabase (PostgreSQL)
-- Generado 2026-07-11 contra el código real del repo
-- ============================================================
-- ORDEN: tipos → tablas sin FKs → tablas con FKs → storage → seed

-- ── 0. Extensiones ──────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── 1. PROFILES ─────────────────────────────────────────────
-- Enlazada 1:1 con auth.users.  El trigger handle_new_user la
-- llena automáticamente al hacer signUp (ver sección triggers).
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  full_name           text,
  role                text not null default 'comprador',
    -- valores: super_admin | admin | ventas | produccion | contabilidad | comprador
  active              boolean not null default true,
  puntos              integer not null default 0,
  phone               text,                       -- formato +52XXXXXXXXXX
  tipo_consumidor     text default 'ocasional',
    -- valores: ocasional | tiene_tap | tiene_bar | restaurante
  marca_negocio       text,
  razon_social        text,
  rfc                 text,
  uso_cfdi            text,
  requiere_factura    boolean not null default false,
  direccion_entrega   text,
  ciudad              text,
  cp                  text,
  notas               text,
  onboarding_completo boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── 2. PRODUCTOS ────────────────────────────────────────────
create table productos (
  id                          uuid primary key default gen_random_uuid(),
  nombre                      text not null,
  estilo                      text not null,
  abv                         numeric,                  -- nullable
  ibu                         integer,                  -- nullable
  descripcion                 text,
  descripcion_larga           text,
  imagen_url                  text,                     -- URL de Supabase Storage
  activo                      boolean not null default true,

  -- Precios legacy (fallback para caja12)
  precio_publico              numeric not null default 0,
  precio_taproom              numeric not null default 0,

  -- Precios por formato — nullable (el código escribe null si vacío)
  precio_caja12_publico       numeric,
  precio_caja12_taproom       numeric,
  precio_caja24_publico       numeric,
  precio_caja24_taproom       numeric,
  precio_barril_pet_publico   numeric,       -- 20 L PET
  precio_barril_pet_taproom   numeric,
  precio_barril_acero_publico numeric,       -- 20 L Acero
  precio_barril_acero_taproom numeric,
  precio_barril10_pet_publico  numeric,      -- 10 L PET
  precio_barril10_pet_taproom  numeric,
  precio_barril10_acero_publico numeric,     -- 10 L Acero
  precio_barril10_acero_taproom numeric,

  -- Stock por formato — el código escribe || 0 así que NOT NULL default 0
  stock_caja12                integer not null default 0,
  stock_caja24                integer not null default 0,
  stock_barril_pet            integer not null default 0,
  stock_barril_acero          integer not null default 0,
  stock_barril10_pet          integer not null default 0,
  stock_barril10_acero        integer not null default 0,

  -- Campos calculados (el código los escribe explícitamente en insert/update)
  stock_latas                 integer not null default 0,   -- caja12*12 + caja24*24
  stock_barriles              integer not null default 0,   -- sum de los 4 barril_*

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ── 3. VENDEDORES ───────────────────────────────────────────
create table vendedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  email         text,
  telefono      text,
  tipo          text not null default 'externo',
    -- valores: interno | externo | distribuidor
  comision_pct  numeric not null default 10,     -- 0-100
  notas         text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 4. PEDIDOS ──────────────────────────────────────────────
create table pedidos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references profiles(id) on delete cascade,
  vendedor_id     uuid references vendedores(id) on delete set null,
  tipo_precio     text not null default 'minorista',
    -- valores: mayorista | minorista
  total           numeric not null default 0,
  status          text not null default 'pendiente',
    -- valores: pendiente | confirmado | enviado | entregado | cancelado
  pagado          boolean not null default false,
  notas           text,
  notas_internas  text,             -- notas visibles solo para admin
  fecha_entrega   timestamptz,      -- fecha programada de entrega
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 5. PEDIDO_ITEMS ─────────────────────────────────────────
-- El commit f65c915 agregó "unidad" al insert del portal.
-- El admin insert (route.ts) la parsea pero no la guarda → bug menor,
-- pero la columna SÍ debe existir porque el portal la escribe.
-- "subtotal" también se escribe desde el portal.
create table pedido_items (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete cascade,
  unidad           text,            -- ej. "caja12", "barril_pet", etc.  nullable por compat con admin
  cantidad         integer not null default 1,
  precio_unitario  numeric not null default 0,
  subtotal         numeric,         -- cantidad * precio_unitario (escrito por portal, nullable por admin)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 6. COMISIONES ───────────────────────────────────────────
create table comisiones (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  vendedor_id      uuid not null references vendedores(id) on delete cascade,
  monto_pedido     numeric not null default 0,
  porcentaje       numeric not null default 0,
  monto_comision   numeric not null default 0,
  pagada           boolean not null default false,
  fecha_pago       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 7. PUNTOS DE VENTA ──────────────────────────────────────
create table puntos_venta (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  tipo           text not null default 'bar',
    -- valores: bar | restaurante | tienda | evento
  direccion      text not null,
  ciudad         text not null,
  zona           text,
  estado         text not null,
  lat            numeric,
  lng            numeric,
  imagen_url     text,
  telefono       text,
  instagram      text,
  horario        text,
  notas          text,
  activo         boolean not null default true,
  fecha_inicio   date,
  fecha_fin      date,
  orden          integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 8. INVITACIONES ─────────────────────────────────────────
create table invitaciones (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  full_name   text not null,
  role        text not null,
    -- valores: admin | ventas | produccion | contabilidad
  token       text not null unique default gen_random_uuid()::text,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 9. MEDALLERO ────────────────────────────────────────────
create table medallero (
  id           uuid primary key default gen_random_uuid(),
  competencia  text not null,
  cerveza      text not null,
  estilo       text,
  abv          numeric,
  ibu          integer,
  medalla      text not null,
    -- valores: oro | plata | bronce
  año          integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── 10. LOTES (producción) ──────────────────────────────────
create table lotes (
  id                   uuid primary key default gen_random_uuid(),
  nombre_lote          text not null,
  producto_id          uuid not null references productos(id) on delete cascade,
  volumen_litros       numeric not null default 0,
  latas_producidas     integer not null default 0,
  barriles_producidos  integer not null default 0,
  fecha_produccion     date not null default current_date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 11. TAPROOM CONFIG ──────────────────────────────────────
-- Tabla single-row con la configuración del taproom.
create table taproom_config (
  id                uuid primary key default gen_random_uuid(),
  horarios          jsonb not null default '[]'::jsonb,
    -- Array de { dia, abierto, apertura, cierre }
  mensaje_especial  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Insertar fila default para que el update del código funcione
insert into taproom_config (horarios) values ('[
  {"dia":"Lunes","abierto":false,"apertura":"","cierre":""},
  {"dia":"Martes","abierto":true,"apertura":"13:00","cierre":"23:00"},
  {"dia":"Miércoles","abierto":true,"apertura":"13:00","cierre":"23:00"},
  {"dia":"Jueves","abierto":true,"apertura":"13:00","cierre":"23:00"},
  {"dia":"Viernes","abierto":true,"apertura":"13:00","cierre":"23:00"},
  {"dia":"Sábado","abierto":true,"apertura":"13:00","cierre":"23:00"},
  {"dia":"Domingo","abierto":false,"apertura":"","cierre":""}
]'::jsonb);


-- ============================================================
-- TRIGGER: handle_new_user
-- ============================================================
-- VEREDICTO: SÍ se necesita.
--
-- Evidencia del código:
--   • Portal signUp (app/portal/page.tsx:34) → solo llama
--     supabase.auth.signUp() con user_metadata. NO inserta en profiles.
--   • Invitación (app/api/invitaciones/activar/route.ts:28) → hace
--     .update() en profiles, NO .insert().  Asume que la fila ya existe.
--   • Admin crear cliente (app/api/admin/clientes/crear/route.ts:24) →
--     hace .update() en profiles, NO .insert().  Asume que la fila ya existe.
--
-- Conclusión: los tres flujos dependen de que la fila en profiles ya
-- exista cuando hacen .update(). Solo un trigger on auth.users INSERT
-- puede crearla. SIN ESTE TRIGGER, los updates fallan silenciosamente.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'comprador')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase (schema storage):

insert into storage.buckets (id, name, public) values ('productos', 'productos', true);
insert into storage.buckets (id, name, public) values ('puntos-venta-imgs', 'puntos-venta-imgs', true);

-- Policies: cualquiera puede leer (público), solo authenticated puede subir
create policy "Public read productos" on storage.objects
  for select using (bucket_id = 'productos');
create policy "Auth upload productos" on storage.objects
  for insert with check (bucket_id = 'productos' and auth.role() = 'authenticated');
create policy "Auth update productos" on storage.objects
  for update using (bucket_id = 'productos' and auth.role() = 'authenticated');
create policy "Auth delete productos" on storage.objects
  for delete using (bucket_id = 'productos' and auth.role() = 'authenticated');

create policy "Public read puntos-venta-imgs" on storage.objects
  for select using (bucket_id = 'puntos-venta-imgs');
create policy "Auth upload puntos-venta-imgs" on storage.objects
  for insert with check (bucket_id = 'puntos-venta-imgs' and auth.role() = 'authenticated');
create policy "Auth update puntos-venta-imgs" on storage.objects
  for update using (bucket_id = 'puntos-venta-imgs' and auth.role() = 'authenticated');
create policy "Auth delete puntos-venta-imgs" on storage.objects
  for delete using (bucket_id = 'puntos-venta-imgs' and auth.role() = 'authenticated');


-- ============================================================
-- ÍNDICES
-- ============================================================
create index idx_pedidos_cliente    on pedidos(cliente_id);
create index idx_pedidos_vendedor   on pedidos(vendedor_id);
create index idx_pedidos_status     on pedidos(status);
create index idx_pedido_items_pedido on pedido_items(pedido_id);
create index idx_comisiones_vendedor on comisiones(vendedor_id);
create index idx_comisiones_pedido   on comisiones(pedido_id);
create index idx_productos_activo    on productos(activo);
create index idx_lotes_producto      on lotes(producto_id);
create index idx_invitaciones_token  on invitaciones(token);
create index idx_puntos_venta_activo on puntos_venta(activo, orden);


-- ============================================================
-- NOTAS FINALES
-- ============================================================
-- 1. RLS: El proyecto actual NO usa RLS — todo el control de acceso
--    es a nivel de aplicación (API routes verifican profile.role).
--    Si deseas habilitar RLS, hazlo después de verificar que el
--    service_role_key se use para las operaciones admin.
--
-- 2. Super admin seed: después de correr este SQL, crea el primer
--    usuario manualmente en Authentication → Users, y luego:
--      UPDATE profiles SET role = 'super_admin' WHERE email = 'tu@email.com';
--
-- 3. El FK de pedidos usa el alias !pedidos_cliente_id_fkey en los
--    selects de PostgREST. PostgreSQL genera ese nombre automáticamente
--    a partir del constraint name. Si renombras el constraint, rompes
--    los .select() del código.
