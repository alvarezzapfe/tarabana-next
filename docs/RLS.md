# Row Level Security (RLS)

## is_admin()

Función `security definer` que consulta `profiles` para verificar si el usuario
autenticado tiene rol `super_admin`, `admin` o `ventas` y está activo. Se ejecuta
con los privilegios del owner de la función (bypasea RLS en profiles), lo que
permite usarla como condición en policies de otras tablas sin crear dependencias
circulares.

Solo `authenticated` tiene `EXECUTE`; `anon` y `public` no.

## Policies de lectura pública separadas anon / authenticated

Las tablas de catálogo (`productos`, `puntos_venta`) necesitan ser legibles tanto
por visitantes no logueados (anon) como por usuarios autenticados. Sin embargo,
`anon` no tiene permiso para ejecutar `is_admin()`, así que meter
`activo = true OR is_admin()` en una sola policy con `TO anon, authenticated`
haría fallar la query completa para anon.

Por eso hay policies separadas:
- `*_read_anon`: `TO anon USING (activo = true)` — visitantes ven solo lo activo.
- `*_read_auth`: `TO authenticated USING (activo = true OR is_admin())` — usuarios
  logueados ven lo activo, admins ven todo.
- `*_admin`: `FOR ALL TO authenticated` — admins pueden insertar/actualizar/eliminar.

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
