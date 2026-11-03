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

## La vista `pedidos_saldo` viva NO es la del archivo de migración

Verificado contra producción con el service client (solo lectura) el
2026-11-02, sobre las 15 filas de la vista.

`supabase/migrations/20260803200000_pagos_cobranza.sql:61` define
`saldo = total - pagado`. **En producción no es así.** La definición viva es:

```
saldo = total - descuento + costo_envio - pagado
```

donde `descuento` sale de `pedidos.descuento_tipo` / `descuento_valor`
(`'porcentaje'` aplica sobre `total`, `'monto'` resta directo). La hipótesis
explica **15/15 filas**, incluyendo las 4 con descuento porcentual
(22.45 %, 9 %, 24.32 %, 10 %) y la que trae `costo_envio` de 100.

Esto quedó así por la migración `20260806100000_descuento_pedidos.sql`, que
anota "pedidos_saldo ya calcula descuento_monto y lo resta" pero no reescribe
el archivo original.

### Consecuencia para cualquier métrica de dinero

- **`total` es el importe BRUTO**, antes de descuento y de envío.
- **El importe realmente facturado es `pagado + saldo`.**

Con los datos actuales la diferencia no es trivial: la suma de `total` da
$48,569 y la de `pagado + saldo` da $45,916.33. Usar `total` sobreestima lo
facturado por el monto de los descuentos y no cuadra con los KPIs de Cobrado
ni de Por cobrar.

Los helpers de `src/lib/metricas.ts` ya trabajan sobre la base neta
(`netoDe`, `netoTotal`, `serieFacturada`); usar esos y no volver a sumar
`total` a mano.

### Estructura viva de `pedidos_saldo` (16 columnas)

Nombres y orden obtenidos del spec OpenAPI de PostgREST (`GET /rest/v1/`,
solo lectura). El archivo de migración declara 11; producción tiene 16:

```
 1 id                 uuid
 2 cliente_id         uuid
 3 total              numeric      <- BRUTO
 4 costo_envio        numeric      } no estan
 5 status             text            en el
 6 condiciones_pago   text            archivo
 7 fecha_vencimiento  date         <- date, no timestamptz
 8 created_at         timestamptz
 9 descuento_tipo     text         } no estan
10 descuento_valor    numeric         en el
11 descuento_monto    numeric         archivo
12 total_con_envio    numeric      }
13 pagado             numeric      <- suma de pagos, NO boolean
14 saldo              numeric      <- NETO menos pagos
15 estado_cobro       text
16 dias_vencido       integer
```

Definición confirmada con `pg_get_viewdef('public.pedidos_saldo')` el
2026-11-03. Está escrita literal en
`supabase/migrations/20261103000000_pedidos_saldo_definicion_real.sql`, que
documenta el estado actual y no cambia nada. **Esa migración es la referencia;
lo de abajo es solo el resumen.**

```
descuento_monto  = CASE descuento_tipo
                     WHEN 'porcentaje' THEN round(total * coalesce(descuento_valor,0) / 100, 2)
                     WHEN 'monto'      THEN coalesce(descuento_valor,0)
                     ELSE 0 END
total_con_envio  = total - descuento_monto + coalesce(costo_envio,0)
pagado           = coalesce(sum(pagos.monto) filter (where cancelado_at is null), 0)
saldo            = total_con_envio - pagado
estado_cobro     = CASE WHEN saldo <= 0 THEN 'pagado'
                        WHEN pagado > 0 THEN 'parcial'      -- ANTES de vencido
                        WHEN fecha_vencimiento is not null
                             and fecha_vencimiento < CURRENT_DATE THEN 'vencido'
                        ELSE 'pendiente' END
dias_vencido     = CASE WHEN fecha_vencimiento is null THEN 0
                        ELSE greatest(0, CURRENT_DATE - fecha_vencimiento) END
WHERE status <> 'cancelado'
GROUP BY p.id
security_invoker = on
```

Tres detalles que importan y que no se ven en los datos:

* El descuento porcentual **se redondea a 2 decimales**. Reimplementarlo sin
  el `round` da diferencias de centavos contra lo que cobra la vista.
* El corte de vencimiento es **`CURRENT_DATE`**, no `now()`, y
  `pedidos.fecha_vencimiento` es **`date`** (el archivo original la declara
  `timestamptz`). Por eso `CURRENT_DATE - fecha_vencimiento` ya da días
  enteros, sin `extract`.
* El orden de las ramas de `estado_cobro`: producción evalúa `parcial` antes
  que `vencido`, el archivo viejo al revés. El pedido B1465D (saldo 100,
  pagado 1400, 90 días vencido) sale `parcial` en producción y saldría
  `vencido` con la lógica del archivo.

`security_invoker = on` significa que las policies RLS de `pedidos` y `pagos`
se evalúan con el rol que consulta, no con el dueño de la vista. Los grants
son los default de Supabase (anon, authenticated, postgres, service_role).
Conceder `ALL` no habilita escritura: la vista tiene `GROUP BY`, así que no es
auto-updatable y un insert/update/delete falla igual.
