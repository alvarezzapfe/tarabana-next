# Schema Notes

`tarabana_schema.sql` at the repo root is the ORIGINAL schema from project creation.
It does NOT reflect the current production state. The source of truth is Supabase
production. The migration files in `supabase/migrations/` document changes that were
already applied.

## Columns NOT in tarabana_schema.sql but live in production

### productos
- `precio_lata_publico` numeric(10,2) — per-lata price, source of truth for cans
- `precio_lata_taproom` numeric(10,2)
- `descontinuado_at` timestamptz — set when product is deactivated

### profiles
- `nivel_precio` text check ('publico','taproom','distribuidor') default 'publico'
- `last_seen_at` timestamptz
- `invitacion_enviada_at` timestamptz
- `cuenta_activada_at` timestamptz
- `tipo_persona_registro` text check ('fisica','moral')
- `nombre_pila`, `apellido_paterno`, `apellido_materno`, `contacto_nombre` text
- `calle`, `num_ext`, `num_int`, `colonia`, `municipio`, `estado`, `referencias` text
- `cp_fiscal` text

### pedidos
- `condiciones_pago` text check ('contado','15_dias','30_dias')
- `fecha_vencimiento` timestamptz (trigger-calculated)
- `costo_envio` numeric(12,2) default 0
- `paqueteria`, `guia_envio` text
- `envio_cotizado_at` timestamptz
- `descuento_tipo` text check ('porcentaje','monto')
- `descuento_valor` numeric(12,2)
- `descuento_motivo` text

### Tables NOT in tarabana_schema.sql
- `public.pagos` — payment records (soft-delete via cancelado_at)
- `public.audit_log` — action audit trail
- `public.app_config` — global config (branding, negocio)
- `public.codigos_postales` — SEPOMEX postal codes (159k rows)
- `public.estilos` — beer style catalog (26 rows: nombre, familia, orden, activo)

### Views
- `public.pedidos_saldo` — calculates pagado, saldo, estado_cobro, dias_vencido

### Functions
- `public.is_staff()`, `public.is_admin()`, `public.is_super_admin()` — role helpers
- `public.aplicar_pago(...)` — atomic multi-pedido payment application
- `public.calc_fecha_vencimiento()` — trigger for payment terms
