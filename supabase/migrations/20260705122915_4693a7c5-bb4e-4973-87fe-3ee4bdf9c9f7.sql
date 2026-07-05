
-- ============ user_progress: estado gamificado por usuario ============
CREATE TABLE public.user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  soles INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  send_streak INT NOT NULL DEFAULT 0,
  send_streak_last_date DATE,
  wake_streak INT NOT NULL DEFAULT 0,
  wake_streak_last_date DATE,
  send_freeze_available BOOLEAN NOT NULL DEFAULT true,
  wake_freeze_available BOOLEAN NOT NULL DEFAULT true,
  freeze_reset_month DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Cada uno ve su propio progreso.
CREATE POLICY "Own progress readable"
  ON public.user_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Amigos aceptados pueden ver el progreso mutuo (mini badges y leaderboard del círculo).
CREATE POLICY "Friends can see each other's progress"
  ON public.user_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = auth.uid() AND f.friend_id = user_progress.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = user_progress.user_id)
        )
    )
  );

-- Sólo el propio usuario puede insertar/actualizar (pero normalmente lo hacen los RPC SECURITY DEFINER).
CREATE POLICY "Own progress upsertable"
  ON public.user_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own progress updatable"
  ON public.user_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ sunbeam_events: ledger de puntos ganados ============
CREATE TABLE public.sunbeam_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sunbeam_events_user_recent_idx
  ON public.sunbeam_events (user_id, created_at DESC);

GRANT SELECT ON public.sunbeam_events TO authenticated;
GRANT ALL ON public.sunbeam_events TO service_role;

ALTER TABLE public.sunbeam_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own events readable"
  ON public.sunbeam_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Amigos ven eventos recientes (para el leaderboard semanal).
CREATE POLICY "Friends can see each other's events"
  ON public.sunbeam_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = auth.uid() AND f.friend_id = sunbeam_events.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = sunbeam_events.user_id)
        )
    )
  );

-- ============ level_from_soles: umbral -> nivel ============
CREATE OR REPLACE FUNCTION public.level_from_soles(_soles INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _soles >= 25000 THEN 6
    WHEN _soles >= 12000 THEN 5
    WHEN _soles >= 5000  THEN 4
    WHEN _soles >= 2000  THEN 3
    WHEN _soles >= 750   THEN 2
    WHEN _soles >= 250   THEN 1
    ELSE 0
  END;
$$;

-- ============ award_soles: sumar puntos y devolver estado ============
CREATE OR REPLACE FUNCTION public.award_soles(_amount INT, _reason TEXT, _ref UUID DEFAULT NULL)
RETURNS TABLE(new_total INT, new_level INT, level_up BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  prev_level INT;
  next_level INT;
  next_total INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    SELECT up.soles, up.level INTO next_total, next_level FROM public.user_progress up WHERE up.user_id = uid;
    IF next_total IS NULL THEN next_total := 0; next_level := 0; END IF;
    RETURN QUERY SELECT next_total, next_level, false;
    RETURN;
  END IF;

  INSERT INTO public.user_progress (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT up.level INTO prev_level FROM public.user_progress up WHERE up.user_id = uid FOR UPDATE;

  UPDATE public.user_progress
     SET soles = soles + _amount,
         updated_at = now()
   WHERE user_id = uid
   RETURNING soles INTO next_total;

  next_level := public.level_from_soles(next_total);

  UPDATE public.user_progress SET level = next_level WHERE user_id = uid;

  INSERT INTO public.sunbeam_events (user_id, amount, reason, ref_id)
  VALUES (uid, _amount, _reason, _ref);

  RETURN QUERY SELECT next_total, next_level, (next_level > COALESCE(prev_level, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_soles(INT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.level_from_soles(INT) TO authenticated;

-- ============ apply_send_event: al enviar un amanecer ============
-- +10 por envío, +25 bonus si es primera vez a esa persona, +2 por día de racha (tope +20).
CREATE OR REPLACE FUNCTION public.apply_send_event(_message_id UUID)
RETURNS TABLE(new_total INT, new_level INT, level_up BOOLEAN, send_streak INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  msg RECORD;
  tz TEXT;
  today DATE;
  yesterday DATE;
  cur_streak INT;
  last_date DATE;
  freeze_avail BOOLEAN;
  is_first_to_receiver BOOLEAN;
  total_award INT := 10;
  streak_bonus INT;
  r RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT m.sender_id, m.receiver_id INTO msg
    FROM public.messages m WHERE m.id = _message_id;
  IF msg IS NULL OR msg.sender_id <> uid THEN
    RAISE EXCEPTION 'Mensaje no válido';
  END IF;

  SELECT COALESCE(p.timezone, 'UTC') INTO tz FROM public.profiles p WHERE p.id = uid;
  today := (now() AT TIME ZONE tz)::date;
  yesterday := today - 1;

  INSERT INTO public.user_progress (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;

  -- Reset freezes mensuales si toca
  UPDATE public.user_progress
     SET send_freeze_available = true, wake_freeze_available = true,
         freeze_reset_month = date_trunc('month', now())::date
   WHERE user_id = uid AND freeze_reset_month <> date_trunc('month', now())::date;

  SELECT send_streak, send_streak_last_date, send_freeze_available
    INTO cur_streak, last_date, freeze_avail
    FROM public.user_progress WHERE user_id = uid FOR UPDATE;

  -- Actualizar racha (sólo primera vez del día)
  IF last_date IS DISTINCT FROM today THEN
    IF last_date = yesterday THEN
      cur_streak := cur_streak + 1;
    ELSIF last_date IS NOT NULL AND last_date < yesterday AND freeze_avail THEN
      -- Consumir freeze: la racha continúa como si no hubiera hueco
      cur_streak := cur_streak + 1;
      freeze_avail := false;
    ELSE
      cur_streak := 1;
    END IF;
    UPDATE public.user_progress
       SET send_streak = cur_streak,
           send_streak_last_date = today,
           send_freeze_available = freeze_avail,
           updated_at = now()
     WHERE user_id = uid;
  END IF;

  -- Bonus por primera vez a esa persona
  SELECT NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.sender_id = uid AND m.receiver_id = msg.receiver_id AND m.id <> _message_id
  ) INTO is_first_to_receiver;
  IF is_first_to_receiver THEN
    total_award := total_award + 25;
  END IF;

  -- Bonus por día de racha (2 por día, tope 20)
  streak_bonus := LEAST(cur_streak * 2, 20);
  total_award := total_award + streak_bonus;

  SELECT * INTO r FROM public.award_soles(total_award, 'send', _message_id);

  RETURN QUERY SELECT r.new_total, r.new_level, r.level_up, cur_streak;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_send_event(UUID) TO authenticated;

-- ============ apply_wake_event: al abrir /wake y escuchar el mensaje del día ============
CREATE OR REPLACE FUNCTION public.apply_wake_event()
RETURNS TABLE(new_total INT, new_level INT, level_up BOOLEAN, wake_streak INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  tz TEXT;
  today DATE;
  yesterday DATE;
  cur_streak INT;
  last_date DATE;
  freeze_avail BOOLEAN;
  award INT := 5;
  streak_bonus INT;
  is_new_day BOOLEAN;
  r RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT COALESCE(p.timezone, 'UTC') INTO tz FROM public.profiles p WHERE p.id = uid;
  today := (now() AT TIME ZONE tz)::date;
  yesterday := today - 1;

  INSERT INTO public.user_progress (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_progress
     SET send_freeze_available = true, wake_freeze_available = true,
         freeze_reset_month = date_trunc('month', now())::date
   WHERE user_id = uid AND freeze_reset_month <> date_trunc('month', now())::date;

  SELECT wake_streak, wake_streak_last_date, wake_freeze_available
    INTO cur_streak, last_date, freeze_avail
    FROM public.user_progress WHERE user_id = uid FOR UPDATE;

  is_new_day := (last_date IS DISTINCT FROM today);

  IF is_new_day THEN
    IF last_date = yesterday THEN
      cur_streak := cur_streak + 1;
    ELSIF last_date IS NOT NULL AND last_date < yesterday AND freeze_avail THEN
      cur_streak := cur_streak + 1;
      freeze_avail := false;
    ELSE
      cur_streak := 1;
    END IF;
    UPDATE public.user_progress
       SET wake_streak = cur_streak,
           wake_streak_last_date = today,
           wake_freeze_available = freeze_avail,
           updated_at = now()
     WHERE user_id = uid;
  END IF;

  IF NOT is_new_day THEN
    -- Ya se contabilizó hoy: no repartir puntos otra vez.
    SELECT up.soles, up.level INTO r.new_total, r.new_level FROM public.user_progress up WHERE up.user_id = uid;
    RETURN QUERY SELECT r.new_total, r.new_level, false, cur_streak;
    RETURN;
  END IF;

  streak_bonus := LEAST(cur_streak * 2, 20);
  award := award + streak_bonus;

  SELECT * INTO r FROM public.award_soles(award, 'wake', NULL);

  RETURN QUERY SELECT r.new_total, r.new_level, r.level_up, cur_streak;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wake_event() TO authenticated;

-- ============ Migración de la racha existente ============
-- Traemos la racha actual de profiles.streak_count como send_streak inicial,
-- pero empezamos con 0 soles para todos (progresión limpia).
INSERT INTO public.user_progress (user_id, send_streak, send_streak_last_date)
SELECT p.id, COALESCE(p.streak_count, 0), p.last_send_date
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;
