-- ============================================================
-- PINTÓ — 017: Privacidad del grafo social y conteo de miembros
-- Ejecutar DESPUÉS de 016_chat_vistos.sql
--
-- "En el feed sale quién se une a cuál plan, debería ser secreto."
--
-- Es correcto, y el feed era apenas la parte visible. La policy
-- `members_select USING (true)` dejaba que CUALQUIERA —incluso sin sesión—
-- listara todos los miembros de todos los planes. O sea: con una sola
-- consulta se bajaba el grafo social completo de la ciudad, quién sale con
-- quién y a dónde. Tapar la línea del feed y dejar eso abierto no habría
-- arreglado nada.
-- ============================================================

DO $preflight$
BEGIN
  IF to_regclass('public.social_plan_members') IS NULL
     OR to_regclass('public.activity_feed') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas (003_sprint2.sql, 008_v3_features.sql)';
  END IF;
END;
$preflight$;

-- ============================================================
-- 1. CONTEO DE MIEMBROS DENORMALIZADO
--
-- Los listados mostraban "3/6" embebiendo las filas de miembros sólo para
-- contarlas: `members:social_plan_members(id)`. Eso es una unión y una fila
-- por participante por cada plan de la lista, en seis pantallas distintas,
-- para mostrar un número. Con la policy nueva además dejaría de funcionar
-- para quien no es miembro.
--
-- Un entero mantenido por trigger cuesta lo mismo con 10 planes que con
-- 100.000, y no filtra nada.
-- ============================================================

ALTER TABLE public.social_plans
  ADD COLUMN IF NOT EXISTS members_count int NOT NULL DEFAULT 0;

UPDATE public.social_plans sp
SET members_count = (
  SELECT count(*) FROM public.social_plan_members m WHERE m.plan_id = sp.id
);

CREATE OR REPLACE FUNCTION public.update_plan_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'creator' THEN
      UPDATE public.profiles SET plans_created_count = plans_created_count + 1 WHERE id = NEW.user_id;
    ELSE
      UPDATE public.profiles SET plans_joined_count = plans_joined_count + 1 WHERE id = NEW.user_id;
    END IF;
    UPDATE public.social_plans SET members_count = members_count + 1 WHERE id = NEW.plan_id;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'creator' THEN
      UPDATE public.profiles SET plans_created_count = GREATEST(0, plans_created_count - 1) WHERE id = OLD.user_id;
    ELSE
      UPDATE public.profiles SET plans_joined_count = GREATEST(0, plans_joined_count - 1) WHERE id = OLD.user_id;
    END IF;
    UPDATE public.social_plans SET members_count = GREATEST(0, members_count - 1) WHERE id = OLD.plan_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- 2. QUIÉN PUEDE VER LA LISTA DE MIEMBROS
--
-- Sólo los del plan. Para el resto, el plan existe y dice cuánta gente va,
-- pero no quién.
--
-- OJO: la policy NO puede consultar social_plan_members directamente —una
-- policy sobre una tabla que lee esa misma tabla entra en recursión
-- infinita y Postgres corta con "infinite recursion detected in policy".
-- Por eso el EXISTS va adentro de una función SECURITY DEFINER, que no
-- vuelve a pasar por RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_plan_participant(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.social_plan_members m
      WHERE m.plan_id = p_plan_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.social_plans p
      WHERE p.id = p_plan_id AND p.creator_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_plan_participant(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS "members_select" ON public.social_plan_members;
CREATE POLICY "members_select" ON public.social_plan_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_plan_participant(social_plan_members.plan_id)
  );

-- ============================================================
-- 3. EL FEED DEJA DE PUBLICAR QUIÉN SE UNE A QUÉ
--
-- Crear un plan público es un acto deliberado: la persona eligió que se
-- viera. Sumarse a uno no lo es — y sin embargo se publicaba con nombre y
-- título del plan, para todo el mundo.
--
-- El feed queda solo con la creación de planes públicos, que es lo único
-- que alguien eligió hacer público.
-- ============================================================

DROP TRIGGER IF EXISTS on_member_joined_feed ON public.social_plan_members;
DROP FUNCTION IF EXISTS public.feed_on_member_join();

DELETE FROM public.activity_feed WHERE action = 'joined_plan';

-- Un feed de actividad social no tiene por qué ser legible sin sesión.
DROP POLICY IF EXISTS "feed_select" ON public.activity_feed;
CREATE POLICY "feed_select" ON public.activity_feed FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 4. ÍNDICE PARA EL LISTADO DE PLANES
--
-- /planes filtra siempre por status='open' AND visibility='public' y ordena
-- por plan_date. Un índice parcial con exactamente esas condiciones es
-- chico —sólo los planes vigentes— y evita el recorrido completo cuando la
-- tabla acumule el histórico.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_social_plans_listado
  ON public.social_plans (plan_date, created_at DESC)
  WHERE status = 'open' AND visibility = 'public';

-- El chat pagina por created_at dentro de un plan; el índice ya existe
-- (idx_chat_plan en 008), así que la consulta incremental es un rango.
