-- ============================================================
-- SONDA 1 de 2  —  ¿el SQL Editor respeta begin/rollback?
-- ============================================================
-- Crea UNA tabla vacia y la revierte. No toca ninguna tabla real.
--
-- Resultado esperado si el editor respeta la transaccion:
--     debe_ser_null = NULL   -> el rollback funciono, seguimos con el ensayo
--
-- Si devuelve  _ensayo_tx_probe:
--     el editor hizo commit por statement. NO pegues el ensayo completo.
--     Borra el residuo con la ultima linea (quitale el comentario).
-- ============================================================

begin;
create table public._ensayo_tx_probe (x int);
rollback;

select to_regclass('public._ensayo_tx_probe') as debe_ser_null;

-- Solo si lo de arriba NO salio NULL:
-- drop table if exists public._ensayo_tx_probe;
