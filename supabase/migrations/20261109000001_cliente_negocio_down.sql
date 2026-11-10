-- ROLLBACK — cliente_negocio
-- ============================================================
--
-- Deshace 20261109000000_cliente_negocio.sql.
--
-- NO revierte el backfill de `marca_negocio`: esas filas antes tenian NULL y
-- ahora traen la razon social o el full_name. Volver a ponerlas en NULL
-- borraria el unico nombre legible de esos clientes, y no hay forma de
-- distinguir las que relleno la migracion de las que alguien escribio a mano
-- despues. Se quedan — es dato bueno, no basura.
--
-- El backfill de `giro` si se va, porque se va la columna entera.

begin;

drop index if exists public.profiles_giro_idx;

-- Destructivo y al final: esto tira los datos de las siete columnas.
-- `tipo_consumidor` sigue teniendo la version gruesa del giro, asi que la
-- informacion no desaparece del todo; `dias_credito`, `limite_credito`,
-- `horario_recepcion`, `contacto_whatsapp`, `instagram` y `sitio_web` si.
alter table public.profiles
  drop column if exists giro,
  drop column if exists instagram,
  drop column if exists sitio_web,
  drop column if exists contacto_whatsapp,
  drop column if exists horario_recepcion,
  drop column if exists dias_credito,
  drop column if exists limite_credito;

commit;
