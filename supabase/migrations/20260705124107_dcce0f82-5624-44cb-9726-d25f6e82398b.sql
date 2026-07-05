
CREATE TABLE public.weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start DATE NOT NULL,
  code TEXT NOT NULL,
  target INT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_challenges TO authenticated;
GRANT ALL ON public.weekly_challenges TO service_role;
ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own challenges readable" ON public.weekly_challenges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own challenges updatable" ON public.weekly_challenges FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.resolve_weekly_challenges()
RETURNS TABLE(code TEXT, target INT, progress INT, completed BOOLEAN, reward INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  wk DATE := date_trunc('week', now())::date;
  cnt INT;
  ch RECORD;
  p INT;
  reward_v INT := 50;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT COUNT(*) INTO cnt FROM public.weekly_challenges WHERE user_id = uid AND week_start = wk;
  IF cnt = 0 THEN
    INSERT INTO public.weekly_challenges (user_id, week_start, code, target)
    SELECT uid, wk, t.code, t.target FROM (VALUES
      ('send_5_people', 5),
      ('wake_5_days', 5),
      ('streak_send_7', 7),
      ('send_new_person', 1),
      ('send_10_messages', 10)
    ) t(code, target)
    ORDER BY random()
    LIMIT 3
    ON CONFLICT DO NOTHING;
  END IF;

  FOR ch IN
    SELECT wc.code AS c, wc.target AS t, wc.completed_at IS NOT NULL AS done
    FROM public.weekly_challenges wc
    WHERE wc.user_id = uid AND wc.week_start = wk
    ORDER BY wc.created_at
  LOOP
    p := 0;
    IF ch.c = 'send_5_people' THEN
      SELECT COUNT(DISTINCT receiver_id) INTO p FROM public.messages
        WHERE sender_id = uid AND channel_id IS NULL AND created_at >= wk;
    ELSIF ch.c = 'wake_5_days' THEN
      SELECT COUNT(DISTINCT created_at::date) INTO p FROM public.sunbeam_events
        WHERE user_id = uid AND reason = 'wake' AND created_at >= wk;
    ELSIF ch.c = 'streak_send_7' THEN
      SELECT LEAST(COALESCE(up.send_streak, 0), 7) INTO p
        FROM public.user_progress up WHERE up.user_id = uid;
      IF p IS NULL THEN p := 0; END IF;
    ELSIF ch.c = 'send_new_person' THEN
      SELECT COUNT(*) INTO p FROM (
        SELECT receiver_id, MIN(created_at) AS mn FROM public.messages
          WHERE sender_id = uid AND channel_id IS NULL
          GROUP BY receiver_id
      ) firsts WHERE firsts.mn >= wk;
    ELSIF ch.c = 'send_10_messages' THEN
      SELECT COUNT(*) INTO p FROM public.messages
        WHERE sender_id = uid AND channel_id IS NULL AND created_at >= wk;
    END IF;

    IF NOT ch.done AND p >= ch.t THEN
      UPDATE public.weekly_challenges
        SET completed_at = now()
        WHERE user_id = uid AND week_start = wk AND code = ch.c;
      INSERT INTO public.user_progress (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
      UPDATE public.user_progress SET soles = soles + reward_v, updated_at = now() WHERE user_id = uid;
      UPDATE public.user_progress up SET level = public.level_from_soles(up.soles) WHERE up.user_id = uid;
      INSERT INTO public.sunbeam_events (user_id, amount, reason) VALUES (uid, reward_v, 'weekly:' || ch.c);
      code := ch.c; target := ch.t; progress := p; completed := true; reward := reward_v;
    ELSE
      code := ch.c; target := ch.t; progress := p; completed := ch.done; reward := reward_v;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;
