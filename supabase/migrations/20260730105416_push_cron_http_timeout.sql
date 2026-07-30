-- Give the push cron jobs an HTTP timeout that fits the work they trigger.
--
-- pg_net's default timeout is 5000 ms. Both push jobs called net.http_post
-- without timeout_milliseconds, so they inherited it. That was invisible for
-- weeks because send-push was returning 503 immediately on a malformed VAPID
-- secret -- a fail-fast response arrives well inside 5s. The moment push
-- actually attempts delivery, daily-reminders (which scans profiles and fans
-- out one send-push call per eligible user, on a cold Edge Function boot)
-- exceeds 5s and pg_net records timed_out=true with a NULL status_code. So the
-- cron path could never observe a 2xx even once the keys are correct.
--
-- Observed directly: the first reminder run after the subject fallback shipped
-- timed out at 5001 ms; after this change the same job returns 200.
--
-- Note that cron.job_run_details.status='succeeded' does NOT cover this -- it
-- only means net.http_post was queued. The real outcome lives in
-- net._http_response, where a timeout looks like an empty row rather than an
-- error.
--
-- The command is rewritten from the value already stored in cron.job rather
-- than restated here, because it carries the X-Cron-Secret header inline and
-- that secret must not be committed.
do $$
declare
  j record;
  new_cmd text;
  patched int := 0;
begin
  for j in
    select jobid, jobname, command
      from cron.job
     where command like '%net.http_post%'
       and command not like '%timeout_milliseconds%'
  loop
    new_cmd := regexp_replace(
      j.command,
      '(\s*)body\s*:=',
      E'\\1timeout_milliseconds := 30000,\\1body :='
    );

    if new_cmd = j.command then
      raise exception 'could not patch cron job % (%): no "body :=" argument found',
        j.jobid, j.jobname;
    end if;

    perform cron.alter_job(j.jobid, command => new_cmd);
    patched := patched + 1;
  end loop;

  raise notice 'patched % cron job(s) with timeout_milliseconds', patched;
end $$;
