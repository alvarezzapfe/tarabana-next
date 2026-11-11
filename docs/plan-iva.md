# IVA por pedido — plan y decisiones

Rama `feat/iva-pedidos`. Este documento existe para poder retomar el trabajo
en frío: guarda las decisiones y **por qué** se tomaron, que es lo que se
pierde primero.

## El problema

Los precios de lista son **sin IVA**. El IEPS de cerveza **sí** va incluido en
el precio. Hoy el sistema no modela IVA en ningún lado: `pedidos.total` es el
bruto de las partidas y la vista `pedidos_saldo` nunca le suma impuestos.

Se quiere un switch **"Incluir IVA (16%)" por pedido**.

## Modelo

- `pedidos.incluye_iva boolean not null default false`. Los pedidos existentes
  quedan en `false`, así que su `iva_monto` es 0 y **ningún saldo se mueve**.
- `pedidos.iva_tasa numeric` — la tasa se copia **dentro del pedido** al
  crearlo. Si mañana cambia la tasa en `app_config`, los pedidos viejos no se
  reescriben. La tasa vigente vive en `app_config.impuestos.iva_tasa`.
- `pedidos_saldo` se redefine:
  ```
  base            = total − descuento_monto + costo_envio
  iva_monto       = case when incluye_iva then round(base * iva_tasa, 2) else 0 end
  total_con_envio = base + iva_monto
  saldo           = total_con_envio − pagado
  ```
  Las columnas nuevas van **al final**, las existentes conservan nombre, tipo y
  posición (`CREATE OR REPLACE VIEW` solo permite agregar al final), con
  `WITH (security_invoker = on)` explícito y un bloque que verifica que siga
  activo.

El total de las partidas **sigue siendo bruto sin IVA**: `crearPedido` y
`set_pedido_items` no cambian su aritmética. El IVA es un atributo del pedido,
no de la partida.

## Las dos decisiones aprobadas

### 1. Comisiones: se quita el divisor de IVA, queda solo el de IEPS

Hoy `comisiones.ts` calcula `divisorImpuestos = (1+iva)(1+ieps)`, o sea divide
la base entre 1.4674.

La base ya se prorratea así:

```
base = cobrado × (total − descuento) / total_con_envio / (1 + ieps)
```

Con la vista nueva, `total_con_envio` **incluye** IVA y `total − descuento`
**no**. Ese cociente ya quita el envío *y* el IVA en un solo paso,
proporcionalmente y con la tasa que ese pedido guardó. Dividir además entre
`1 + iva_tasa` lo quitaría dos veces. Y en un pedido sin IVA el mismo cociente
no quita nada de IVA, que es lo correcto.

**Por eso no hace falta arrastrar `iva_tasa` a la aritmética de comisiones: se
borra el factor de IVA y los dos casos quedan bien.**

### 2. "Facturado" es SIN IVA en todo lo analítico

Al incluir el IVA en `total_con_envio` y `saldo` cambia el significado de
`netoDe = pagado + saldo`, que es de donde sale **Facturado** en el Inicio y en
el reporte. Un pedido con IVA sumaría 16% más que uno sin IVA: dos unidades
distintas en el mismo número.

- **Analítico (Inicio, reporte, tops, ticket promedio, crecimiento): SIN IVA.**
  Se obtiene como `total_con_envio − iva_monto`; basta la columna `iva_monto`.
- **Cobranza (por cobrar, vencido, saldo, antigüedad de cartera): CON IVA**,
  porque es lo que el cliente debe.
- El IVA se muestra como renglón aparte donde haya desglose.

Nota: `netoDe === total_con_envio` siempre, porque `saldo = total_con_envio −
pagado`. Así que "facturado sin IVA" = `total_con_envio − iva_monto`.

## Hallazgos medidos contra producción (2026-11-11, solo lectura)

- **El arreglo de comisiones es gratis hoy.** `pedidos.vendedor_id` está en
  null en **0 de 16** pedidos, `comision_tramos` está **vacía** y
  `comision_cortes` también: nadie ha cobrado comisión nunca, así que corregir
  el divisor cambia la base de los meses abiertos en **$0.00**. En cuanto se
  asigne un vendedor y se capture una escalera, corregirlo implicaría
  reexpresar meses — por eso se hace ahora.
- `profiles.requiere_factura` **existe**; **6 de 25** clientes la tienen en
  `true`. Es el default del switch en el POS.
- `app_config.impuestos` ya trae `{iva_tasa: 0.16, ieps_tasa: 0.265}`. **No hay
  que crear la llave.**
- `pedidos.incluye_iva` y `pedidos.iva_tasa` **no existen**: los agrega la
  migración.

## Plan por archivo

| # | Archivo | Qué | Estado |
|---|---|---|---|
| 1 | `20261111000000_pedidos_iva.sql` + `_down` | columnas nuevas y redefinición de la vista | escrita, **sin aplicar** |
| 2 | `src/lib/iva.ts` | puro: `ivaDe(base, tasa)` con el mismo `round(...,2)` de la vista, desglose de un pedido. Tests | hecho |
| 3 | `src/lib/metricas.ts` | `FilaSaldo.iva_monto`; venta sin IVA, cobranza con IVA | hecho |
| 4 | `src/lib/comisiones.ts` | fuera el divisor de IVA | hecho |
| 5 | `Carrito.tsx` + `nuevo/page.tsx` | switch, default `requiere_factura`, desglose de 5 renglones | hecho |
| 6 | `crear-pedido.ts` + `/crear` | persiste `incluye_iva` e `iva_tasa` del momento | hecho |
| 7 | nueva ruta `[id]/iva` | prende/apaga con la regla de editar-partidas, aviso de sobrepago, `audit_log` | hecho |
| 8 | `PanelPedido` / `EditPedidoClient` | el switch con su motivo cuando no aplica (`SwitchIva.tsx`) | hecho |
| 9 | `plantilla-pedidos.ts` + `pedidos-importar.ts` | columna `incluye_iva` (Sí/No), vacío = default por cliente | hecho |
| 10 | `pedidos-ui.ts`, `TablaPedidos`, orden Word, portal, export, `reporte.ts` | desglose Subtotal / IVA / Total | hecho |

### Dos cosas que salieron distinto de lo planeado

**El reporte no lleva toggle "con / sin IVA".** La decisión 2 ya dice que todo
lo analítico va sin IVA; un switch que cambiara el significado de "Facturado"
volvería a mezclar las dos unidades, que es justo lo que se quería evitar. El
total con IVA está en su propio renglón.

**El export de clientes sí deja "Total facturado" con IVA**, con una columna
`IVA` al lado. Ese archivo es de cobranza —facturado, cobrado y saldo tienen
que cuadrar entre sí— y restarle el IVA a uno solo de los tres lo descuadra.

### Arreglos que se cayeron de encima

Al tocar los documentos que ve el cliente aparecieron dos que ya estaban mal
antes del IVA, y se corrigieron en el camino:

- El **Word** redondeaba el descuento porcentual a pesos enteros
  (`Math.round(total * pct / 100)`) mientras la vista redondea a centavos. Un
  pedido con descuento porcentual podía imprimir un total distinto del saldo
  que después se le perseguía.
- El **portal** recalculaba el total de tres formas distintas en la misma
  pantalla: el de la cabecera ignoraba el descuento y el de abajo lo redondeaba
  a pesos enteros. Ahora los dos leen `pedidos_saldo`.
- En `/admin/pedidos/[id]/edit`, `Section` estaba declarado dentro del
  componente: React lo trataba como un tipo nuevo en cada render y remontaba el
  nodo. Subirlo bajó ese archivo de 11 errores de eslint a 4.

## Tests

Con y sin IVA · con descuento y con envío combinados · pagos parciales ·
que un cambio de tasa en `app_config` no mueva pedidos viejos · comisión en los
dos casos · que `ivaDe` redondee igual que la vista.

## Fuera de alcance

- No se toca el IEPS: sigue incluido en el precio y su divisor se queda.
- No se reexpresa ningún pedido existente: todos quedan en `incluye_iva=false`.
- El vendedor sigue sin poder editar partidas (ver `20261103100000`); el switch
  de IVA hereda ese mismo criterio.
