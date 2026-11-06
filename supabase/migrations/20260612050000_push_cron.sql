-- Automated push windows: every 15 minutes ask send-push to evaluate
-- the T−3h "build your XI" and at-lock "teams are locked" windows.
-- The function exits instantly outside both windows (one indexed query),
-- and the window width equals this interval so each fires once.
--
-- Uses the same Vault secrets as the other jobs: edge_base_url, service_role_key.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'push-windows-15min') then
    perform cron.unschedule('push-windows-15min');
  end if;
end;
$$;

select cron.schedule(
  'push-windows-15min',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_base_url')
           || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"kind":"auto"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
