-- Create financial_transactions table
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  amount NUMERIC(10, 2) NOT NULL,
  tag TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all transactions"
  ON public.financial_transactions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert transactions"
  ON public.financial_transactions
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update transactions"
  ON public.financial_transactions
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete transactions"
  ON public.financial_transactions
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Create index for faster queries
CREATE INDEX idx_financial_transactions_created_at ON public.financial_transactions(created_at);
CREATE INDEX idx_financial_transactions_type ON public.financial_transactions(type);