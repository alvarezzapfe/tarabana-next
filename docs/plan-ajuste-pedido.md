# Ajuste $ por pedido — plan y decisiones

Rama `feat/ajuste-pedido`, sacada de `main` en `1ab8e09`. Sucede a
`docs/plan-iva.md` y `docs/plan-iva-partida.md`. Este documento existe para
poder retomar el trabajo en frío: guarda las decisiones y **por qué** se
tomaron, que es lo que se pierde primero.

## El problema

El total del sistema y el total de la orden de compra del cliente no siempre
coinciden: centavos de redondeo, un flete que el cliente ya tenía cotizado,
una diferencia pactada por teléfono. Hoy no hay forma de cuadrarlos sin
falsear un precio o un descuento.

Se quiere un campo **Ajuste $** por pedido, positivo o negativo, con motivo
obligatorio.

## Lo medido antes de planear (2026-11-12)

**Comisiones: no hay que cambiar la fórmula, y está medido con la función
real.** El prorrateo `cobrado × (total − descuento) / total_con_envio` ya
excluye el ajuste, igual que excluye el envío y el IVA, porque el ajuste entra
en el denominador y no en el numerador:

```
mercancía 1,000, pagado completo
  sin ajuste     total_con_envio 1000  cobrado 1000  ->  base 790.51
  ajuste +500    total_con_envio 1500  cobrado 1500  ->  base 790.51
  ajuste -300    total_con_envio  700  cobrado  700  ->  base 790.51
```

Cobrar el ajuste **no infla la base**. Con pago parcial de la mitad y ajuste
+500 da 395.26, la mitad exacta. Solo se agregan tests.

**La línea base cambió:** `pedidos_saldo` trae 16 filas y $92,052.97 de
`total_con_envio` (ayer eran 15 y $50,835.85), porque se capturó un pedido
nuevo. La verificación toma foto fresca en vez de comparar contra números
viejos.

## Las cinco decisiones aprobadas

### A. El desglose muestra CENTAVOS

`moneda()` hace `Math.round`: el carrito ya imprime **$2,501** para 2,501.45.
Con "Cuadrar contra OC" eso deja de ser cosmético y se vuelve dañino — un
ajuste de 27 centavos se vería como **$0**, y capturar el total de la OC
mirando un número redondeado produce un ajuste equivocado.

Los renglones del desglose (carrito, panel, Word, portal) usan un formateador
con centavos. `moneda()` se queda igual en KPIs y tablas, donde los centavos
son ruido.

### B. El signo del ajuste se imprime explícito

`+$27.00` y `−$27.00`. Es el único campo que puede ir en los dos sentidos, y
`moneda(-27)` daría `$-27`, que se lee mal.

### C. No se clampa el total en 0: la ruta rechaza que quede negativo

Un ajuste más negativo que el total es un error de captura. Clamparlo lo
esconde; dejarlo pasar deja un pedido que cobra en negativo y que
`estado_cobro` reporta como *pagado*. Rechazarlo con un mensaje claro es lo
único que no miente.

### D. El ajuste es un monto NO gravado

Queda fuera de `base_gravable`. Para cuadrar centavos es lo correcto, y vale
escribir la consecuencia: en un ajuste grande significa cobrar o rebajar **sin
IVA**, que fiscalmente no es un descuento. Por eso el motivo es obligatorio y
el 5% pide confirmación. Si algún día se necesita que el ajuste mueva el IVA,
eso es un descuento, no un ajuste.

### E. El 5% se mide sobre el total ANTES del ajuste

`totalAntes = total − descuento_monto + costo_envio + iva_monto`, o sea lo que
se cobraría sin él. Si `totalAntes` es 0 (un pedido sin partidas), cualquier
ajuste distinto de cero excede y pide confirmación — correcto, y conviene
saberlo.

### Y una decisión más: el ajuste NO va en el Excel de importación

"Cuadrar contra OC" es un acto interactivo: se mira el total, se captura el de
la orden, se confirma. Una columna de ajuste en una carga de 300 renglones es
una forma barata de mover dinero sin que nadie lo vea.

## El modelo

```sql
pedidos.ajuste        numeric(12,2) not null default 0
pedidos.ajuste_motivo text
check (ajuste = 0 or btrim(coalesce(ajuste_motivo, '')) <> '')
```

La vista pasa a **26 columnas** (las 25 actuales en su nombre, tipo y orden;
`ajuste` al final):

```
total_con_envio = total − descuento_monto + costo_envio + iva_monto + ajuste
saldo           = total_con_envio − pagado
base_gravable   = sin cambio        <- el ajuste no causa IVA
```

Los pedidos existentes quedan en `ajuste = 0`, así que ningún saldo se mueve.

Migración idempotente, sin tablas temporales, guards dentro del bloque que
protegen (el SQL Editor de Supabase confirma statement por statement; ver
`docs/SCHEMA_NOTES.md`). **No crea ninguna función**, así que no hay nada que
revocar.

**La vista se reescribe otra vez, así que se repite el check del fan-out:**
`pagado` contra una suma independiente sacada de `pagos`, fila por fila. Es lo
que atrapa que las partidas se cuelen como un join y cada pago se cuente una
vez por partida.

## Comportamiento

- **POS**: campo "Ajuste $" en el carrito, después del IVA, con motivo
  obligatorio y el atajo "Cuadrar contra OC" (se captura el total de la orden
  y el ajuste sale de `totalOC − totalActual`).
- **Panel lateral y pantalla vieja de edición**: el mismo campo, por su propia
  ruta.
- Solo `canManageAsAdmin`, validado en el servidor. El vendedor no lo ve.
- Si `|ajuste| > 5%` de `totalAntes`, pide confirmación explícita.
- No se puede cambiar en pedidos entregados ni cancelados, y aplica la misma
  regla de sobrepago que las partidas y el IVA.
- `audit_log` con antes/después y el motivo.

## Trabajo por archivo

| # | Archivo | Qué | Estado |
|---|---|---|---|
| 1 | `…_pedido_ajuste.sql` + `_down` | columnas, constraint, vista de 26 | |
| 2 | `src/lib/ajuste.ts` | `ajusteParaCuadrar`, `excedeTolerancia`, `TOLERANCIA_AJUSTE = 0.05`. Puro, con tests | |
| 3 | `src/lib/iva.ts` | `desglosar` gana `ajuste` y lo suma al total | |
| 4 | `src/lib/editar-partidas.ts` | `sobrepagoDe` suma el ajuste a `aCobrar` | |
| 5 | `src/lib/metricas.ts` | `FilaSaldo.ajuste` **obligatoria**; `ventaDe = neto − iva − ajuste`; `ajusteTotal`; `ResumenPeriodo.ajuste` | |
| 6 | `crear-pedido.ts` + `/crear` | persiste `ajuste`/`ajuste_motivo`, solo admin | |
| 7 | ruta `[id]/ajuste` + `CampoAjuste.tsx` | panel y pantalla vieja; motivo, 5%, sobrepago, total negativo, `audit_log` | |
| 8 | `Carrito.tsx` | campo Ajuste, motivo y "Cuadrar contra OC"; desglose de 7 renglones | |
| 9 | `dash-ui.ts`, `pedidos-ui.ts`, `TablaPedidos`, Word, portal, `clientes-export`, `reporte.ts` | formateador con centavos y renglón de Ajuste | |
| 10 | `comisiones.test.ts` | ajuste positivo y negativo, sin tocar la fórmula | |

El desglose completo, en orden: **Subtotal, Descuento, Envío, Base gravable,
IVA, Ajuste, Total.**

## Tests

Ajuste positivo · negativo · con IVA mixto · con descuento · "cuadrar contra
OC" incluido el caso en que ya coincide (ajuste 0) · la tolerancia del 5% en el
borde · comisión con ajuste en los dos sentidos · sobrepago al meter un ajuste
negativo a un pedido cobrado · el formateador de centavos. Más la verificación
contra producción con pedidos de prueba que se borran al final.

## Fuera de alcance

- El ajuste no toca el IVA ni el IEPS.
- No se reexpresa ningún pedido existente.
- No entra en la importación de Excel.
- El vendedor sigue sin verlo.
