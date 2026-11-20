-- Adicionales por servicio (ej. uñas: diseños y retiro).
-- Cada servicio guarda sus adicionales como una lista de grupos:
--   [{ "grupo": "Diseños", "multi": false,
--      "opciones": [ { "nombre": "French Nails", "precio": 8, "min": 15 }, ... ] }]
--   multi = true  -> el cliente puede marcar varias opciones del grupo
--   multi = false -> solo una (y puede quitarla)
-- Al reservar, el precio y la duración de la cita ya incluyen lo elegido; el detalle queda en la nota.
-- Las políticas (RLS) de "services" ya cubren la columna nueva.
alter table public.services
  add column if not exists adicionales jsonb not null default '[]'::jsonb;
