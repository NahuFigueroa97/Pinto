-- 006: Fix campaign delete + message cleanup policy

-- 1. Falta la policy de DELETE para campaigns
CREATE POLICY "campaigns_delete" ON public.campaigns FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_user_id = auth.uid())
    OR public.get_user_role() = 'admin'
  );

-- 2. Auto-limpieza de mensajes: borrar mensajes leídos de más de 24 horas
--    y mensajes no leídos de más de 7 días para evitar llenar la base
CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void AS $$
BEGIN
  -- Mensajes leídos de más de 24h se borran
  DELETE FROM public.business_messages
  WHERE is_read = true AND created_at < now() - interval '24 hours';
  
  -- Mensajes no leídos de más de 7 días se borran
  DELETE FROM public.business_messages
  WHERE created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nota: Para ejecutar esto automáticamente, habilitar la extensión pg_cron en Supabase:
-- SELECT cron.schedule('cleanup-messages', '0 * * * *', 'SELECT public.cleanup_old_messages()');
-- Esto ejecuta la limpieza cada hora.
