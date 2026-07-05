-- 1) Nuevos logros en el catálogo
INSERT INTO public.achievements (code, family, title, description, icon, rarity, soles_reward, sort_order) VALUES
  ('send_500',        'volumen',    '500 amaneceres',   'Has enviado 500 amaneceres',      '🌠', 'epic',      75,  25),
  ('circle_30',       'circulo',    'Círculo de 30',    '30 personas en tu círculo',       '🌍', 'legendary', 200, 45),
  ('streak_wake_100', 'constancia', 'Despertar 100',    '100 días seguidos despertando',   '🌄', 'legendary', 200, 15)
ON CONFLICT (code) DO NOTHING;

-- 2) Actualizar check_achievements para reconocer los tres nuevos
CREATE OR REPLACE FUNCTION public.check_achievements()
 RETURNS TABLE(code text, title text, description text, icon text, rarity text, soles_reward integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  send_count INT;
  wake_streak_v INT;
  send_streak_v INT;
  lvl INT;
  friend_count INT;
  has_audio BOOLEAN;
  has_channel BOOLEAN;
  candidate TEXT;
  candidates TEXT[];
  unlocked_codes TEXT[] := ARRAY[]::TEXT[];
  reward INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT COUNT(*) INTO send_count FROM public.messages WHERE sender_id = uid AND channel_id IS NULL;
  SELECT up.send_streak, up.wake_streak, up.level INTO send_streak_v, wake_streak_v, lvl
    FROM public.user_progress up WHERE up.user_id = uid;
  send_streak_v := COALESCE(send_streak_v, 0);
  wake_streak_v := COALESCE(wake_streak_v, 0);
  lvl := COALESCE(lvl, 0);
  SELECT COUNT(*) INTO friend_count
    FROM public.friendships
    WHERE status = 'accepted' AND (user_id = uid OR friend_id = uid);
  SELECT EXISTS(SELECT 1 FROM public.messages WHERE sender_id = uid AND kind = 'audio') INTO has_audio;
  SELECT EXISTS(SELECT 1 FROM public.channel_messages WHERE sender_id = uid) INTO has_channel;

  candidates := ARRAY[
    CASE WHEN send_count >= 1 THEN 'first_send' END,
    CASE WHEN send_count >= 10 THEN 'send_10' END,
    CASE WHEN send_count >= 50 THEN 'send_50' END,
    CASE WHEN send_count >= 250 THEN 'send_250' END,
    CASE WHEN send_count >= 500 THEN 'send_500' END,
    CASE WHEN send_count >= 1000 THEN 'send_1000' END,
    CASE WHEN send_streak_v >= 7 THEN 'streak_send_7' END,
    CASE WHEN send_streak_v >= 30 THEN 'streak_send_30' END,
    CASE WHEN send_streak_v >= 100 THEN 'streak_send_100' END,
    CASE WHEN wake_streak_v >= 1 THEN 'first_wake' END,
    CASE WHEN wake_streak_v >= 7 THEN 'streak_wake_7' END,
    CASE WHEN wake_streak_v >= 30 THEN 'streak_wake_30' END,
    CASE WHEN wake_streak_v >= 100 THEN 'streak_wake_100' END,
    CASE WHEN friend_count >= 1 THEN 'first_friend' END,
    CASE WHEN friend_count >= 5 THEN 'circle_5' END,
    CASE WHEN friend_count >= 15 THEN 'circle_15' END,
    CASE WHEN friend_count >= 30 THEN 'circle_30' END,
    CASE WHEN has_audio THEN 'first_audio' END,
    CASE WHEN has_channel THEN 'first_channel' END,
    CASE WHEN lvl >= 1 THEN 'level_aurora' END,
    CASE WHEN lvl >= 3 THEN 'level_solsticio' END,
    CASE WHEN lvl >= 4 THEN 'level_mediodia' END,
    CASE WHEN lvl >= 5 THEN 'level_cenit' END,
    CASE WHEN lvl >= 6 THEN 'level_eterno' END
  ];

  FOREACH candidate IN ARRAY candidates LOOP
    IF candidate IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = uid AND achievement_code = candidate) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.user_achievements (user_id, achievement_code)
      VALUES (uid, candidate)
      ON CONFLICT DO NOTHING;
    SELECT a.soles_reward INTO reward FROM public.achievements a WHERE a.code = candidate;
    IF reward IS NOT NULL AND reward > 0 THEN
      INSERT INTO public.user_progress (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
      UPDATE public.user_progress SET soles = soles + reward, updated_at = now() WHERE user_id = uid;
      INSERT INTO public.sunbeam_events (user_id, amount, reason, ref_id)
        VALUES (uid, reward, 'achievement:' || candidate, NULL);
    END IF;
    unlocked_codes := unlocked_codes || candidate;
  END LOOP;

  UPDATE public.user_progress up
     SET level = public.level_from_soles(up.soles)
   WHERE up.user_id = uid;

  RETURN QUERY
    SELECT a.code, a.title, a.description, a.icon, a.rarity, a.soles_reward
    FROM public.achievements a
    WHERE a.code = ANY(unlocked_codes)
    ORDER BY a.sort_order;
END $function$;