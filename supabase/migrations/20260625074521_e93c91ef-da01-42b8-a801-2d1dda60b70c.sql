ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;