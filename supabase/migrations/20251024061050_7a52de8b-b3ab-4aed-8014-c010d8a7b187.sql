-- Remove the old unique constraint on user_id that prevents multiple plans
ALTER TABLE user_plans DROP CONSTRAINT IF EXISTS user_plans_user_id_key;

-- Verify our new constraints are in place
-- The subscription_id unique index allows multiple plans per user
-- The user_id free plan index ensures only one free plan per user