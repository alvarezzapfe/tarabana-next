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

## `pagos.fecha_pago` es `date` en producción, no `timestamptz`

Verificado contra producción el 2026-11-04 con el spec OpenAPI de PostgREST
(`GET /rest/v1/`, solo lectura): la columna es `date`. El archivo
`supabase/migrations/20260803200000_pagos_cobranza.sql:12` la declara
`timestamptz not null default now()`. Los valores que devuelve la API lo
confirman: `"fecha_pago": "2026-08-07"`, sin hora ni offset.

Es la misma clase de divergencia que la de `pedidos.fecha_vencimiento`
(declarada `timestamptz`, viva como `date`).

**Por qué importa para cualquier agrupación por mes:** siendo `date`, el mes
sale del string y no hay zona horaria de por medio. Pasarla por `Date` es un
error silencioso:

```js
new Date('2026-08-01')            // 2026-07-31T18:00:00 en CDMX (UTC-6)
new Date('2026-08-01').getMonth() // 6 = julio
```

Un pago del día 1 se iría al mes anterior. `src/lib/comisiones.ts` saca el
periodo con `fecha.slice(0, 7)` justamente por esto, y nunca construye un
`Date` a partir de `fecha_pago`.

## Comisiones por tramos marginales (Fase 3)

Tablas nuevas, en `supabase/migrations/20261104100000_comisiones_tramos.sql`:

- **`comision_tramos`** — escalera marginal. `vendedor_id` nullable, donde
  null = esquema global por default. La resolución es **todo o nada**: un
  vendedor con tramos propios ignora los globales, nunca se mezclan.
  Los invariantes del conjunto (arranca en 0, contiguos, a lo más un tramo
  abierto y que sea el último) los impone el constraint trigger diferido
  `trg_validar_comision_tramos`, no un CHECK de fila — ninguna propiedad del
  conjunto cabe en uno. `set_comision_tramos(vendedor_id, jsonb)` reemplaza la
  escalera completa en una transacción; es lo que llama la UI.
- **`comision_cortes`** — snapshot mensual por vendedor. **Que la fila exista
  significa que el mes está cerrado**; el mes abierto se calcula en vivo y no
  se persiste, así que no hay estado 'abierto'. Guarda base, desglose, las dos
  tasas y la escalera usadas, para ser reproducible si después cambian.

### Los precios de la DB traen los impuestos adentro

No hay ninguna columna de impuestos en `pedidos` ni en `pedido_items`;
`calcular-pedido.ts` arma `total = SUM(cantidad * precio_unitario)` y el
documento imprime Subtotal/Descuento/Envío/TOTAL sin renglón de impuestos.
`profiles.requiere_factura` **no cambia el monto**. Lo único explícito del
repo es el catálogo de WhatsApp (`src/lib/whatsappPrompt.ts:130`): "Precios
mayorista, IVA incluido".

Decisión de negocio: los precios traen **IVA 16% e IEPS de cerveza 26.5%**, y
la base de comisión es neta de los dos (`÷ 1.16 ÷ 1.265`). Las tasas viven en
`app_config.impuestos` y se copian dentro de cada corte.

`app_config` tiene una policy extra, `config_vendedor_read_impuestos`, porque
el rol `vendedor` no es `is_staff()` y sin ella no podría netear su propia
base. Le abre esa clave y solo esa.

### Lo obsoleto que sigue vivo

`vendedores.comision_pct` y la tabla `comisiones` quedaron marcadas obsoletas
con `COMMENT` y ya no las lee nada del código. Se tiran con
`20261104200000_comisiones_limpieza.sql`, **que no debe correrse hasta que las
escaleras estén capturadas**: mientras no lo estén, `comision_pct` es el único
registro del porcentaje que se pactó con cada vendedor. Esa migración trae un
guard que aborta si `comision_tramos` está vacía.

## Había DOS triggers de `fecha_vencimiento` en `pedidos`

Encontrado el 2026-11-05, al aplicar `20261105000000_pedidos_fechas.sql`.

`public.pedidos` tenía dos triggers BEFORE escribiendo la misma columna:

| trigger | función | dispara en | base del cálculo |
|---|---|---|---|
| `trg_calc_fecha_vencimiento` | `calc_fecha_vencimiento()` | insert, update de `condiciones_pago`, `fecha_pedido`, `fecha_vencimiento` | `fecha_pedido` |
| `trg_fecha_vencimiento` | `set_fecha_vencimiento()` | insert, update de `condiciones_pago` | `created_at` |

El segundo **no existía en ninguna migración, ni en `tarabana_schema.sql`, ni
en estas notas**: se creó directo contra la base. Los dos son BEFORE sobre la
misma tabla, así que Postgres los corre en orden **alfabético** —
`trg_c...` y después `trg_f...` — y el no documentado corría al final y pisaba
el resultado del documentado.

El síntoma, medido contra producción antes de arreglarlo:

```
INSERT con fecha_pedido = 2026-10-01 y condiciones 30_dias
  esperado (fecha_pedido + 30)   2026-10-31
  real     (created_at  + 30)    2026-12-05
```

Un `fecha_vencimiento` capturado a mano en el INSERT también se perdía. El
UPDATE de `fecha_pedido` sí funcionaba, porque el viejo no dispara con
`update of fecha_pedido` y ahí no alcanzaba a pisar — lo que hacía el bug
especialmente confuso de leer.

### La fuente de `set_fecha_vencimiento()`, textual

Rescatada con `pg_get_functiondef` antes de tirarla. Queda aquí porque no
existía en ningún archivo del repo y, una vez borrada, no hay de dónde
recuperarla:

```sql
CREATE OR REPLACE FUNCTION public.set_fecha_vencimiento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.condiciones_pago = '15_dias' then
    new.fecha_vencimiento := (new.created_at::date + 15);
  elsif new.condiciones_pago = '30_dias' then
    new.fecha_vencimiento := (new.created_at::date + 30);
  else
    new.fecha_vencimiento := new.created_at::date;
  end if;
  return new;
end $function$
```

Confirma el diagnóstico al pie de la letra: la base es `new.created_at::date`,
y ese `::date` se evalúa en la zona del servidor (UTC). Dos consecuencias que
ya se midieron contra producción:

* una fecha de pedido retroactiva no tenía ningún efecto sobre el
  vencimiento;
* entre las 18:00 y la medianoche de CDMX el vencimiento salía un día tarde,
  porque `created_at::date` en UTC ya era el día siguiente.

En efecto hacía lo mismo que la versión documentada de
`calc_fecha_vencimiento()` en `20260803200000` (que usaba
`created_at + interval '15 days'`): dos funciones distintas, con nombres
distintos, calculando lo mismo, y sólo una en el repo.

Lo tira `20261105100000_pedidos_trigger_duplicado.sql`, que además deja un
guard: si `public.pedidos` termina con algo distinto de exactamente
`trg_calc_fecha_vencimiento`, la migración aborta.

**La lección operativa:** `drop trigger if exists <nombre>` sólo protege del
nombre que uno conoce. Cuando una migración reemplaza un trigger, vale la
pena listar los que quedan en la tabla y abortar si hay más de uno. Y antes de
dar por buena una migración de trigger, probarla con un INSERT real: la
estructura, la vista y el backfill de `20261105000000` pasaron todas las
verificaciones, y el bug sólo apareció al insertar una fila de prueba.

## `pedidos.fecha_entrega` y `fecha_entrega_real` son `timestamptz`, y el código las trata como fechas

Verificado contra producción el 2026-11-10 con el spec OpenAPI de PostgREST.
Es la divergencia inversa a la de `pagos.fecha_pago` y
`pedidos.fecha_vencimiento`, que están declaradas `timestamptz` y viven como
`date`: estas dos sí son `timestamptz`.

Lo que escribe el código es `'YYYY-MM-DD'` —el `<input type="date">` del panel
de envío, y la ruta de status al entregar sin descontar inventario— y Postgres
lo interpreta como **medianoche UTC**, que en CDMX son las 18:00 del día
anterior. No se nota porque nadie lo parsea: `pedidos-ui.ts:299` lo lee con
`.slice(0, 10)` sobre el string crudo, así que la fecha que se muestra es la
que se escribió.

**La consecuencia para quien toque esto:** pasarlas por `new Date()` o
compararlas como instantes da un día de menos en la zona del negocio. Si
alguna vez hacen falta como instante, hay que decidir la hora a propósito
(mediodía México, por ejemplo) en vez de heredar la medianoche UTC. Mientras se
traten como fecha y se lean cortando el string, el comportamiento es correcto.

## `productos.updated_at` no se mantiene: no sirve para saber cuándo cambió un producto

Verificado contra producción el 2026-11-10, al aplicar la lista de precios de
noviembre. Un UPDATE de 38 columnas de precio **no movió `updated_at`** en
ninguna de las 9 filas, y la columna coincide con `created_at` en 10 de los 11
productos:

```
Brisa        created 2026-07-11T22:27:52   updated 2026-07-11T22:27:52
Magma        created 2026-07-11T22:27:52   updated 2026-07-11T22:27:52
Solarsteinn  created 2026-11-05T20:03:19   updated 2026-11-05T20:03:19
```

No hay trigger que la actualice, y ninguna de las rutas que escriben
`productos` la setea a mano (`/api/admin/inventario/precios`,
`[id]/stock`, `crear`, ni el update directo de la ficha). La única que difiere
es Brasa, por una edición de agosto que sí la escribió.

**Consecuencia:** `updated_at` es un dato muerto. No se puede usar para ordenar
por "último cambio", ni para detectar qué productos se tocaron, ni como base de
una caché. El único registro de cuándo y cómo cambió un precio o un stock es
`audit_log` (`producto.precios`, `producto.stock`), que sí guarda el
antes/después por columna.

Si alguna vez hace falta de verdad, se arregla con un trigger `BEFORE UPDATE`
que haga `new.updated_at := now()` — pero eso es una migración, y mientras no
exista, no confiar en la columna.
