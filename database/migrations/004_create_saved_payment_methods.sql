-- Stores default payment methods for subscriptions and auto top-ups.
CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('card', 'us_bank_account')),
  last4 TEXT NOT NULL,
  brand TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user_id
  ON public.saved_payment_methods(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_payment_methods_default_per_user
  ON public.saved_payment_methods(user_id)
  WHERE is_default = true;

ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their payment methods"
  ON public.saved_payment_methods
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their payment methods"
  ON public.saved_payment_methods
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their payment methods"
  ON public.saved_payment_methods
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their payment methods"
  ON public.saved_payment_methods
  FOR DELETE
  USING (auth.uid() = user_id);
