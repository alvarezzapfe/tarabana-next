-- ============================================================
-- invitaciones: vendedor_id y phone — NO APLICADA AUN
-- ============================================================
--
-- Permite elegir la ficha de vendedor al momento de invitar, en un solo paso.
--
-- Por que hace falta una columna: al invitar todavia no existe el perfil. El
-- flujo es invitar -> fila en `invitaciones` -> la persona activa ->
-- auth.admin.createUser + profiles. Como `vendedores.profile_id` necesita un
-- profiles.id, la ficha no se puede ligar al invitar: se guarda la intencion
-- aqui y /api/invitaciones/activar hace la liga cuando el perfil ya existe.
--
-- Nullable a proposito: solo las invitaciones con rol vendedor la usan.
--
-- on delete set null y no cascade: si alguien borra la ficha antes de que la
-- invitacion se active, la invitacion sigue siendo valida y la persona entra
-- sin ficha; el panel ya avisa en ambar cuando falta. Borrar la invitacion
-- seria perder el acceso por un dato secundario.
-- ============================================================

begin;

alter table public.invitaciones
  add column if not exists vendedor_id uuid references public.vendedores(id) on delete set null;

comment on column public.invitaciones.vendedor_id is
  'Ficha de vendedores a ligar cuando la invitacion se active. Solo para role = vendedor.';

-- Lo consulta /api/admin/usuarios/crear para no ofrecer una ficha que ya
-- esta comprometida en otra invitacion pendiente.
create index if not exists invitaciones_vendedor_id_idx
  on public.invitaciones(vendedor_id) where vendedor_id is not null;

-- Celular del invitado, para copiarlo al perfil cuando active.
--
-- Se llama `phone` igual que profiles.phone, que es su destino, y guarda el
-- mismo formato que usa el alta de clientes: '+52' + 10 digitos. Sin indice:
-- no se busca por este campo, solo se lee junto con la invitacion.
alter table public.invitaciones
  add column if not exists phone text;

comment on column public.invitaciones.phone is
  'Celular del invitado en formato +52XXXXXXXXXX. Se copia a profiles.phone al activar.';

commit;

-- RLS: `invitaciones` ya tiene la policy invitaciones_super (super_admin para
-- todo) y el handler de activacion usa el service client, asi que no hacen
-- falta policies nuevas.
