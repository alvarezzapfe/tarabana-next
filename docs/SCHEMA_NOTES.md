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

## `pedidos_saldo` incluye IVA desde el 2026-11-11

`pedidos.incluye_iva` y `pedidos.iva_tasa` (migración `20261111000000`)
agregaron una tercera columna a la vista, `iva_monto`, y cambiaron lo que
significan dos que ya existían:

```
base            = total - descuento_monto + costo_envio
iva_monto       = round(base * iva_tasa, 2) si incluye_iva, si no 0
total_con_envio = base + iva_monto        <- antes era solo `base`
saldo           = total_con_envio - pagado
```

Dos consecuencias al leer datos:

- **`total` sigue siendo bruto y SIN IVA.** El IVA nunca entra en
  `pedido_items`: es un atributo del pedido y se suma una sola vez, al final.
  `crearPedido` y `set_pedido_items` no lo conocen, y su comparación de totales
  contra las partidas sigue cuadrando.
- **Lo facturado de un pedido (`pagado + saldo`) ahora puede traer IVA.** Para
  medir VENTA hay que restarle `iva_monto` — es lo que hace `ventaDe` en
  `src/lib/metricas.ts`, que también explica por qué la cobranza sí lo deja.

`iva_tasa` es una copia de `app_config.impuestos.iva_tasa` tomada al crear el
pedido, no una lectura en vivo: un pedido cobrado y pagado al 16% no puede
amanecer con saldo porque la tasa cambió.

Los 15 pedidos vivos al momento de la migración quedaron en
`incluye_iva = false`, así que ninguno movió su saldo; la propia migración lo
verifica comparando contra una foto tomada antes de tocar nada.

## El SQL Editor de Supabase NO garantiza que `begin/commit` sea atomico

Lo demostro la migracion del IVA (`20261111000000`) el 2026-11-11. El archivo
abria con `begin;`, cerraba con `commit;` y tomaba una foto de los saldos en
una tabla temporal (`create temp table ... on commit drop`) para compararla al
final y abortar si algun saldo se movia.

Lo que paso al pegarlo en el SQL Editor:

- El `begin` **no** protegio nada. Cada statement se confirmo por su cuenta.
- La tabla temporal murio con el statement que la creo, no al final del
  archivo.
- El bloque de verificacion trono con `relation "_saldo_antes" does not
  exist`, pero **todo lo de arriba ya estaba escrito**. No hubo rollback.

El resultado fue correcto por suerte, no por diseno: se verifico a mano
despues.

### Que hacer en las migraciones nuevas

- **No depender de que el archivo sea una sola transaccion.** Si una
  verificacion tiene que poder abortar los cambios, el SQL Editor no es la
  herramienta: hay que correr el archivo por un cliente que sostenga la
  transaccion (`psql`, la CLI de Supabase).
- **Nada de tablas temporales** para pasar datos entre statements del mismo
  archivo. Una tabla normal, creada al inicio y borrada al final a mano. Si
  vive en `public` —que PostgREST expone— prenderle RLS sin policies y
  revocarle los grants, por si el script se interrumpe y sobrevive.
- **Un guard sirve solo dentro del bloque que protege.** Un `do $$ ... raise
  exception ... $$` suelto al principio del archivo no impide que lo de abajo
  corra: hay que meter el guard y el DDL que protege en el MISMO `do`, con el
  DDL por `execute`. Asi quedo el rollback del IVA
  (`20261111000001_pedidos_iva_down.sql`), cuyo guard evita recrear la vista
  sin `iva_monto` mientras haya pedidos que todavia declaran IVA.
- Las verificaciones al final siguen valiendo la pena aunque no puedan
  revertir: avisan. Pero hay que leerlas como una **alarma**, no como un
  seguro, y confirmar a mano cuando una truene.

## El IVA es por PARTIDA desde el 2026-11-12

`20261112000000_iva_por_partida.sql` movió el IVA de `pedidos.incluye_iva` a
`pedido_items.incluye_iva`, con `pedidos.envio_incluye_iva` para el flete.
`pedidos_saldo` ganó `base_gravable` (columna 25) y `iva_monto` cambió de
fórmula:

```
gravable   = suma de (cantidad * precio_unitario) de las partidas gravadas
razon      = 1 - descuento_monto / total   (1 si total = 0; nunca negativa)
base_grav  = round( gravable * razon + (costo_envio si envio_incluye_iva), 2 )
iva_monto  = round( base_grav * iva_tasa, 2 )
```

Cuatro cosas que importan al leer o tocar esto:

- **`pedidos.incluye_iva` ya es DERIVADA.** La mantienen dos triggers
  (`trg_pedido_items_sync_iva`, `trg_pedidos_sync_iva`) y significa "hay
  partidas, todas gravadas, y el envío es 0 o gravado". **No escribirla a
  mano**: el trigger de `pedidos` la recalcula en cada INSERT y UPDATE, así que
  un valor puesto a mano se pierde. Para medir el IVA de un pedido se usa
  `iva_monto`, no esta bandera.

- **La vista suma `cantidad * precio_unitario`, no `subtotal`.** En producción
  hay una partida con `subtotal` en NULL (`eec25a6f`, la huérfana de #0E1B76);
  con `sum(subtotal)` ese pedido calcularía $1,000 menos de base.

- **Las partidas se agregan en una subconsulta 1:1, no en un join.** La vista
  ya hace `left join pagos`; un segundo join a `pedido_items` multiplicaría las
  filas y `sum(monto)` contaría cada pago una vez por partida. La verificación
  de la migración compara `pagado` contra una suma independiente justamente por
  eso.

- **`pedido_todas_las_partidas_con_iva(uuid)` tiene el EXECUTE revocado.** Es
  `SECURITY DEFINER` y devuelve un escalar: con el EXECUTE por default de
  PUBLIC, PostgREST la publicaba como RPC y cualquier `anon` podía sondear
  pedidos ajenos saltándose RLS. Regla general: una función DEFINER que
  devuelva algo distinto de `trigger` necesita su `revoke`.

## `pedidos.ajuste`: el renglón que cuadra contra la OC (2026-11-13)

`20261113000000_pedido_ajuste.sql` agregó `pedidos.ajuste numeric(12,2)` y
`pedidos.ajuste_motivo`, con un constraint que exige motivo cuando el ajuste no
es cero. `pedidos_saldo` ganó la columna `ajuste` (la 26) y cambió dos
fórmulas:

```
total_con_envio = total - descuento_monto + costo_envio + iva_monto + ajuste
saldo           = total_con_envio - pagado
base_gravable   = SIN CAMBIO
```

Cuatro cosas que importan al leer o tocar esto:

- **El ajuste NO causa IVA.** Queda fuera de `base_gravable` a propósito. Para
  cuadrar centavos es correcto; en un ajuste grande significa cobrar o rebajar
  sin impuesto, que fiscalmente no es un descuento. De ahí que el motivo sea
  obligatorio y que arriba del 5% la aplicación pida confirmación.

- **El ajuste NO genera comisión, y la fórmula no lo menciona.** El prorrateo
  `cobrado × (total − descuento) / total_con_envio` ya lo excluye porque el
  ajuste está en el denominador y no en el numerador. Medido: con ajuste +500,
  −300 y sin ajuste, los tres dan la misma base. No hay que "agregarle" nada a
  comisiones; hay que no romper esa propiedad.

- **Para medir VENTA hay que restar el ajuste además del IVA.** Es lo que hace
  `ventaDe` en `src/lib/metricas.ts`. Dejarlo dentro haría que un mes donde se
  cuadraron muchas OC pareciera un mes de más o menos ventas según el signo de
  los ajustes. La cobranza sí lo cobra.

- **`total_con_envio` ya no se escribe tres veces en la vista.** La definición
  tiene cinco niveles anidados y cada uno calcula una sola cosa (base gravable,
  IVA, total, saldo); el select de afuera es pura proyección. Si alguien
  "simplifica" eso a un nivel, la suma del total vuelve a quedar repetida
  cuatro veces y una discrepancia entre copias es invisible al revisar.

## Módulo Producción (migración 20261118000000)

### De qué estado partió `lotes`

Verificado contra producción con el service client (solo lectura) el
2026-11-18: `lotes` era **la tabla original** de `tarabana_schema.sql:241`
—sus 9 columnas, sin una sola migración encima— y tenía **0 filas**. El único
código que la tocaba era `app/admin/produccion/page.tsx`, y solo leía; su
botón "+ Nuevo lote" apuntaba a `/admin/produccion/nuevo`, que no existía.

Por eso la migración puede tirar las cinco columnas legacy sin perder un dato.
El reemplazo, una a una:

```
nombre_lote          -> folio (generado por trigger, único)
volumen_litros       -> litros_objetivo / litros_reales
latas_producidas     -> lote_envasado
barriles_producidos  -> lote_envasado
fecha_produccion     -> fecha_coccion
```

El guard del bloque lo vuelve a comprobar al aplicar, y está condicionado a
que `nombre_lote` todavía exista: sin eso, re-correr la migración con lotes
reales abortaría aunque no quedara nada que tirar.

### El stock sigue en `productos`; `inventario_movimientos` es el libro

**Inventario no tenía tabla de movimientos.** El stock son los 7 contadores
enteros de `productos` y **eso no cambió**: siguen siendo la existencia
actual, y ninguna pantalla cambió cómo los lee.

`inventario_movimientos` es nuevo y es el libro de entradas/salidas, con
`lote_id` nullable. Existe porque "que la entrada a inventario referencie el
lote" no se podía cumplir: no había movimiento al que ponerle un lote. Nace
solo con las entradas por producción; el ajuste manual
(`/api/admin/inventario/[id]/stock`) y la entrega siguen escribiendo
`productos.stock_*` y dejando su rastro en `audit_log`, y se le pueden
conectar después sin migrar nada.

El `unique (lote_id, producto_id, columna_stock) where lote_id is not null`
es el guard de idempotencia: liberar dos veces el mismo lote choca ahí, la
transacción aborta y el stock **no** se suma dos veces.

### `lote_envasado.litros_equivalentes` es generada, y duplica factores a propósito

Los factores (lata 355 ml ⇒ caja12 = 4.26 L, caja24 = 8.52 L, barriles 20/10)
están **en los dos lados**: `LITROS_POR_UNIDAD` en `src/lib/unidades.ts` y la
expresión de la columna generada. Es la misma clase de espejo que
`roles.ts` ↔ las funciones SQL.

Está así porque la merma es `litros_reales - sum(litros_equivalentes)`: si el
cliente pudiera mandar los litros, podría mandar unos que no corresponden a
las cajas y la merma quedaría falseada sin que nada lo note. **Si esos
factores cambian, se cambian en los dos lados.**

El envasado habla en **columnas de stock** (`stock_caja24`…), no en unidades
de venta de `pedido_items` (`caja24`, `mix24`…). Son dos vocabularios y
mezclarlos manda el stock a la columna equivocada.

### `productos.folio_prefijo`

Columna nueva, `text` nullable con unique parcial y check `^[A-Z]{3}$`. Las 3
letras del folio (`BRA-26-014`) salen de aquí y **no** se derivan del nombre
ni de `productos.estilo`: estilo es texto libre y choca —`Lager` y
`Lager Mexicana` darían `LAG` las dos— y derivar del nombre ataría el folio a
un nombre que puede cambiar.

Nullable porque un producto de reventa o una cerveza de invitado no se cocina
en casa, y volverla NOT NULL rompería `/api/admin/inventario/crear`. Quien
intente crear un lote de un producto sin prefijo recibe un error explícito
del trigger.

Cambiar el prefijo **no** reescribe folios ya emitidos: `lotes` guarda su
propio `folio_prefijo` y su `folio` ya formado. Un folio impreso en una caja
no puede cambiar porque alguien editó el catálogo.

### El consecutivo del folio es una tabla contador, no un `max()+1`

`lote_folios (prefijo, anio, ultimo)`. Dos cocciones capturadas al mismo
tiempo leerían el mismo `max()` y chocarían contra `lotes_folio_key`; el
`on conflict (prefijo, anio) do update ... returning` toma el lock del
renglón, así que la segunda transacción espera y se lleva el siguiente.

### `lotes_vista` enumera columnas; no usa `l.*`

A propósito, y es la lección que este proyecto ya pagó con `pedidos_saldo`
(el archivo declara 11 columnas, producción tiene 16): `create or replace
view` con `*` congela la lista del momento en que se creó, así que un
`alter table lotes add column` posterior **no aparece en la vista** y nadie se
entera. Agregar una columna a `lotes` pide tocar la vista y el tipo
`LoteFila` en `app/admin/produccion/produccion-ui.ts`.

`security_invoker = on`, igual que `pedidos_saldo`.

### La merma es `null`, nunca 0, cuando falta un lado

Un lote sin `litros_reales` capturados o sin envasado no tiene merma "de
cero": tiene merma **desconocida**. La vista devuelve `null` en
`merma_litros` / `merma_pct`, y `mermaDelPeriodo` en `src/lib/produccion.ts`
los deja fuera del KPI y los cuenta en `sinDatos` — mismo criterio que
`sinUnidad` en `topProductosEnLitros`.

El KPI de merma a 90 días es **ponderado por volumen**, no el promedio de los
porcentajes: promediarlos le daría el mismo peso a un lote de 50 L que a uno
de 1000 L.

### `deleted_at` y no `descontinuado_at`

`lotes.deleted_at` se llama así aunque el soft-delete de `productos` sea
`descontinuado_at`. No es la misma cosa: `descontinuado_at` es una baja de
catálogo, y un lote borrado es una captura equivocada. Un lote **liberado** no
se borra ni en suave (la ruta responde 409): ya movió inventario.

### Trigger de `updated_at`

`public.toca_updated_at()` es el primer trigger de `updated_at` del proyecto
—hasta ahora el código lo seteaba a mano— y cuelga solo de `lotes` y
`tanques`. Está porque `lotes` se escribe desde varias rutas y desde dos
funciones SQL, y que una se olvide deja el `updated_at` mintiendo.

## Producción F2 (migración 20261119000000)

### El bug de zona horaria que la F1 reintrodujo

`20261118000000_produccion.sql` usaba `current_date` en tres lugares, cuando
`20261105000000_pedidos_fechas.sql:49` ya había creado `public.hoy_mx()` justo
porque `current_date` se evalúa en UTC y después de las 18:00 CDMX ya está en
el día siguiente. Esa migración incluso dejó un guard que aborta si
`pedidos_saldo` reincide (`:330-343`), y la F1 lo repitió en otra tabla.

Lo que hacía mal, en concreto:

| Dónde | Efecto |
|---|---|
| `avanzar_lote`, `fecha_envasado = current_date` | Envasar a las 19:00 de un martes estampaba el miércoles |
| `lotes_vista.dias_en_etapa` | Un día de más, seis horas cada noche — y alimenta el "parado" del tablero y las alertas |
| `lote_asigna_folio`, año del folio | Un lote creado la noche del 31 de diciembre se foliaba con el año siguiente |

**Había un segundo lado del mismo error, más difícil de ver:**
`etapa_desde::date` castea en la zona de la **sesión** (UTC en Supabase), así
que restarle `hoy_mx()` mezclaba dos calendarios. Por eso la F2 agrega
`public.fecha_mx(timestamptz) -> date`, hermana de `hoy_mx()`, y el guard del
final vigila las dos cosas: que ninguna vista del módulo use `current_date` y
que no quede un `::date` crudo sobre un timestamptz.

### `recetas`: una por producto, y un null NO es un cero

`unique(producto_id)`. Días objetivo en columnas explícitas por etapa, no en
jsonb, porque la vista los suma y los compara.

**La distinción que gobierna todo lo demás:** `dias_maduracion = 0` significa
"no madura" y deja correr la proyección; `dias_maduracion = null` significa
"no se sabe" y la apaga. `receta_dias_etapa()` y `receta_dias_restantes()`
devuelven null si falta cualquier etapa, y `dias_objetivo_total` también —
**un plan a medias no se proyecta a medias**, porque una fecha calculada con
tres de cuatro etapas se ve igual de legítima que una buena.

### La proyección se ancla en el reloj del lote, no en la cocción

`fecha_fin_estimada` = `etapa_desde + dias_restantes(etapa actual)`, con
`planeado` como excepción (ahí se ancla en `fecha_coccion`, porque el lote no
ha empezado) y un `greatest(hoy_mx(), ...)` encima.

La versión anclada en `fecha_coccion + plan completo` tiene un defecto que se
ve en cuanto un lote se atrasa: con un plan de 39 días y 50 días desde la
cocción, proyecta el fin **once días en el pasado** — una barra que termina
antes de hoy con el tanque visiblemente lleno. El `greatest` no esconde el
atraso: para eso está la alerta `etapa_vencida`.

### Las alertas viven en la vista, el copy en TS

`lotes_vista.alerta_nivel` (`ninguna` | `ambar` | `rojo`) y
`alerta_motivos text[]`. Umbrales como constantes de la vista: 48 h sin
lectura (solo en fermentación), FG fuera de ±0.003, merma > 10%, y días en
etapa por encima del objetivo (ámbar) o del doble (rojo).

Están ahí y no en TS por una razón concreta: así el contador del sidebar es
un `count(*)` de una query. Con las reglas en TS, `app/admin/layout.tsx`
tendría que cargar todos los lotes **en cada página del panel** para contar.
Lo que sí vive en TS es el texto de cada motivo (`MOTIVO_ALERTA` en
`src/lib/produccion.ts`): un copy para personas no tiene por qué viajar desde
una vista, y un motivo desconocido se muestra tal cual en vez de desaparecer.

Las reglas que dependen de la receta no disparan sin ella, y eso **se dice**:
`tiene_receta` es una columna y la tarjeta pinta "Sin receta".

### `lote_tanque_asignaciones`: por qué el pasado se guarda

`lotes.tanque_id` es una columna mutable sin historia: la ruta PATCH la cambia
sin registrar nada y `lote_eventos` solo guarda cambios de **etapa**. Con eso,
un calendario dibujado desde `fecha_coccion` afirma que el lote estuvo en su
tanque **actual** desde el día de la cocción — y mover un lote de fermentador
a madurador es exactamente lo normal.

La mantiene el trigger `lote_asignacion_trg` y **no la ruta**, a propósito:
`lotes` lo escriben la ruta PATCH, `avanzar_lote()` y cualquier cosa futura.
Si la sincronización viviera en la ruta, el primer camino que se olvide de
llamarla deja la historia incompleta y el calendario vuelve a mentir sin que
nadie sepa por qué. El trigger cubre: alta, cambio de tanque, liberado,
descartado y soft-delete.

`hasta is null` = sigue ahí, con un unique parcial que impide dos asignaciones
abiertas del mismo lote. `tanque_id` es **`on delete restrict`** y no cascade:
borrar un tanque no puede borrar la historia de lo que se hizo en él. Por eso
`app/api/admin/produccion/tanques/[id]/route.ts` cuenta **las dos cosas** —
lotes que lo apuntan hoy y asignaciones históricas—; un lote que se movió a
otro tanque deja de contar por `lotes.tanque_id` pero su historia sigue ahí, y
sin mirarla el guard pasaría y el DELETE reventaría con un error crudo de FK.

### `inventario_en_camino` reporta sus propios huecos

Litros proyectados por producto a 14 días. **Por producto y en litros**, no
por presentación: hasta que un lote se envasa no se sabe en qué presentación
sale, y repartirlo adivinando inventaría cajas.

`lotes_sin_fecha` cuenta los que no se pueden proyectar y **no están sumados
en `litros`**. La columna de Inventario lo muestra como un `+?` ámbar, porque
si no se reportara, "no viene nada" y "no se sabe qué viene" se verían igual.
Mismo criterio que `sinClasificar` en `src/lib/stock-disponible.ts`.
