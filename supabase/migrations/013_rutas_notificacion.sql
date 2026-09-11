-- ============================================================
-- PINTÓ — 013: las notificaciones de mensaje abren la conversación
-- Ejecutar DESPUÉS de 012_push_instantaneo.sql
--
-- Problema: notify_on_business_message() mandaba a '/negocio/mensajes' y
-- a '/mensajes' pelados. Las dos pantallas guardaban la conversación
-- abierta en estado local, no en la URL, así que al tocar la notificación
-- caías en la LISTA de conversaciones y tenías que buscar a mano cuál era
-- la que te acababan de mandar.
--
-- Ahora las rutas llevan el parámetro y las pantallas lo leen:
--   /mensajes?id=<business_id>          (usuario leyendo la respuesta)
--   /negocio/mensajes?user=<user_id>    (negocio leyendo la consulta)
-- ============================================================

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'notify_on_business_message'
  ) THEN
    RAISE EXCEPTION 'Falta notify_on_business_message() → corré 011_push_checkin_blocks.sql primero';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.notify_on_business_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  biz_owner uuid;
  biz_name  text;
  sender_name text;
BEGIN
  SELECT b.owner_user_id, b.name INTO biz_owner, biz_name
  FROM public.businesses b WHERE b.id = NEW.business_id;

  IF NEW.sender_role = 'user' THEN
    SELECT p.full_name INTO sender_name FROM public.profiles p WHERE p.id = NEW.user_id;
    PERFORM public.enqueue_notification(
      biz_owner,
      COALESCE(NULLIF(sender_name, ''), 'Nuevo mensaje'),
      NEW.message,
      -- Abre directamente la conversación con ese cliente
      '/negocio/mensajes?user=' || NEW.user_id,
      jsonb_build_object(
        'type', 'business_message',
        'businessId', NEW.business_id,
        'userId', NEW.user_id)
    );
  ELSE
    PERFORM public.enqueue_notification(
      NEW.user_id,
      COALESCE(NULLIF(biz_name, ''), 'Respuesta del negocio'),
      NEW.message,
      -- Abre directamente la conversación con ese negocio
      '/mensajes?id=' || NEW.business_id,
      jsonb_build_object(
        'type', 'business_reply',
        'businessId', NEW.business_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Las notificaciones que ya estaban encoladas con la ruta vieja siguen
-- llevando a la lista; no vale la pena reescribirlas.
