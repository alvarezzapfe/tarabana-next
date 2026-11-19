# Ensayos en seco de migraciones

Cada archivo de aquí es la migración del mismo nombre **con `commit;` cambiado
por `rollback;`** y un bloque de verificaciones al final. Se pega completo en
el SQL Editor de Supabase y se corre una vez: siembra datos, los comprueba y
lo revierte todo.

Existen porque este proyecto apunta a una sola instancia de Supabase y no hay
staging (ver `CLAUDE.md`). Un ensayo es la única forma de ejercitar una
migración contra los datos reales sin aplicarla.

## Cómo correrlos

1. **Primero la sonda** (`sonda_transaccion.sql`): comprueba que el SQL Editor
   respete `begin`/`rollback`. Si no lo respeta, un ensayo **aplicaría** la
   migración en vez de ensayarla, y eso es el peor resultado posible de los
   dos. Si la sonda no devuelve `NULL`, no corras nada más.
2. Luego el ensayo. Todo bien = un grid con un renglón por comprobación, todos
   `PASS`. Algo mal = un error con el detalle, y la transacción se aborta sola.

## Reglas que estos archivos aprendieron a golpes

- **Sin meta-comandos de `psql`.** Ni una barra invertida: el SQL Editor no
  entiende `\set`, `\echo` ni `\timing`.
- **Una sola salida.** El editor muestra el resultado del último statement, así
  que las comprobaciones se acumulan en una tabla temporal y salen en un grid.
- **Cada comprobación con número único.** El número es cómo se reporta un
  fallo; dos pruebas distintas con el mismo id vuelven el reporte ambiguo.
- **Ningún cuerpo de función puede nombrar `current_date`**, ni en un
  comentario, si la migración lleva el guard que revisa las funciones con
  `pg_get_functiondef`: esa función devuelve el cuerpo verbatim, comentarios
  incluidos, y el guard se dispara contra la nota que explica el arreglo.
- **Escribe la cuenta completa junto a la expectativa.** Un total esperado que
  se reconstruyó de memoria es un fallo esperando: ver el historial del ensayo
  de la F2, donde `#90` esperaba 500 L porque la cuenta olvidó un lote.
