-- On each new feedback submission, POST the row to the feedback-to-issue Edge
-- Function (via pg_net) so it opens a GitHub issue. Auth is the shared
-- X-Feedback-Secret header, which must match the function's FEEDBACK_WEBHOOK_SECRET
-- secret. pg_net is async, so a failed/misconfigured call never blocks the insert.
--
-- The __FEEDBACK_WEBHOOK_SECRET__ placeholder below is substituted with the real
-- value when this migration is applied (the secret itself is never committed),
-- mirroring how push_cron_jobs handles __PUSH_CRON_SECRET__.
create extension if not exists pg_net;

create or replace function public.feedback_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://dvdorceiasaipdvyfhil.supabase.co/functions/v1/feedback-to-issue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Feedback-Secret', '__FEEDBACK_WEBHOOK_SECRET__'
    ),
    body := jsonb_build_object(
      'id', new.id,
      'category', new.category,
      'message', new.message,
      'trainer_name', new.trainer_name,
      'contact', new.contact,
      'app_version', new.app_version,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists feedback_to_issue_trg on public.feedback;
create trigger feedback_to_issue_trg
  after insert on public.feedback
  for each row execute function public.feedback_to_issue();
