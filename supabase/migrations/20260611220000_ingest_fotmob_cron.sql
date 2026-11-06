-- Daily FotMob refresh: calls the ingest-fotmob edge function every morning
-- with today's and tomorrow's EST dates.
--
-- The job reads two Vault secrets at RUN time (set them once per environment,
-- see DEPLOYMENT.md):
--   edge_base_url     e.g. https://<project-ref>.supabase.co/functions/v1
--   service_role_key  the project's service role key
--
-- Schedule: 09:00 UTC = 5am US Eastern during daylight saving time, which
-- covers the whole World Cup (June–July 2026). pg_cron only speaks UTC; if
-- this ever needs to survive a DST switch, reschedule accordingly.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-fotmob-daily') then
    perform cron.unschedule('ingest-fotmob-daily');
  end if;
end;
$$;

select cron.schedule(
  'ingest-fotmob-daily',
  '0 9 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_base_url')
           || '/ingest-fotmob',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object(
      'mode', 'daily',
      'dates', jsonb_build_array(
        to_char((now() at time zone 'America/New_York')::date, 'YYYYMMDD'),
        to_char((now() at time zone 'America/New_York')::date + 1, 'YYYYMMDD')
      )
    ),
    timeout_milliseconds := 120000
  );
  $job$
);
