# Row Level Security (RLS)

## Modelo de tres niveles

Tres funciones `security definer` en SQL, espejeadas por `src/lib/roles.ts` en
el código de la app. Si divergen, un usuario entra al panel pero RLS le vacía
las tablas sin error.

| Función SQL | Roles | Propósito | Helper TS |
|---|---|---|---|
| `is_staff()` | super_admin, admin, ventas, produccion, contabilidad | Acceso de lectura al panel admin (SELECT policies) | `isStaff()` |
| `is_admin()` | super_admin, admin, ventas, produccion | Escritura (INSERT/UPDATE/DELETE policies). **Contabilidad excluido.** | `canWrite()` |
| `is_super_admin()` | super_admin | Gestión de usuarios e invitaciones | `isSuperAdmin()` |

Las tres funciones son `security definer` con `set search_path = public`:
consultan `profiles` con los privilegios del owner (bypasean RLS en profiles),
verifican `active = true`, y solo `authenticated` tiene `EXECUTE`.

## Policies separadas SELECT / write

Cada tabla tiene policies separadas por operación:
- `*_read` / `*_staff_read`: `FOR SELECT ... USING (is_staff())` — contabilidad
  puede leer.
- `*_write` / `*_admin_write`: `FOR ALL ... USING (is_admin())` — solo roles con
  permiso de escritura.

Excepción: `invitaciones` usa `is_super_admin()` para todo.

## Policies de lectura pública separadas anon / authenticated

Las tablas de catálogo (`productos`, `puntos_venta`) necesitan ser legibles tanto
por visitantes no logueados (anon) como por usuarios autenticados. Sin embargo,
`anon` no tiene permiso para ejecutar `is_staff()`, así que meter
`activo = true OR is_staff()` en una sola policy con `TO anon, authenticated`
haría fallar la query completa para anon.

Por eso hay policies separadas:
- `*_read_anon`: `TO anon USING (activo = true)` — visitantes ven solo lo activo.
- `*_read_auth`: `TO authenticated USING (activo = true OR is_staff())` — usuarios
  logueados ven lo activo, staff ve todo.
- `*_write`: `FOR ALL TO authenticated USING (is_admin())` — solo admin puede
  modificar.

`medallero` y `taproom_config` no tienen flag `activo`, así que usan una sola
policy de lectura `TO anon, authenticated USING (true)`.

## Grants de columna en profiles

Después de habilitar RLS, un usuario autenticado con policy `profiles_self_update`
podría hacer `UPDATE profiles SET role = 'super_admin' WHERE id = auth.uid()`.
Para impedirlo:

```sql
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name, phone, ..., onboarding_completo) ON profiles TO authenticated;
```

Las columnas `role`, `active`, `puntos` y `email` quedan fuera del grant.
Solo `service_role` (que bypasea RLS) puede modificarlas.

## Deuda: client components que escriben con anon key

Los siguientes client components hacen INSERT/UPDATE/DELETE directamente contra
Supabase con la anon key desde el browser:

- `app/admin/medallero/MedalleroClient.tsx` — insert/update/delete en medallero
- `app/admin/vendedores/VendedoresClient.tsx` — insert/update/delete en vendedores
- `app/admin/comisiones/ComisionesClient.tsx` — update en comisiones
- `app/admin/taproom/TaproomConfigClient.tsx` — update en taproom_config

La UI esconde los botones con `canEdit`, pero RLS es el único gate real: las
policies `*_write` usan `is_admin()`, que incluye ventas y produccion. Si esos
roles inspeccionan el DOM o llaman a la API directamente, pueden escribir.

**Solución pendiente:** mover estos writes a route handlers con `createServiceClient`
y validación de rol server-side, como ya se hizo con pedidos y puntos de venta.

## Checkout y cancelar usan service_role

`app/api/portal/pedidos/crear/route.ts` y `cancelar/route.ts` operan con
`createServiceClient` (service_role) a propósito. No hay policies de INSERT ni
UPDATE para `authenticated` en `pedidos` / `pedido_items`.

Razones:
- El checkout recalcula precios contra la tabla `productos` server-side.
  No confía en `total`, `precio_unitario` ni `cliente_id` del body.
- El sufijo de precio (`taproom` / `publico`) se deriva de
  `profiles.nivel_precio` en la DB con service_role, no del request.
- Cancelar valida `cliente_id = user.id` y `status = 'pendiente'` en código
  antes de ejecutar el update.

Si en el futuro se quiere abrir INSERT a authenticated vía RLS, el route handler
debe seguir recalculando precios — la policy solo controlaría quién puede insertar,
no la integridad de los montos.

## codigos_postales (catalogo publico)

Tabla con 159k registros del catalogo SEPOMEX. Lectura publica
(`TO anon, authenticated USING (true)`), escritura solo `service_role`.
Se consulta desde el componente `DireccionForm` en el cliente con anon key
para autocompletar colonia, municipio y estado a partir del CP.

## Envio en pedidos

`pedidos.costo_envio` empieza en 0 y se actualiza via
`/api/admin/pedidos/[id]/envio` (PATCH, canWrite). `pedidos_saldo` calcula
saldo sobre `total + costo_envio`. Al agregar flete a un pedido ya pagado,
el saldo se vuelve positivo, lo que es correcto (se necesita un pago
adicional por el envio).

## Modelo de precios (precio por lata)

Los precios de latas se derivan de `precio_lata_publico` y `precio_lata_taproom`:
- Caja 12 = precio_lata × 12
- Caja 24 = precio_lata × 24
- Mix = precio_lata × latas de cada estilo
- Barriles mantienen sus propias columnas (`precio_barril_*`)

Las columnas `precio_caja12_*` y `precio_caja24_*` quedan como legado en la tabla
`productos` — no se leen ni se escriben desde el código, pero existen porque hay
pedidos historicos que las referencian. No borrar.

## nivel_precio (sin grant para authenticated)

`profiles.nivel_precio` determina qué columna de precio ve el cliente en el
catálogo: `'publico'` → `precio_*_publico`, `'taproom'`/`'distribuidor'` →
`precio_*_taproom`.

**No tiene grant para authenticated a propósito.** Solo `service_role` puede
modificarlo (vía `/api/admin/clientes/[id]/nivel-precio`). Si un cliente
pudiera cambiarse a sí mismo el nivel de precio, podría acceder a precios de
mayorista sin autorización. El cambio queda registrado en `audit_log` con
acción `cliente.nivel_precio` y el from/to.

## Pagos (public.pagos)

Tabla de pagos asociados a pedidos. Los pagos **nunca se borran** (hard delete
prohibido). Para corregir errores se hace soft delete con `cancelado_at`,
`cancelado_por` y `cancelado_motivo`.

- **SELECT**: `is_staff()` — contabilidad y todos los roles internos pueden leer
- **INSERT/UPDATE**: `is_admin()` — solo roles con permiso de escritura

La vista `pedidos_saldo` calcula el saldo en tiempo real: `total - sum(pagos
activos)`. Los campos `estado_cobro` y `dias_vencido` se derivan de
`fecha_vencimiento`, que a su vez se calcula por trigger según
`condiciones_pago` ('contado' = inmediato, '15_dias', '30_dias').

Acciones auditadas: `pago.registrar`, `pago.cancelar`, `pago.aplicar`.

## app_config

Configuración global de la app (branding, negocio).

- **SELECT**: `is_staff()` — todos los roles internos leen (el layout necesita
  los colores)
- **INSERT/UPDATE/DELETE**: `is_super_admin()` — solo super admin modifica

Las keys actuales son `'branding'` y `'negocio'`. El endpoint PATCH valida el
shape del JSONB. Cambios auditados como `config.update`.

## Auditoría (audit_log)

Tabla `public.audit_log` con RLS estricto:
- **SELECT**: solo `is_super_admin()` puede leer
- **INSERT**: nadie vía RLS — solo `service_role` escribe

Columnas: `actor_id`, `actor_email`, `actor_role`, `accion`, `entidad`,
`entidad_id`, `detalle` (JSONB), `ip`, `created_at`.

### Escritura

El helper `src/lib/audit.ts` → `logAction()` usa `createServiceClient` para
insertar. Está envuelto en try/catch: si falla, hace `console.error` pero
**nunca rompe el flujo principal**. Se llama fire-and-forget después de que
la acción tenga éxito.

### Acciones instrumentadas

| Acción | Entidad | Route handler |
|---|---|---|
| `pedido.status` | pedidos | `/api/admin/pedidos/[id]/status` |
| `pedido.entregado_sin_stock` | pedidos | `/api/admin/pedidos/[id]/status` — **solo super_admin**, motivo obligatorio. Marca entregado SIN descontar inventario, para pedidos ya entregados cuyo stock se ajustó a mano. El motivo queda en `detalle`. |
| `pedido.iva` | pedidos | `/api/admin/pedidos/[id]/iva` — prende o apaga el IVA. Quedarse en el `requiere_factura` del cliente es de oficina; salirse de ese default pide admin. Guarda antes/después de `incluye_iva` e `iva_tasa`, y el sobrepago si se confirmó uno. |
| `pedido.pago` | pedidos | `/api/admin/pedidos/[id]/pago` |
| `pedido.eliminar` | pedidos | `/api/admin/pedidos/[id]/eliminar` |
| `pedido.crear` | pedidos | `/api/admin/pedidos/crear` |
| `cliente.crear` | profiles | `/api/admin/clientes/crear` |
| `usuario.invitar` | invitaciones | `/api/admin/usuarios/crear` |
| `usuario.toggle` | profiles | `/api/admin/usuarios/[id]/toggle` |
| `usuario.reset_mfa` | profiles | `/api/admin/usuarios/[id]/reset-mfa` |
| `invitacion.eliminar` | invitaciones | `/api/admin/invitaciones/[id]/eliminar` |
| `pdv.crear` | puntos_venta | `/api/admin/puntos-venta` |
| `pdv.editar` | puntos_venta | `/api/admin/puntos-venta/[id]` |
| `pdv.eliminar` | puntos_venta | `/api/admin/puntos-venta/[id]` |

### last_seen_at

`profiles.last_seen_at` se actualiza fire-and-forget en `app/admin/layout.tsx`
con `createServiceClient`, solo si pasaron más de 5 minutos desde el último
update. No bloquea el render del layout.

## Módulo Producción (migración 20261118000000)

### Tres predicados nuevos, espejo de `roles.ts`

Hasta ahora SQL tenía cuatro predicados (`is_staff`, `is_admin`,
`is_super_admin`, `is_vendedor`) y `roles.ts` declaraba encima subconjuntos
más estrechos que **solo existían en TS**, para la UI. Producción necesita
esos subconjuntos en las policies, así que tres bajaron a SQL:

| Función SQL | Helper TS | Roles |
|---|---|---|
| `can_manage_inventory()` | `canManageInventory()` | super_admin, admin, produccion |
| `is_staff_sin_ventas()` | `isStaffSinVentas()` | super_admin, admin, produccion, contabilidad |
| `can_manage_as_admin()` | `canManageAsAdmin()` | super_admin, admin |

La regla de nombres: **cada función SQL es el snake_case exacto de su helper
de `roles.ts`**. Si divergen, un usuario entra a la pantalla y RLS le vacía
las tablas sin error.

Mismo patrón que las otras: `stable`, `security definer`, `search_path`
fijo, `revoke` de public/anon y `grant` a authenticated.

### `lotes` pierde `is_admin()`: ventas ya no escribe producción

Las policies originales (`20260731000000_three_level_roles.sql:68`) eran
`lotes_read = is_staff()` y `lotes_write = is_admin()`. **`is_admin()`
incluye a ventas**, así que ventas podía escribir lotes aunque el sidebar le
esconda Producción (`staffSinVentas`). La UI escondía y RLS permitía.

Las nuevas:

| Tabla | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `lotes` | `is_staff_sin_ventas()` | `can_manage_inventory()` | ninguna — soft-delete vía `deleted_at` |
| `lote_lecturas` | `is_staff_sin_ventas()` | `can_manage_inventory()` | ninguna |
| `lote_envasado` | `is_staff_sin_ventas()` | `can_manage_inventory()` | ninguna |
| `tanques` | `is_staff_sin_ventas()` | `can_manage_as_admin()` (FOR ALL) | igual |
| `lote_eventos` | `is_staff_sin_ventas()` | **ninguna** | ninguna |
| `inventario_movimientos` | `is_staff_sin_ventas()` | **ninguna** | ninguna |
| `lote_folios` | **ninguna** | **ninguna** | ninguna |

Ventas y vendedor reciben 0 filas en todo el módulo. Contabilidad lee todo y
no escribe nada, igual que en Clientes.

### Los dos logs son append-only para `authenticated`

`lote_eventos` e `inventario_movimientos` **no tienen policy de escritura**.
Los escribe `avanzar_lote()` (security definer) con el actor explícito. Un log
que el cliente puede insertar deja de ser evidencia de quién movió qué — el
mismo criterio por el que `audit_log` no se escribe desde el browser.

`lote_folios` tiene RLS encendido y **cero policies**: ni lectura. Es el
contador del consecutivo y solo lo toca el trigger. Bajar un contador a mano
reusaría un folio ya emitido.

### `tanques` es de admin aunque el módulo sea de producción

El CRUD vive en **Configuración → Tanques** (`can_manage_as_admin()`), no en
Producción. Dar de alta un fermentador cambia la capacidad instalada de la
fábrica, que es decisión del dueño; producción los ocupa con sus lotes y los
ve en **Producción → Tanques**, en solo lectura.

El predicado de la pestaña queda dentro del del item padre (Configuración ya
es `canManageAsAdmin`), así que nadie ve una pestaña de una sección a la que
no puede entrar, y coincide con la policy.

### Las funciones del módulo solo las llama `service_role`

```sql
revoke execute on function public.avanzar_lote(...) from public, anon, authenticated;
grant  execute on function public.avanzar_lote(...) to service_role;
```

Mismo criterio que `public.aplicar_pago`. El `grant` a `service_role` va
**explícito**: revocar de `public` quita el EXECUTE heredado, y sin el grant
la única vía de ejecución quedaría cerrada.

`avanzar_lote()` es el único camino para mover la etapa, porque es lo que
valida los requisitos (no envasar sin FG, no liberar sin envasado), respeta
el orden de las etapas, deja el evento con su actor real y —al liberar— mete
la entrada a inventario, todo en **una** transacción. Si la entrada falla, la
etapa tampoco se movió.

### Esta pantalla NO suma a la deuda de writes con anon key

Medallero, Vendedores, Comisiones y Taproom escriben con la anon key desde el
browser (ver la sección de deuda arriba). Producción y el CRUD de tanques
escriben **por route handler** con `createServiceClient` y guard de rol
server-side, como pedidos y puntos de venta. El guard común está en
`app/api/admin/produccion/guard.ts`.

`app/admin/inventario/edit/[id]` sigue en la deuda: por eso
`productos.folio_prefijo` se guarda por su propia ruta
(`/api/admin/inventario/[id]/folio-prefijo`) y no con el Guardar grande de
esa pantalla.

### Entradas nuevas de `audit_log`

| Acción | Entidad | Ruta |
|---|---|---|
| `lote.crear` | lotes | `/api/admin/produccion/lotes` |
| `lote.actualizar` | lotes | `/api/admin/produccion/lotes/[id]` (PATCH) |
| `lote.borrar` | lotes | `/api/admin/produccion/lotes/[id]` (DELETE) — soft-delete |
| `lote.avanzar` | lotes | `/api/admin/produccion/lotes/[id]/avanzar` |
| `lote.liberar` | lotes | igual, cuando la etapa destino es `liberado` |
| `lote.envasado` | lote_envasado | `/api/admin/produccion/lotes/[id]/envasado` |
| `tanque.crear` / `tanque.actualizar` / `tanque.borrar` | tanques | `/api/admin/produccion/tanques[/id]` |
| `producto.folio_prefijo` | productos | `/api/admin/inventario/[id]/folio-prefijo` |

Las **lecturas de la bitácora no escriben `audit_log`** a propósito: una
medición de gravedad es un dato de proceso, no un cambio de estado del
sistema, y su rastro es la propia fila con su `created_by`. Una entrada por
medición diaria ahogaría la bitácora de acciones.

## Producción F2 (migración 20261119000000)

### Policies nuevas

| Tabla | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `recetas` | `is_staff_sin_ventas()` | `can_manage_inventory()` | ninguna |
| `lote_tanque_asignaciones` | `is_staff_sin_ventas()` | **ninguna** | ninguna |

`lote_tanque_asignaciones` es el tercer log append-only del módulo, junto con
`lote_eventos` e `inventario_movimientos`: lo escribe el trigger
`lote_asignacion_trg` (security definer), nunca el cliente. Una historia que
el cliente puede insertar deja de ser evidencia de dónde estuvo cada lote.

`recetas` sin policy de DELETE: una receta se edita, no se borra.

### Vistas nuevas

`inventario_en_camino` y `tanque_ocupacion`, las dos con
`security_invoker = on` y encadenadas sobre `lotes_vista`, así que heredan sus
policies. A ventas y al vendedor les devuelven 0 filas sin necesidad de un
guard aparte — por eso las dos queries del contador del sidebar en
`app/admin/layout.tsx` no llevan chequeo de rol.

### El `returnTo` del QR no es un redirector abierto

`proxy.ts` ahora guarda el destino cuando manda a `/portal` a alguien sin
sesión, para que escanear el QR de un tanque no pierda a dónde iba.

Sigue yendo a `/portal` y **no** a `/tierra-mojada`: la URL del login admin no
se expone, que es la razón original de esa rama. El portal reenvía a
`returnTo` después del login **solo si el perfil puede entrar al panel**; un
comprador con un `returnTo` de `/admin` va a su catálogo.

El valor pasa por `returnToValido()` en `src/lib/return-to.ts`, que acepta
únicamente una ruta relativa que empiece con `/admin/`. Sin esa lista blanca,
un link a `tarabana.mx/portal?returnTo=https://sitio-falso/login` se vería
legítimo —el dominio es el nuestro— y terminaría en una página de captura de
credenciales. Los casos rechazados y por qué están en las pruebas de
`src/lib/return-to.test.ts`: absolutas, `//host` protocol-relative (el bypass
clásico de un filtro que solo revisa que empiece con `/`), backslashes (varios
navegadores los normalizan a `/`), y caracteres de control.

**Hueco conocido:** si alguien ya tiene sesión pero sin AAL2 y escanea un QR,
`proxy.ts` no lo intercepta, `app/admin/layout.tsx` lo manda al verificador
sin destino y termina en `/admin`. Pasa una vez por dispositivo, hasta que la
sesión sea AAL2. Cerrarlo pedía meterle headers al middleware, que es el que
refresca las cookies de sesión, y no pareció un intercambio sensato por un
caso que se resuelve con dos toques.

### Entradas nuevas de `audit_log`

| Acción | Entidad | Ruta |
|---|---|---|
| `receta.crear` / `receta.actualizar` | recetas | `/api/admin/produccion/recetas/[productoId]` (PUT) |
