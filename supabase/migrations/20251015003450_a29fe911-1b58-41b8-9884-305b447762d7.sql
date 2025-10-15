
-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the finalize-cancellations function to run every hour
SELECT cron.schedule(
  'finalize-cancellations-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://dikgmythsvmdbdpjdjmc.supabase.co/functions/v1/finalize-cancellations',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpa2dteXRoc3ZtZGJkcGpkam1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDk5ODUsImV4cCI6MjA3NTY4NTk4NX0.vV2JEubXyScc_bKYcEr0-9CVKdSPtDYCCH6Xek91vbs"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
