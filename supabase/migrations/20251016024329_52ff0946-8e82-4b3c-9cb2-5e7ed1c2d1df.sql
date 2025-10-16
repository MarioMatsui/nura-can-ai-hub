-- Add unique constraint on charge_id for payments table
CREATE UNIQUE INDEX IF NOT EXISTS payments_charge_id_unique ON public.payments(charge_id);