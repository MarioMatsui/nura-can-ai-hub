-- First, let's identify and keep only the most recent subscription for each plan_type
-- We'll update old duplicates to 'canceled' status instead of deleting them (for audit purposes)

WITH ranked_plans AS (
  SELECT 
    id,
    user_id,
    plan_type,
    subscription_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, plan_type, status
      ORDER BY created_at DESC
    ) as rn
  FROM user_plans
  WHERE status = 'active'
)
UPDATE user_plans
SET 
  status = 'canceled',
  updated_at = now()
FROM ranked_plans
WHERE 
  user_plans.id = ranked_plans.id
  AND ranked_plans.rn > 1;

-- Add a unique constraint to prevent multiple active subscriptions of the same type per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_plans_unique_active 
ON user_plans (user_id, plan_type, status) 
WHERE status = 'active';

-- Comment explaining the constraint
COMMENT ON INDEX idx_user_plans_unique_active IS 
'Prevents a user from having multiple active subscriptions of the same plan type. Historical canceled/expired subscriptions are allowed.';
