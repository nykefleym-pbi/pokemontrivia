-- On each new pvp_chat_reports insert, POST the row to the chat-report-to-issue
-- Edge Function (via pg_net) so it opens a GitHub issue for human triage. Auth is
-- the shared X-Chat-Report-Secret header, which must match the function's
-- CHAT_REPORT_WEBHOOK_SECRET secret. pg_net is async, so a failed/misconfigured
-- call never blocks the report insert.
--
-- Copy of feedback_to_issue() (20260707111000_feedback_to_issue_trigger.sql).
-- The __CHAT_REPORT_WEBHOOK_SECRET__ placeholder below is substituted with the
-- real value when this migration is applied (the secret itself is never
-- committed), mirroring how feedback_to_issue handles __FEEDBACK_WEBHOOK_SECRET__.
create extension if not exists pg_net;

create or replace function public.pvp_chat_report_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://dvdorceiasaipdvyfhil.supabase.co/functions/v1/chat-report-to-issue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Chat-Report-Secret', '__CHAT_REPORT_WEBHOOK_SECRET__'
    ),
    body := jsonb_build_object(
      'report_id', new.id,
      'message_id', new.message_id,
      'reporter_id', new.reporter_id,
      'reason', new.reason,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists pvp_chat_report_to_issue_trg on public.pvp_chat_reports;
create trigger pvp_chat_report_to_issue_trg
  after insert on public.pvp_chat_reports
  for each row execute function public.pvp_chat_report_to_issue();
