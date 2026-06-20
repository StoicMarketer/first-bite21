
-- Harden helper functions
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Lock down handle_new_user so it is only callable by the trigger (postgres role)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============ Storage RLS ============
-- wake-audios: sender uploads under {receiver_id}/{message_id}/...; sender & receiver can read
CREATE POLICY "Authenticated can upload wake audio for friends"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wake-audios' AND auth.uid() IS NOT NULL);

CREATE POLICY "Sender or receiver can read wake audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'wake-audios'
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.audio_path = storage.objects.name
        AND (m.sender_id = auth.uid() OR (m.receiver_id = auth.uid() AND (m.scheduled_for <= (now() AT TIME ZONE 'UTC')::date OR m.is_played = true)))
    )
  );

CREATE POLICY "Receiver can delete own wake audio"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'wake-audios'
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.audio_path = storage.objects.name AND m.receiver_id = auth.uid()
    )
  );

-- reactions bucket
CREATE POLICY "Authenticated can upload reactions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reactions' AND auth.uid() IS NOT NULL);

CREATE POLICY "Reaction visible to sender or receiver"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reactions'
    AND EXISTS (
      SELECT 1 FROM public.reactions r
      WHERE r.audio_path = storage.objects.name
        AND (r.sender_id = auth.uid() OR r.receiver_id = auth.uid())
    )
  );
