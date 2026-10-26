-- =====================================================================
-- eckert.fin · schedule the weekly-digest Edge Function (run once in the SQL editor,
-- after migration 2000 and after deploying supabase/functions/weekly-digest).
-- Uses the same Vault values as automation_schedule.sql (fin_project_url, fin_cron_secret).
--
-- It runs every hour; the function only builds and emails a household's digest at the day and hour
-- chosen in Admin → Weekly digest (default Sunday 5 pm, America/Chicago), once per week.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'fin-weekly-digest';
select cron.schedule('fin-weekly-digest', '5 * * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fin_project_url') || '/functions/v1/weekly-digest',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fin_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000)
$job$);

-- check on it:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'fin-weekly-digest') order by start_time desc limit 5;
--   select started_at, ok, summary from finance.automation_runs where job = 'digest' order by started_at desc limit 5;
