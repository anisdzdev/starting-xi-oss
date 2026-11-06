-- Live polling: every 2 minutes, ask poll-live to refresh fixtures near kickoff.
-- The function itself no-ops (single indexed query, no external calls) when no
-- fixture is within kickoff−5min … fulltime+30min, so off-hours cost ~nothing.
--
-- Uses the same Vault secrets as ingest-fotmob-daily:
--   edge_base_url, service_role_key  (see DEPLOYMENT.md)

do $$
begin
  if exists (select 1 from cron.job where jobname = 'poll-live-2min') then
    perform cron.unschedule('poll-live-2min');
  end if;
end;
$$;

select cron.schedule(
  'poll-live-2min',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_base_url')
           || '/poll-live',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
