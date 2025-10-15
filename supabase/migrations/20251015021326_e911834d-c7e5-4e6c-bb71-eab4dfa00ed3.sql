-- Add 'scheduled_cancellation' and 'expired' to subscription_status enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'scheduled_cancellation';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expired';