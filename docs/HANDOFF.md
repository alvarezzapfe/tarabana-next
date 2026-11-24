# Handoff — estado del proyecto al 2026-11-23

Qué está vivo en producción, cómo se llegó ahí, y qué falta. Este documento es
el **mapa**; el detalle vive en otro lado y se enlaza desde aquí:

| Para saber | Lee |
|---|---|
| Columnas, triggers, vistas, decisiones de modelado | [`SCHEMA_NOTES.md`](SCHEMA_NOTES.md) |
| Policies, predicados, qué ve cada rol | [`RLS.md`](RLS.md) |
| Reglas de los ensayos en seco | [`../supabase/ensayos/README.md`](../supabase/ensayos/README.md) |
| Las tres reglas sobre producción (usuarios, `audit_log`, "solo lectura") | [`../CLAUDE.md`](../CLAUDE.md) |

> **Este proyecto apunta a una sola instancia de Supabase.** `next dev` en
> localhost escribe en producción. No hay staging. Esa es la razón de ser de
> casi todas las precauciones que siguen.

---

## 1. Qué hay en producción

`main` está en **`92eff41`**, desplegado y verificado (Vercel `Ready`, alias a
`www.tarabana.mx`, `/` en 200 y `/admin` en 307 al portal sin sesión). Next
**16.4.6**, con `eslint-config-next` a la par.

Los merges que componen el estado actual, en orden:

| Commit | Qué entró |
|---|---|
| `34f7bbb` | **F1 Producción** — lotes, tanques, envasado, merma, entrada a inventario |
| `c7b79ae` | **F2 Producción** — móvil, QR por tanque, recetas, alertas, calendario, "en camino" |
| `dd14285` | **Next 16.4.6** — upgrade de seguridad |
| `da9929c` | **fix/pedidos-ancho** — la página no desborda en ventanas sin maximizar |
| `0388610` | **fix/pedidos-tabla-compacta** — la tabla de Pedidos cabe sin scroll desde 1100 px |
| `92eff41` | **fix/tablero-kanban-ancho** — el kanban de Producción cabe sin scroll, con progreso por etapa |

### F1 — el módulo (`34f7bbb`)

`/admin/produccion` con lotes de folio automático (`BRA-26-014`), etapas,
asignación a tanque, lecturas de gravedad, envasado y liberación. Al liberar,
`avanzar_lote()` postea el inventario en una sola transacción, con referencia al
lote para que el movimiento sea rastreable. La merma se calcula en la vista.

Tablas: `tanques`, `lote_folios`, `lote_lecturas`, `lote_envasado`,
`lote_eventos`, `inventario_movimientos`. `lotes` se extendió.

### F2 — lo que lo hace usable donde se hace la cerveza (`c7b79ae`)

Cinco pestañas: **Tablero**, **Calendario**, **Tanques**, **Recetas**,
**Histórico**.

- **Móvil.** El panel entero estaba roto en celular, no solo Producción: el
  sidebar era `position:fixed` de 240 px sin un solo media query, así que a
  390 px al contenido le quedaban 62 px. Se arregló el chrome compartido con un
  cajón off-canvas, y eso destrabó de paso las vistas de tarjetas de Pedidos e
  Inventario, que ya existían y eran código muerto.
- **QR por tanque.** `/admin/produccion/t/FV3` resuelve por nombre (UUID como
  respaldo) y abre una sola pantalla de captura de gravedad. Dos toques.
- **Recetas.** Objetivos de proceso por producto: OG/FG, rango de temperatura,
  días por etapa, levadura.
- **Alertas.** Calculadas en `lotes_vista`; la UI solo pinta.
- **Calendario.** Gantt de ocupación de tanques, 30 días atrás y 45 adelante.
- **"En camino".** Litros proyectados por producto a 14 días, como cuarta
  columna del grupo *Litros* en Inventario.

### Pedidos — los dos arreglos de ancho (`da9929c`, `0388610`)

**`da9929c`** fue la causa raíz, y no era lo que parecía: un item flex no encoge
por debajo del `min-content` de su contenido, así que una tabla ancha dentro de
`<main>` empujaba la página entera. Dos contenedores con `overflow:auto` no lo
evitaron; `minWidth: 0` en `<main>` sí. **El bug era preexistente, no de la F2** —
se midió el chrome de la F2 contra `34f7bbb` y era idéntico pixel a pixel.

**`0388610`** hizo que la tabla cupiera sin scroll desde 1100 px:

- Columnas fusionadas: `folio+fecha`, `total+cobrado+saldo`, `estado+entrega`.
- `Vendedor`, `Litros` y `OC` se ocultan por ancho de **contenedor**
  (`ResizeObserver`), no de viewport. **La elección manual en el menú *Columnas*
  gana** sobre el automático.
- Acciones compactas (`Pagar` + menú `⋯`), padding de celda de 16 a 5 px por lado.
- El scroll horizontal queda solo como red de seguridad bajo 1100 px.

Medido con Playwright — `scrollWidth == clientWidth` en el contenedor:

```
ventana   main    contenedor     tabla   scroll tabla   doc
1100      860     742 / 742      742     no             no
1200      960     842 / 842      842     no             no
1440      1200    1082 / 1082    1082    no             no
```

### Tablero de Producción — el kanban cabe (`92eff41`)

El kanban era un flex de **5 columnas de 260 px fijos**: pedía 1340 px, y a
1100 el contenedor mide 772, así que PLANEADO salía cortado.

Ahora es un **grid**. Las pistas son `minmax(0, 1fr)` y no `1fr` a secas: el
mínimo por defecto de una pista es `auto`, o sea el min-content de su
contenido — la misma causa raíz del desborde de Pedidos. Con el `0` explícito
la pista nunca crece y el contenido se recorta.

- **Las etapas vacías se colapsan** a un riel de 44 px con el título girado y
  su contador. Se fue la caja gris con *"Vacío"*, que gastaba una quinta parte
  del tablero para decir que no había nada.
- **Las etapas con lotes se reparten el resto, con tope de 300 px.** Sin tope,
  con cuatro etapas vacías la quinta llegaba a 888 px y la tarjeta dejaba la
  etiqueta *Tanque* y su valor `FV3` separados por 800 px de nada. El tope va
  en el `max` del `minmax`, así que la columna sigue encogiendo cuando no hay
  espacio: cinco etapas ocupadas a 1100 px dan 145 px cada una.
- **La tarjeta usa las recetas**: barra *"Día 3 de 7"* (gris en tiempo, ámbar
  pasando el objetivo, rojo pasando el doble), *"Fin estimado: 27 nov"* y los
  motivos de alerta como chips cortos con la frase completa en el `title`.
- Fuera el renglón *"N lotes en proceso"*: el KPI **Lotes activos** ya lo dice.
- En celular las columnas se siguen apilando, y una etapa vacía es un renglón
  con su título y su cuenta.

Los umbrales de la barra son un **espejo** de `etapa_vencida` y
`etapa_muy_vencida` de `lotes_vista`; el espejo vive en `progresoEtapa()` y lo
fijan pruebas. Se recalcula en vez de leer `alerta_nivel` porque la barra habla
de UNA etapa y `alerta_nivel` es el máximo de los cuatro motivos: un lote al día
pero con la FG fuera de rango llega en rojo, y pintar la barra de rojo diría que
va tarde cuando no va tarde.

Medido con Playwright — `scrollWidth == clientWidth` en el contenedor del kanban
y en el documento:

```
ventana   main    kanban          scroll kanban   doc
1100      860     772 / 772       no              no
1200      960     872 / 872       no              no
1440      1200    1112 / 1112     no              no
```

El peor caso —las cinco etapas ocupadas, columnas de 145 px— se midió con lotes
**sintéticos inyectados en el cliente en local**, sin escribir nada en
producción. Ahí salieron los dos recortes que se arreglaron: el chip de FG
(quedó `FG fuera`, con tope de 16 caracteres que cuida una prueba) y el `title`
de *"sin lecturas"*.

---

## 2. Migraciones aplicadas

Las dos de Producción están **aplicadas en producción desde el SQL Editor de
Supabase** y verificadas. Cada una tiene su `_down`.

| Archivo | Estado |
|---|---|
| `20261118000000_produccion.sql` (+ `_down`) | aplicada |
| `20261119000000_produccion_f2.sql` (+ `_down`) | aplicada |

No se aplican con `psql` ni con connection string: se pegan completas en el SQL
Editor. Por eso **ninguna puede llevar meta-comandos de `psql`** — ni una barra
invertida.

### Antes de aplicar, siempre el ensayo en seco

`supabase/ensayos/` tiene la migración con `commit;` cambiado por `rollback;` y
un bloque de comprobaciones al final: siembra datos, los verifica y lo revierte
todo. Es la única forma de ejercitar una migración contra datos reales sin
aplicarla, dado que no hay staging.

**Corre primero `sonda_transaccion.sql`.** Comprueba que el SQL Editor respete
`begin`/`rollback`. Si no lo respeta, un ensayo *aplicaría* la migración en vez
de ensayarla — el peor resultado posible de los dos.

Las reglas completas (y las cicatrices que las produjeron) están en
[`../supabase/ensayos/README.md`](../supabase/ensayos/README.md). Las dos que
más caro costaron:

- **`pg_get_functiondef` devuelve el cuerpo verbatim, comentarios incluidos.**
  Un guard que busca `current_date` en las funciones se dispara contra el
  comentario que *explica* el arreglo. `pg_get_viewdef` no se comporta así.
- **Escribe la cuenta completa junto a la expectativa.** Un total reconstruido
  de memoria es un fallo esperando.

---

## 3. Scripts de screenshots

Playwright + Chromium headless. Existen porque un PNG no distingue un desborde
de 200 px de uno de 10: estos **miden** y además fotografían.

`.playwright-session.json` y `shots/` están en `.gitignore` — el primero trae
cookies de sesión reales.

### Uso

```bash
npm run dev                        # tiene que estar corriendo
node scripts/shots-login.mjs       # UNA vez: abre Chromium visible, entras a mano
node scripts/shots-pedidos.mjs     # Pedidos a 1100, 1200, 1440
node scripts/shots-produccion.mjs  # las 5 pestañas + ficha + modal + móvil
node scripts/shots-tablero.mjs     # el kanban a 1100, 1200, 1440
open shots/pedidos shots/produccion
```

| Script | Qué hace |
|---|---|
| `shots-login.mjs` | Abre Chromium **visible** para que inicies sesión a mano y vuelca las cookies a disco. Existe porque el panel exige MFA (AAL2): no hay forma de autenticarse desde un script sin tu segundo factor. Detecta solo cuándo llegaste a `/admin`. |
| `shots-pedidos.mjs` | Mide el **contenedor** de la tabla a 1100/1200/1440 y falla si `scrollWidth != clientWidth`. Deja `medidas.json`. |
| `shots-produccion.mjs` | 8 vistas: las 5 pestañas, la ficha de `CAR-26-001`, el modal de Nuevo lote y el tablero a 390 px. Reporta desborde, filas, diálogos y errores de consola. |
| `shots-tablero.mjs` | Mide el **contenedor del kanban** (`.tb-cols`) a 1100/1200/1440 y falla si desborda, si desborda el documento, o si una tarjeta desborda su columna (eso último delata una elipsis que falta). Imprime el ancho de cada pista, que es lo que prueba que las columnas vacías se colapsaron. Deja `medidas-tablero.json`. |
| `shots.mjs <etiqueta>` | Genérico, a 1440 y 390. La etiqueta va en el nombre del archivo, para **comparar dos versiones del código** con `git checkout <sha> -- app/admin`. |

Los cuatro de medición salen con código ≠ 0 si algo desborda o si la sesión cayó
al portal — o sea, sirven en CI y no solo a ojo.

---

## 4. Decisiones tomadas

### Recetas: una por producto

`unique(producto_id)`. **No hay versionado**: un lote viejo ve la receta
vigente, no la que tenía cuando se coció. Se aceptó a sabiendas; si algún día
importa la trazabilidad histórica de la receta, es un cambio de modelo, no un
parche.

Un `null` en una receta **no es un cero**: significa "sin objetivo", y las
reglas de alerta que dependen de ese campo no disparan. Eso se muestra en la
tarjeta como *"sin receta"* en vez de esconderse.

### Umbrales de alerta: constantes en la vista SQL

Una sola verdad. La UI pinta `alerta_nivel` y `alerta_motivos`; el contador del
sidebar es un `count`. El copy vive en TS, los números en SQL.

| Regla | Nivel |
|---|---|
| En `fermentacion` y sin lectura hace > 48 h (o nunca) | ámbar |
| Días en etapa > objetivo de la receta | ámbar; **rojo** si pasa del doble |
| FG fuera de `fg_obj ± 0.003` | rojo |
| Merma > 10 % | rojo |

`alerta_nivel` es el máximo de lo que aplique.

### `returnTo`: lista blanca, no "cualquier ruta"

Nació del QR: escanear el de FV3 sin sesión mandaba a `/portal` y el destino se
perdía, así que el cervecero acababa en el portal de clientes.

Solo se acepta una ruta **relativa que empiece con `/admin/`**. Un parámetro de
redirección abierto es un ataque de phishing con nuestro propio dominio de
fachada. Se rechazan URLs absolutas, `//host` (protocol-relative, el bypass
clásico de un filtro que solo mira el primer `/`), backslashes y caracteres de
control. Ver `src/lib/return-to.ts`, que lo documenta caso por caso.

La cadena **nunca expone la URL del login admin** (`/tierra-mojada`), que es una
restricción de diseño explícita del proxy:

```
/admin/produccion/t/FV3  (sin sesion)
  -> /portal?returnTo=/admin/produccion/t/FV3
  -> login; si el perfil puede entrar al panel, empuja a returnTo
  -> /tierra-mojada/verificar?returnTo=...   (si falta AAL2)
  -> /admin/produccion/t/FV3
```

### Cajón móvil

Breakpoint único **`MOVIL_MAX = 860`** en `app/admin/dash-ui.ts`, con barra
superior de `ALTO_BARRA_MOVIL = 52` y cajón de 264 px. **No se reescribieron los
11 breakpoints que ya existían** en el proyecto (560/640/720/760/767/768/900/
1020/1080/1100); la constante nueva es solo para el código nuevo.

Tres trampas que hay que respetar al tocar esto:

- El estado del cajón **no** puede venir de `localStorage`. El sidebar lee
  preferencias con `useSyncExternalStore` y snapshot de servidor `false`; meter
  ahí el cajón arriesga un desajuste de hidratación. Va en estado de React, sin
  persistir.
- `app/admin/reporte/reporte-ui.ts` cancela el padding del layout con
  `margin: -36px -44px`. Si cambia el padding móvil, ese archivo necesita su
  variante.
- La barra con la hamburguesa **tiene que llevar `.no-print`**, o se imprime
  encima del reporte. El `@media print` apaga el chrome con
  `aside, .no-print { display:none !important }`.

### Decisiones transversales

- **QR solo en servidor.** La hoja sale como `<svg>` inline (`qrcode@^1.5.4`):
  cero JS de cliente, cero red al imprimir.
- **Fechas con `public.hoy_mx()` y `public.fecha_mx()`**, nunca `current_date`
  ni `::date`, que se evalúan en UTC / la TZ de sesión. La F1 reintrodujo este
  bug que el proyecto ya había arreglado una vez; la F2 lo corrigió y dejó un
  guard que aborta la migración si reaparece en 6 funciones o 3 vistas.
- **Inputs numéricos con `type="text"` + `inputMode`**, nunca `type="number"`:
  las flechas pelean con la navegación. Convención preexistente del proyecto.
- **El color es señal, no decoración.** Las etapas no se pintan de siete colores.

---

## 5. Pendientes

> **Las recetas ya están capturadas: 11 de 11 productos activos** (verificado
> en la pestaña Recetas, que lo dice en su propio encabezado). Con eso se cayó
> el único bloqueante que tenía este documento: el Calendario y *"Próximos 14
> días"* ya proyectan, las cuatro reglas de alerta pueden disparar, y el
> tablero pinta progreso y fecha de fin. `lotes` = 2, `tanques` = 10.

- **Negación sobre `recetas`: el lado `anon` ya está probado y pasa**
  (2026-11-23). Con la anon key y sin sesión, `GET /rest/v1/recetas` devuelve
  **HTTP 200 con `[]` — 0 de 11 filas**. Las policies de la tabla son las tres
  `to authenticated`, así que el rol `anon` no tiene ninguna y RLS no le deja
  ver nada.

  Lo que hace que este 0 signifique algo es el **control**: la misma lectura
  con la service role key devuelve **11 filas**, así que la tabla no está
  vacía. Ese control SALTA RLS por diseño y no prueba ninguna policy — solo
  descarta que el 0 sea falta de datos, que es justo lo que volvía inconclusa
  esta prueba cuando `recetas` tenía 0 filas. El 200 (y no 401) confirma de
  paso que la anon key sí se aceptó: lo que la detiene es la policy, no una
  credencial inválida. Las dos lecturas son `GET`; no se escribió nada.

  **Lo que NO cubre:** el lado de un usuario *autenticado pero sin permiso*.
  La policy es `for select to authenticated using (is_staff_sin_ventas())`, o
  sea que un `vendedor` o un rol de ventas con sesión también debería ver 0, y
  eso sigue sin probarse porque pide una sesión de prueba. Es el pendiente que
  queda de este punto.
- El panel arrastra **11 breakpoints distintos**. Consolidarlos es trabajo real
  y se dejó fuera de alcance a propósito.
- `productos.updated_at` **no se mantiene** y no sirve para saber cuándo cambió
  un producto (ver `SCHEMA_NOTES.md`).
