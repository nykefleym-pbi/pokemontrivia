-- friend_requests: defense-in-depth write policies
CREATE POLICY "friend_requests_insert_own"
  ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (from_id = auth.uid());

CREATE POLICY "friend_requests_update_recipient"
  ON public.friend_requests FOR UPDATE TO authenticated
  USING (to_id = auth.uid())
  WITH CHECK (to_id = auth.uid());

CREATE POLICY "friend_requests_delete_involved"
  ON public.friend_requests FOR DELETE TO authenticated
  USING (from_id = auth.uid() OR to_id = auth.uid());

-- mega_runs: ensure RLS + INSERT only for self
ALTER TABLE public.mega_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mega_runs_insert_self"
  ON public.mega_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- friends: replace permissive INSERT with one that requires an accepted friend_request
DROP POLICY IF EXISTS "friends_insert_own" ON public.friends;

CREATE POLICY "friends_insert_accepted"
  ON public.friends FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.from_id = owner_id AND fr.to_id = friend_id)
          OR (fr.from_id = friend_id AND fr.to_id = owner_id)
        )
    )
  );