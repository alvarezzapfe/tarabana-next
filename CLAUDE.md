@AGENTS.md

## Produccion: tres cosas que se preguntan antes, siempre

Este proyecto apunta a una sola instancia de Supabase: `next dev` en localhost
escribe en **produccion**. No existe un entorno de staging donde equivocarse
gratis.

### 1. Nunca crear usuarios `super_admin` ni `admin` en produccion sin preguntar

Ni temporales, ni "solo para probar", ni aunque se borren en el mismo script.
Crear una cuenta privilegiada es un cambio en la superficie de ataque del
sistema, y esa decision es del dueno del proyecto, no de quien esta probando.

Si una prueba necesita una sesion privilegiada: **preguntar primero y esperar
respuesta**. Alternativas que no requieren permiso:

- Un usuario con rol `vendedor` o `comprador` de prueba, que no tiene
  privilegios sobre nadie mas (ver `scripts/borrar-vendedor-prueba.cjs` y
  `scripts/borrar-comisiones-prueba.cjs`).
- Probar el lado de NEGACION de las policies, que es el que importa para
  seguridad: que un rol sin permiso reciba 401/403 o 0 filas.
- El service client para verificar el modelo de datos, diciendo claramente que
  eso NO prueba las policies porque salta RLS.

### 2. Nunca borrar filas de `audit_log` sin avisar

`audit_log` es el rastro de quien hizo que. Borrar ahi destruye evidencia,
aunque las filas las haya generado una prueba.

Si una prueba dejo entradas en `audit_log`: **decirlo explicitamente, mostrar
cuantas y de quien son, y esperar la indicacion** antes de borrarlas. Lo mismo
aplica a cualquier limpieza automatica: un script de borrado de datos de
prueba no toca `audit_log` por su cuenta.

### 3. "Solo lectura" significa CERO escrituras

**Cuando el usuario diga "solo lectura", no se escribe NADA en produccion, ni
temporalmente ni para revertir. Si una prueba necesita escribir, primero
pregunta.**

Un `update` seguido de su `update` inverso no es una lectura: es dos
escrituras. Y entre las dos pasan cosas que no se revierten — triggers que
corren, `updated_at` que se mueve, un webhook que sale, otra sesion que lee el
estado intermedio. Que al final los datos queden iguales no vuelve la prueba
inocua, solo la vuelve difícil de auditar.

Lo que si se puede hacer en modo solo lectura para probar un trigger o una
vista: leer filas que YA tengan el estado que interesa, o pedir permiso para
crear datos de prueba y decir exactamente que se va a escribir.

Las tres reglas valen igual para datos de prueba que para cualquier otra cosa:
"lo iba a borrar al final" y "lo revierto en el mismo script" no las eximen.
