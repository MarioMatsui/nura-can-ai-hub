-- Drop all unique indexes on user_id that prevent multiple plans
DROP INDEX IF EXISTS idx_user_plans_user_id CASCADE;
DROP INDEX IF EXISTS user_plans_user_id_idx CASCADE;

-- Verify our correct indexes are in place
-- subscription_id unique index (allows multiple plans per user)
CREATE UNIQUE INDEX IF NOT EXISTS user_plans_subscription_id_key 
ON user_plans(subscription_id) 
WHERE subscription_id IS NOT NULL;

-- user_id free plan index (only one free plan per user)
CREATE UNIQUE INDEX IF NOT EXISTS user_plans_user_id_free_key 
ON user_plans(user_id) 
WHERE subscription_id IS NULL;