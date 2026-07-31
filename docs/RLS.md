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
  `profiles.tipo_consumidor` en la DB, no del request.
- Cancelar valida `cliente_id = user.id` y `status = 'pendiente'` en código
  antes de ejecutar el update.

Si en el futuro se quiere abrir INSERT a authenticated vía RLS, el route handler
debe seguir recalculando precios — la policy solo controlaría quién puede insertar,
no la integridad de los montos.
