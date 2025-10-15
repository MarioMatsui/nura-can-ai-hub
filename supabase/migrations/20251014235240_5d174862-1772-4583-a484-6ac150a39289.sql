-- Add cancel_at column to user_subscriptions
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

-- Create cancellation_requests table
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subscription_id text,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'rejected', 'reverted')),
  effective_cancel_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(subscription_id, status) -- Prevent multiple pending requests per subscription
);

-- Create admin_notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  processed_at timestamptz
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_user_id ON public.cancellation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON public.cancellation_requests(status);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_effective_cancel_at ON public.cancellation_requests(effective_cancel_at);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON public.admin_notifications(type);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_status ON public.admin_notifications(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancel_at ON public.user_subscriptions(cancel_at);

-- Enable RLS
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cancellation_requests
CREATE POLICY "Users can view their own cancellation requests"
  ON public.cancellation_requests
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cancellation requests"
  ON public.cancellation_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cancellation requests"
  ON public.cancellation_requests
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all cancellation requests"
  ON public.cancellation_requests
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all cancellation requests"
  ON public.cancellation_requests
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for admin_notifications
CREATE POLICY "Admins can view all notifications"
  ON public.admin_notifications
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert notifications"
  ON public.admin_notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));