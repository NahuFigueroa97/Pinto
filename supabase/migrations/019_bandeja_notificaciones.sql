-- ============================================================
-- PINTÓ — 019: Bandeja de notificaciones
-- Ejecutar DESPUÉS de 018_limites_abuso.sql
--
-- Hasta ahora la app no tenía memoria de lo que te pasó. Si llegaba el aviso
-- de "X quiere sumarse a tu plan" y lo deslizabas sin abrirlo, se perdía: no
-- había ninguna pantalla donde volver a encontrarlo. La solicitud existía
-- sólo adentro del detalle de ese plan, y había que acordarse de cuál era.
--
-- Es la diferencia estructural con cualquier app social: en Instagram el
-- corazón, en Twitter la campanita, en WhatsApp la lista de chats. Siempre
-- hay un lugar donde vive lo que te pasó.
--
-- Los datos ya estaban en notification_queue —título, cuerpo, ruta, fecha—;
-- lo único que faltaba era saber qué leíste.
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.notification_queue') IS NULL THEN
    RAISE EXCEPTION 'Falta 011_push_checkin_blocks.sql';
  END IF;
END;
$preflight$;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- El contador de no leídos se consulta seguido y en cada arranque. Un índice
-- parcial sólo indexa las que faltan leer, que son pocas por persona.
CREATE INDEX IF NOT EXISTS idx_notif_queue_sin_leer
  ON public.notification_queue (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ============================================================
-- MARCAR COMO LEÍDAS
--
-- Hace falta un UPDATE, y la única policy que había era de SELECT. Se acota
-- a las filas propias y a la columna que importa: el resto lo escriben los
-- triggers del servidor, no el cliente.
-- ============================================================

DROP POLICY IF EXISTS "notif_queue_update_own" ON public.notification_queue;
CREATE POLICY "notif_queue_update_own" ON public.notification_queue FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

/**
 * Marca como leídas. Sin argumento, todas; con ids, sólo esas.
 *
 * Devuelve cuántas cambiaron, para que la UI pueda decidir si vale la pena
 * refrescar el contador.
 */
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cuantas int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;

  UPDATE public.notification_queue
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND (p_ids IS NULL OR id = ANY (p_ids));

  GET DIAGNOSTICS v_cuantas = ROW_COUNT;
  RETURN v_cuantas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

/** Cuántas sin leer. Lo usa el globito de la barra de navegación. */
CREATE OR REPLACE FUNCTION public.unread_notification_count()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(count(*), 0)::int
  FROM public.notification_queue
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.unread_notification_count() TO authenticated;

-- ============================================================
-- RETENCIÓN
--
-- La limpieza de 015 borra la cola a los 30 días mirando `created_at`. Eso
-- sigue estando bien para la bandeja: una notificación de hace un mes ya no
-- le sirve a nadie, y el plan al que apunta seguramente ya pasó.
-- ============================================================
