# IVA por partida — plan y decisiones

Rama `feat/iva-por-partida`. Sucede a `docs/plan-iva.md`, que modeló el IVA
como un switch por PEDIDO. Este documento existe para poder retomar el trabajo
en frío: guarda las decisiones y **por qué** se tomaron, que es lo que se
pierde primero.

## El problema

Hoy el IVA es todo o nada por pedido (`pedidos.incluye_iva`, `iva_tasa`). Se
necesita decidirlo **partida por partida**, con un switch general que las
prenda todas y otro para el envío.

## Hallazgos medidos contra producción (2026-11-11, solo lectura)

**`pedido_items.subtotal` no sirve como base gravable.** La columna existe,
pero **1 de 34 partidas la tiene en `NULL`**: `eec25a6f`, la partida huérfana
de #0E1B76 (cant 1, precio 1000, `unidad` nula) que viene pendiente desde el
trabajo de stock. Con `Σ subtotal` ese pedido calcularía $1,000 menos de base.
Con `Σ cantidad × precio_unitario` el total cuadra en **16 de 16** pedidos.

→ **La vista suma `cantidad * precio_unitario`, nunca `subtotal`.**

**El vendedor no tiene policy de UPDATE sobre `pedidos`.** Solo INSERT
(`20261103100000` lo decidió explícitamente). Esto es lo que obliga a que el
trigger sea `SECURITY DEFINER`; ver la decisión B.

## El riesgo central: el fan-out de la vista

`pedidos_saldo` hace `left join pagos` y agrupa por `p.id`. Si para sumar las
partidas gravables se agrega **un segundo left join a `pedido_items`, las filas
se multiplican y `sum(pg.monto)` cuenta cada pago una vez por partida**. Un
pedido con 3 partidas y 1 pago de $400 reportaría $1,200 cobrados, y el saldo
se desplomaría sin que nada falle ni avise.

Las partidas se agregan **en una subconsulta aparte, 1:1 por `pedido_id`**,
nunca como un join más. Es lo único de esta migración que puede corromper
dinero en silencio, y por eso la verificación compara `pagado` fila por fila:
tiene que quedar idéntico en las 15.

## Las cinco decisiones aprobadas

### A. `base_gravable` se redondea a 2 ANTES de aplicarle la tasa

La base se imprime en el documento. Si se guarda sin redondear (p. ej.
379.4892…) y el IVA sale del valor sin redondear, el cliente lee
"Base 379.49 · IVA 60.72" y al verificar `379.49 × 16%` no siempre le da. Con
la base redondeada primero, lo impreso siempre cuadra — que además es como se
arma un CFDI.

### B. `pedidos.incluye_iva` lo mantiene un TRIGGER `SECURITY DEFINER`

Es un resumen derivado, y hay cinco escritores que podrían desincronizarlo:
`crearPedido`, `set_pedido_items`, la importación de Excel (vía `crearPedido`),
la ruta de envío y la ruta de IVA. Olvidar uno deja el resumen mintiendo, y un
resumen que miente es peor que no tenerlo.

Tiene que ser `SECURITY DEFINER` con `search_path` fijo: un trigger normal
sobre `pedido_items` que haga `update pedidos` corre bajo RLS, y **el vendedor
no tiene UPDATE sobre `pedidos`**, así que afectaría **cero filas en silencio**
—RLS no tira error— y el resumen quedaría mal en todos los pedidos que levante
un vendedor. El trigger escribe únicamente `incluye_iva`, y solo del pedido
dueño de la fila.

### C. El resumen ignora el envío cuando `costo_envio = 0`

Si no, un pedido con todas las partidas gravadas y sin flete mostraría el
switch general apagado para siempre, porque no hay forma de prenderle el IVA a
un envío que no existe.

```
incluye_iva = (hay partidas) y (todas gravadas) y (costo_envio = 0 o envio_incluye_iva)
```

### D. `iva_tasa > 0 and iva_tasa < 1`, siempre

El constraint viejo (`not incluye_iva or iva_tasa > 0`) deja de garantizar nada:
con IVA por partida un pedido puede tener partidas gravadas y el resumen en
`false`. Todos los pedidos ya están en 0.16, así que el constraint nuevo no
rechaza nada existente.

### E. El switch "aplicar a todas" NO lleva RPC nuevo

`set_pedido_items` necesitó uno porque su estado intermedio era "pedido sin
partidas", que es corrupción. Aquí el intermedio —partidas gravadas y envío
todavía no— **es un estado legítimo que el modelo permite**. Dos `UPDATE` en la
ruta, con el trigger cuidando el resumen.

## El modelo

```sql
pedido_items.incluye_iva   boolean not null default false
pedidos.envio_incluye_iva  boolean not null default false
```

La vista pasa de 24 a **25 columnas**: `iva_monto` ya existía (la 24) y solo
cambia de fórmula; la nueva es `base_gravable`, apendizada en la 25. Las 24
actuales conservan nombre, tipo y orden:

```
gravable   = Σ (cantidad × precio_unitario) de las partidas con incluye_iva
razon      = case when total > 0 then greatest(0, 1 − descuento_monto/total) else 1 end
base_grav  = round( gravable × razon + (costo_envio si envio_incluye_iva), 2 )
iva_monto  = round( base_grav × iva_tasa, 2 )
total_con_envio = total − descuento_monto + costo_envio + iva_monto
saldo           = total_con_envio − pagado
```

El descuento se prorratea: baja el pedido completo, así que la parte gravada
baja en la misma proporción. El `greatest(0, …)` es por un descuento de tipo
monto mayor que el total — `crearPedido` lo rechaza, pero la ruta de edición no
lo revalida, y sin el clamp la base se iría a negativo.

**Backfill** (hoy 0 filas, pero tiene que quedar correcto): las partidas y el
`envio_incluye_iva` de los pedidos con `incluye_iva = true` pasan a `true`.

## La migración, sin depender de `begin/commit`

Ver `docs/SCHEMA_NOTES.md`: el SQL Editor de Supabase confirma statement por
statement. Entonces:

- Todo idempotente: `add column if not exists`, `create or replace
  view/function`, `drop constraint if exists` + `add`, `create or replace
  trigger`. El backfill usa un `where` que es no-op en la segunda corrida.
- **Sin tablas temporales y sin foto previa.** No hace falta: como ningún
  pedido tiene IVA hoy, el invariante es auto-contenido y se verifica dentro
  del mismo bloque que protege.
- Lo que se verifica: 0 partidas gravadas tras el backfill → `iva_monto = 0` en
  las 15 filas; `total_con_envio = total − descuento_monto + costo_envio`
  (idéntico a hoy); **`pagado` contra una suma independiente sacada de
  `pagos`** ← el que atrapa el fan-out; 25 columnas en orden; `security_invoker = on`; sin `current_date`.
- El `_down` sigue el patrón nuevo: un solo `do $$` con el guard y el DDL por
  `EXECUTE`.

## Trabajo por archivo

| # | Archivo | Qué | Estado |
|---|---|---|---|
| 1 | `20261112000000_iva_por_partida.sql` + `_down` | columnas, backfill, vista, triggers, `set_pedido_items` con `incluye_iva` por partida | aplicada |
| 2 | `src/lib/iva.ts` | `baseGravableDe`; `desglosar` con los 6 renglones | hecho |
| 3 | `src/lib/editar-partidas.ts` | `sobrepagoDe` recibe `gravable`; `recalcularPartidas` arrastra el flag | hecho |
| 4 | `pos-ui.ts` + `Carrito.tsx` | flag por renglón, switch general tri-estado, switch de envío, desglose de 6 | hecho |
| 5 | `crear-pedido.ts` + `/crear` | persiste el flag por partida y `envio_incluye_iva` | hecho |
| 6 | `EditarPartidas.tsx` + ruta `/partidas` | switches por partida al editar | hecho |
| 7 | ruta `[id]/iva` + `SwitchIva.tsx` | "todas" + envío, sobrepago, `audit_log` | hecho |
| 8 | `plantilla-pedidos.ts` + `pedidos-importar.ts` | columna `iva` por renglón; precedencia renglón > pedido > cliente | hecho |
| 9 | Word, portal, `TablaPedidos`, `PanelPedido` | Base gravable, y marca de IVA por partida cuando hay mezcla | hecho |
| 10 | `comisiones.test.ts` | caso de IVA mixto, sin tocar la fórmula | hecho |

### Lo que salió distinto de lo planeado

**El `revoke` que faltaba.** `pedido_todas_las_partidas_con_iva` es
`SECURITY DEFINER` y devuelve un escalar, así que con el `EXECUTE` por default
de `PUBLIC` quedaba **publicada como RPC por PostgREST**: cualquier `anon`
podía preguntarle "este pedido lleva IVA en todas sus partidas" saltándose
RLS, de un pedido a la vez. Lo detectó el dueño del proyecto después de
aplicar la migración y lo corrió a mano; quedó registrado en el archivo y la
verificación lo comprueba con `has_function_privilege`.

**El reporte y `metricas.ts` no se tocaron.** `iva_monto` sigue existiendo con
el mismo significado, así que `ventaDe` (venta sin IVA) y el renglón de IVA del
reporte siguen funcionando sin cambios.

**La base gravable se muestra sólo cuando no es todo el pedido.** Si coincide
con subtotal − descuento + envío, el renglón no explica nada; con IVA parcial,
en cambio, es lo único que vuelve verificable el impuesto impreso.

### Lo que NO cambia, y por qué

**Comisiones.** El prorrateo `cobrado × (total − descuento) / total_con_envio`
quita exactamente el IVA que ese pedido traiga, sea de todas las partidas o de
dos de cinco, porque el denominador lo incluye y el numerador no. Solo se
agrega un test de IVA mixto.

**`metricas.ts`.** `ventaDe` resta `iva_monto`, que sigue existiendo con el
mismo significado.

## Tests

Todo gravado · nada gravado · mixto · mixto con descuento porcentual · mixto
con descuento de monto · envío con y sin IVA · el redondeo de la base contra el
de la vista · sobrepago al apagar el IVA de un pedido mixto ya cobrado ·
comisión con mixto. Más la verificación contra producción con pedidos de prueba
que se borran al final, como en `scripts/verificar-iva.mjs`.

## Fuera de alcance

- El IEPS no se toca: sigue dentro del precio de lista.
- Ningún pedido existente se reexpresa.
- El vendedor sigue sin poder editar partidas.
- La partida huérfana `eec25a6f` no se arregla aquí; solo se esquiva usando
  `cantidad × precio_unitario` en vez de `subtotal`.
