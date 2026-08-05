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
