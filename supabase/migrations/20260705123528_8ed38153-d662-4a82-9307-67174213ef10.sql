
-- ============ Catalog ============
CREATE TABLE public.achievements (
  code TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  rarity TEXT NOT NULL,
  soles_reward INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements catalog is public"
  ON public.achievements FOR SELECT USING (true);

-- ============ Unlocked per user ============
CREATE TABLE public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  achievement_code TEXT NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, achievement_code)
);
GRANT SELECT, UPDATE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own unlocks"
  ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Update own unlocks (seen)"
  ON public.user_achievements FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ Seed catalog ============
INSERT INTO public.achievements (code, family, title, description, icon, rarity, soles_reward, sort_order) VALUES
  ('first_wake','constancia','Primer amanecer','Abriste tu primer amanecer con la app.','🌅','common',25,5),
  ('streak_wake_7','constancia','Despertar 7','7 días seguidos abriendo tu amanecer.','🌄','common',50,10),
  ('streak_wake_30','constancia','Despertar 30','30 días seguidos abriendo tu amanecer.','🌄','rare',100,20),
  ('first_send','volumen','Primer envío','Enviaste tu primer amanecer.','✉️','common',25,30),
  ('send_10','volumen','10 amaneceres','Enviaste 10 mensajes.','🌤️','common',25,40),
  ('send_50','volumen','50 amaneceres','Enviaste 50 mensajes.','☀️','rare',50,50),
  ('send_250','volumen','250 amaneceres','Enviaste 250 mensajes.','🌟','epic',100,60),
  ('send_1000','volumen','1000 amaneceres','Enviaste 1000 mensajes.','🔆','legendary',200,70),
  ('streak_send_7','constancia','Racha de 7','7 días seguidos enviando.','🔥','common',50,80),
  ('streak_send_30','constancia','Racha de 30','30 días seguidos enviando.','🔥','rare',100,90),
  ('streak_send_100','constancia','Racha de 100','100 días seguidos enviando.','🔥','legendary',200,100),
  ('first_friend','circulo','Primer contacto','Tienes tu primer amigo en el círculo.','👥','common',25,110),
  ('circle_5','circulo','Círculo de 5','5 personas en tu círculo.','🤝','rare',50,120),
  ('circle_15','circulo','Círculo de 15','15 personas en tu círculo.','🌐','epic',100,130),
  ('first_audio','diversidad','Primera voz','Enviaste tu primer mensaje de audio.','🎙️','common',25,140),
  ('first_channel','diversidad','Primer canal','Publicaste en un canal por primera vez.','📡','common',25,150),
  ('level_aurora','especial','Aurora','Alcanzaste el nivel Aurora.','🌤️','common',25,160),
  ('level_solsticio','especial','Solsticio','Alcanzaste el nivel Solsticio.','☀️','rare',50,170),
  ('level_mediodia','especial','Mediodía','Alcanzaste el nivel Mediodía.','🌞','epic',100,180),
  ('level_cenit','especial','Cenit','Alcanzaste el nivel Cenit.','✨','epic',150,190),
  ('level_eterno','especial','Eterno','Alcanzaste el nivel Eterno.','🌠','legendary',200,200);

-- ============ RPC: check & unlock achievements ============
CREATE OR REPLACE FUNCTION public.check_achievements()
RETURNS TABLE(code TEXT, title TEXT, description TEXT, icon TEXT, rarity TEXT, soles_reward INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    CASE WHEN send_count >= 1000 THEN 'send_1000' END,
    CASE WHEN send_streak_v >= 7 THEN 'streak_send_7' END,
    CASE WHEN send_streak_v >= 30 THEN 'streak_send_30' END,
    CASE WHEN send_streak_v >= 100 THEN 'streak_send_100' END,
    CASE WHEN wake_streak_v >= 1 THEN 'first_wake' END,
    CASE WHEN wake_streak_v >= 7 THEN 'streak_wake_7' END,
    CASE WHEN wake_streak_v >= 30 THEN 'streak_wake_30' END,
    CASE WHEN friend_count >= 1 THEN 'first_friend' END,
    CASE WHEN friend_count >= 5 THEN 'circle_5' END,
    CASE WHEN friend_count >= 15 THEN 'circle_15' END,
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

  -- Re-sincroniza el nivel por si algún reward cruzó umbral.
  UPDATE public.user_progress up
     SET level = public.level_from_soles(up.soles)
   WHERE up.user_id = uid;

  RETURN QUERY
    SELECT a.code, a.title, a.description, a.icon, a.rarity, a.soles_reward
    FROM public.achievements a
    WHERE a.code = ANY(unlocked_codes)
    ORDER BY a.sort_order;
END $$;

-- ============ RPC: mark seen ============
CREATE OR REPLACE FUNCTION public.mark_achievement_seen(_code TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_achievements
     SET seen = true
   WHERE user_id = auth.uid() AND achievement_code = _code;
$$;
