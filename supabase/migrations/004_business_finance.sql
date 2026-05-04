-- 004: Business Financial Tracking
-- Tabla para registrar ingresos y gastos del negocio

CREATE TABLE IF NOT EXISTS public.business_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_biz_transactions_business ON public.business_transactions(business_id);
CREATE INDEX idx_biz_transactions_date ON public.business_transactions(transaction_date);

-- RLS
ALTER TABLE public.business_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners manage their transactions"
  ON public.business_transactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_transactions.business_id
      AND b.owner_user_id = auth.uid()
    )
  );
