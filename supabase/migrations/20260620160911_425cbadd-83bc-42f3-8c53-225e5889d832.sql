
-- ============ ENUMS ============
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE public.message_kind AS ENUM ('audio', 'text');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  streak_count INTEGER NOT NULL DEFAULT 0,
  last_send_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are visible to authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ FRIENDSHIPS ============
CREATE TABLE public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id <> friend_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see friendships involving them" ON public.friendships
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can request friendship as themselves" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Receiver can update status" ON public.friendships
  FOR UPDATE TO authenticated USING (auth.uid() = friend_id OR auth.uid() = user_id);
CREATE POLICY "Either side can delete friendship" ON public.friendships
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ============ ALARMS ============
CREATE TABLE public.alarms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  alarm_time TIME NOT NULL DEFAULT '07:00',
  is_active BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  next_trigger_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alarms TO authenticated;
GRANT ALL ON public.alarms TO service_role;
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their alarms and friends' alarms" ON public.alarms
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = auth.uid() AND f.friend_id = alarms.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = alarms.user_id))
    )
  );
CREATE POLICY "Users manage own alarm" ON public.alarms
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.message_kind NOT NULL,
  audio_path TEXT,
  text_content TEXT,
  scheduled_for DATE NOT NULL,
  is_played BOOLEAN NOT NULL DEFAULT false,
  played_at TIMESTAMPTZ,
  saved_by_receiver BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'audio' AND audio_path IS NOT NULL) OR (kind = 'text' AND text_content IS NOT NULL))
);
CREATE INDEX idx_messages_receiver_scheduled ON public.messages(receiver_id, scheduled_for);
CREATE INDEX idx_messages_sender ON public.messages(sender_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Sender can see metadata of own sent messages; receiver only sees them after scheduled_for arrives
CREATE POLICY "Sender sees own sent messages" ON public.messages
  FOR SELECT TO authenticated USING (auth.uid() = sender_id);
CREATE POLICY "Receiver sees due or played messages" ON public.messages
  FOR SELECT TO authenticated USING (
    auth.uid() = receiver_id
    AND (scheduled_for <= (now() AT TIME ZONE 'UTC')::date OR is_played = true)
  );
CREATE POLICY "Sender inserts messages to friends" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = sender_id AND f.friend_id = receiver_id)
          OR (f.friend_id = sender_id AND f.user_id = receiver_id))
    )
  );
CREATE POLICY "Receiver updates play/save state" ON public.messages
  FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Sender or receiver can delete" ON public.messages
  FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ============ REACTIONS ============
CREATE TABLE public.reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT,
  audio_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (emoji IS NOT NULL OR audio_path IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reactions TO authenticated;
GRANT ALL ON public.reactions TO service_role;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions visible to sender or receiver" ON public.reactions
  FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Reactor inserts own reaction" ON public.reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ============ SIGNUP TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
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

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.alarms (user_id, alarm_time, is_active)
  VALUES (NEW.id, '07:00', false);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER friendships_touch BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
