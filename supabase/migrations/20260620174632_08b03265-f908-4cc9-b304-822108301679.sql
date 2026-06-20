
-- Birthday + birthday-unlimited flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS birthday_unlimited boolean NOT NULL DEFAULT true;

-- Messages: daily lock column, channel origin, AI flag
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS played_on_date date,
  ADD COLUMN IF NOT EXISTS channel_id uuid,
  ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_receiver_played ON public.messages(receiver_id, is_played, played_on_date, created_at);

-- Patch handle_new_user to capture birthdate from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
  bdate DATE;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'user'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF base_username = '' THEN base_username := 'user'; END IF;

  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;

  BEGIN
    bdate := NULLIF(NEW.raw_user_meta_data->>'birthdate','')::date;
  EXCEPTION WHEN OTHERS THEN
    bdate := NULL;
  END;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, wake_code, birthdate)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
    NEW.raw_user_meta_data->>'avatar_url',
    public.generate_wake_code(),
    bdate
  );

  INSERT INTO public.alarms (user_id, alarm_time, is_active)
  VALUES (NEW.id, '07:00', false);

  RETURN NEW;
END;
$function$;

-- ============ CHANNELS ============
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  tone_prompt text NOT NULL,
  voice text NOT NULL DEFAULT 'alloy',
  cover_emoji text,
  is_official boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.channels TO anon, authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_public_select_official"
ON public.channels FOR SELECT
USING (is_official = true OR created_by = auth.uid());

CREATE TRIGGER trg_channels_touch BEFORE UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Subscriptions
CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  allow_send boolean NOT NULL DEFAULT true,
  allow_receive boolean NOT NULL DEFAULT true,
  share_wake_code boolean NOT NULL DEFAULT false,
  PRIMARY KEY (channel_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_subscriptions TO authenticated;
GRANT ALL ON public.channel_subscriptions TO service_role;
ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs_select_own_or_shared"
ON public.channel_subscriptions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR share_wake_code = true);

CREATE POLICY "subs_insert_own"
ON public.channel_subscriptions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "subs_update_own"
ON public.channel_subscriptions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "subs_delete_own"
ON public.channel_subscriptions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Channel messages
CREATE TABLE IF NOT EXISTS public.channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('audio','text')),
  text_content text,
  audio_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fanned_out boolean NOT NULL DEFAULT false
);

GRANT SELECT, INSERT ON public.channel_messages TO authenticated;
GRANT ALL ON public.channel_messages TO service_role;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chmsg_select_if_subscribed"
ON public.channel_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.channel_subscriptions s
  WHERE s.channel_id = channel_messages.channel_id AND s.user_id = auth.uid()
));

CREATE POLICY "chmsg_insert_if_can_send"
ON public.channel_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.channel_subscriptions s
    WHERE s.channel_id = channel_messages.channel_id
      AND s.user_id = auth.uid()
      AND s.allow_send = true
  )
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_fanout ON public.channel_messages(fanned_out, created_at);

-- Fanout function: copy each new channel_message to messages for every subscriber
-- (one per channel/receiver/day max).
CREATE OR REPLACE FUNCTION public.fanout_channel_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
BEGIN
  WITH pending AS (
    SELECT * FROM public.channel_messages
    WHERE fanned_out = false
    ORDER BY created_at ASC
    LIMIT 500
  ),
  inserted AS (
    INSERT INTO public.messages (sender_id, receiver_id, kind, text_content, audio_path, scheduled_for, channel_id)
    SELECT p.sender_id, s.user_id, p.kind::messages_kind_enum_workaround_unused, p.text_content, p.audio_path,
           CURRENT_DATE, p.channel_id
    FROM pending p
    JOIN public.channel_subscriptions s
      ON s.channel_id = p.channel_id
     AND s.user_id <> p.sender_id
     AND s.allow_receive = true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.receiver_id = s.user_id
        AND m.channel_id = p.channel_id
        AND m.created_at::date = CURRENT_DATE
    )
    RETURNING 1
  ),
  marked AS (
    UPDATE public.channel_messages
    SET fanned_out = true
    WHERE id IN (SELECT id FROM pending)
    RETURNING 1
  )
  SELECT COUNT(*) INTO total FROM inserted;
  PERFORM 1 FROM marked;
  RETURN total;
END;
$$;

-- Note: the cast above is a placeholder. Replace with actual enum cast.
-- We rewrite the function with the correct kind cast:
CREATE OR REPLACE FUNCTION public.fanout_channel_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
  enum_type regtype;
BEGIN
  SELECT atttypid::regtype INTO enum_type
  FROM pg_attribute
  WHERE attrelid = 'public.messages'::regclass AND attname = 'kind';

  EXECUTE format($f$
    WITH pending AS (
      SELECT * FROM public.channel_messages
      WHERE fanned_out = false
      ORDER BY created_at ASC
      LIMIT 500
    ),
    inserted AS (
      INSERT INTO public.messages (sender_id, receiver_id, kind, text_content, audio_path, scheduled_for, channel_id)
      SELECT p.sender_id, s.user_id, p.kind::%s, p.text_content, p.audio_path,
             CURRENT_DATE, p.channel_id
      FROM pending p
      JOIN public.channel_subscriptions s
        ON s.channel_id = p.channel_id
       AND s.user_id <> p.sender_id
       AND s.allow_receive = true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.receiver_id = s.user_id
          AND m.channel_id = p.channel_id
          AND m.created_at::date = CURRENT_DATE
      )
      RETURNING 1
    ),
    marked AS (
      UPDATE public.channel_messages
      SET fanned_out = true
      WHERE id IN (SELECT id FROM pending)
      RETURNING 1
    )
    SELECT (SELECT COUNT(*) FROM inserted) + 0 * (SELECT COUNT(*) FROM marked);
  $f$, enum_type::text) INTO total;
  RETURN total;
END;
$$;

-- Trigger fanout immediately on insert (in addition to any cron)
CREATE OR REPLACE FUNCTION public.trg_fanout_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fanout_channel_messages();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_channel_messages_fanout ON public.channel_messages;
CREATE TRIGGER trg_channel_messages_fanout
AFTER INSERT ON public.channel_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_fanout_on_insert();

-- Seed official channels
INSERT INTO public.channels (slug, name, description, tone_prompt, voice, cover_emoji)
VALUES
  ('estoico', 'Productividad Estoica', 'Despertares con disciplina, foco y filosofía estoica.',
   'Eres un mentor estoico. Escribe 1-2 frases para despertar al usuario con disciplina, foco y serenidad, citando ocasionalmente a Marco Aurelio, Séneca o Epicteto. Tono firme pero amable, en español.',
   'onyx', '🏛️'),
  ('deportivo', 'Mentalidad Deportiva', 'Energía de alto rendimiento para empezar el día como un atleta.',
   'Eres un entrenador de élite. Escribe 1-2 frases breves y enérgicas para despertar al usuario con mentalidad de alto rendimiento deportivo. Tono potente, motivador, en español.',
   'ash', '🏆'),
  ('humor', 'Humor Absurdo', 'Despertares con humor absurdo y surrealista.',
   'Escribe 1-2 frases para despertar al usuario con humor absurdo y surrealista, evitando ofender. Tono ligero, sorprendente, en español.',
   'sage', '🎭'),
  ('zen', 'Mañanas Zen', 'Calma, respiración y presencia para empezar despacio.',
   'Eres una guía zen. Escribe 1-2 frases pausadas que inviten a respirar, observar y comenzar el día con calma. Tono suave, presente, en español.',
   'shimmer', '🌿'),
  ('pop', 'Motivación Pop', 'Frases motivadoras directas con energía pop.',
   'Escribe 1-2 frases motivadoras con energía pop, directas y luminosas, para despertar al usuario. Tono cálido y vibrante, en español.',
   'nova', '✨')
ON CONFLICT (slug) DO NOTHING;
