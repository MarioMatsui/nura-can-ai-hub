-- Delete subscription that should have been finalized
DELETE FROM user_subscriptions 
WHERE id = '711f8aff-4442-43e3-bda7-4a427bd50ada';

-- Delete the corresponding cancellation request
DELETE FROM cancellation_requests
WHERE subscription_id = '711f8aff-4442-43e3-bda7-4a427bd50ada';