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

## Columnas en tarabana_schema.sql que NO existen en produccion

Verificado contra produccion con el service client (solo lectura) el 2026-11-02.

### productos.stock_barriles — NO EXISTE
```
column productos.stock_barriles does not exist
```
Ya fue tirada (consistente con el hotfix 42d4380, "elimina refs a columnas
legacy tiradas de la DB"). No hay nada que dropear: lo unico pendiente es que
`tarabana_schema.sql` la sigue listando. Queda fuera de cualquier calculo —
era la suma derivada de los cuatro `stock_barril*`, asi que sumarla
duplicaria el volumen.

### productos.stock_latas — el comentario de tarabana_schema.sql esta MAL
Ese archivo la documenta como `-- caja12*12 + caja24*24`, o sea derivada.
**No lo es.** En produccion es un contador independiente de latas sueltas, que
es como la trata el codigo actual (`InventarioClient.tsx`: `label: 'Sueltas'`,
y la suma `s + c12 * 12 + c24 * 24`, donde `s` entra aparte).

Comprobado sobre las 10 filas de `productos`: `stock_latas` coincide con
`caja12*12 + caja24*24` en solo 3, y son justamente las tres que tienen todo
en cero (0 == 0). En las 7 filas con datos reales no coincide.

**Tratarla como derivada y omitirla subestima el stock; sumarla ademas de un
total ya derivado lo duplica.** Los factores de conversion viven en
`src/lib/unidades.ts`; usar esos y no reimplementarlos.
