-- 005: Business Messaging
-- Permite a usuarios enviar mensajes a negocios consultando por promos

CREATE TABLE IF NOT EXISTS public.business_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'business')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_biz_messages_business ON public.business_messages(business_id, created_at DESC);
CREATE INDEX idx_biz_messages_user ON public.business_messages(user_id, created_at DESC);
CREATE INDEX idx_biz_messages_unread ON public.business_messages(business_id, is_read) WHERE is_read = false;

ALTER TABLE public.business_messages ENABLE ROW LEVEL SECURITY;

-- Users can see/send their own messages
CREATE POLICY "Users manage own messages"
  ON public.business_messages FOR ALL
  USING (user_id = auth.uid());

-- Business owners can see/send messages for their business
CREATE POLICY "Business owners manage messages"
  ON public.business_messages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_messages.business_id AND b.owner_user_id = auth.uid())
  );
