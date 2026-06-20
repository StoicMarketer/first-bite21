
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'unlisted',
  ADD COLUMN IF NOT EXISTS max_members int NOT NULL DEFAULT 500;

ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_visibility_check;
ALTER TABLE public.channels ADD CONSTRAINT channels_visibility_check
  CHECK (visibility IN ('public','unlisted','private'));

CREATE OR REPLACE FUNCTION public.generate_channel_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code TEXT;
  i INT;
  attempts INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.channels WHERE invite_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN RAISE EXCEPTION 'No se pudo generar invite_code único'; END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.channels_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  n int := 0;
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := public.generate_channel_invite_code();
  END IF;
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := trim(both '-' from lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g')));
    IF NEW.slug = '' THEN NEW.slug := 'canal'; END IF;
    base := NEW.slug;
    WHILE EXISTS (SELECT 1 FROM public.channels WHERE slug = NEW.slug) LOOP
      n := n + 1;
      NEW.slug := base || '-' || n::text;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channels_before_insert_trg ON public.channels;
CREATE TRIGGER channels_before_insert_trg
  BEFORE INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.channels_before_insert();

UPDATE public.channels SET invite_code = public.generate_channel_invite_code() WHERE invite_code IS NULL;

DROP POLICY IF EXISTS channels_public_select_official ON public.channels;
DROP POLICY IF EXISTS channels_select_visible ON public.channels;
CREATE POLICY channels_select_visible ON public.channels
  FOR SELECT
  USING (
    is_official = true
    OR visibility = 'public'
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.channel_subscriptions s WHERE s.channel_id = id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS channels_insert_own ON public.channels;
CREATE POLICY channels_insert_own ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_official = false);

DROP POLICY IF EXISTS channels_update_own ON public.channels;
CREATE POLICY channels_update_own ON public.channels
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND is_official = false)
  WITH CHECK (created_by = auth.uid() AND is_official = false);

DROP POLICY IF EXISTS channels_delete_own ON public.channels;
CREATE POLICY channels_delete_own ON public.channels
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND is_official = false);

DROP FUNCTION IF EXISTS public.lookup_channel_by_invite(text);
CREATE FUNCTION public.lookup_channel_by_invite(_code text)
RETURNS TABLE(id uuid, slug text, name text, description text, cover_emoji text, visibility text, is_official boolean, member_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_emoji, c.visibility, c.is_official,
         (SELECT COUNT(*) FROM public.channel_subscriptions s WHERE s.channel_id = c.id)
  FROM public.channels c
  WHERE c.invite_code = upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.join_channel_by_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
  cmax int;
  ccount int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT id, max_members INTO cid, cmax FROM public.channels
    WHERE invite_code = upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'))
    LIMIT 1;
  IF cid IS NULL THEN RAISE EXCEPTION 'Canal no encontrado'; END IF;
  SELECT COUNT(*) INTO ccount FROM public.channel_subscriptions WHERE channel_id = cid;
  IF ccount >= cmax AND NOT EXISTS (SELECT 1 FROM public.channel_subscriptions WHERE channel_id = cid AND user_id = uid) THEN
    RAISE EXCEPTION 'Canal lleno';
  END IF;
  INSERT INTO public.channel_subscriptions (channel_id, user_id)
    VALUES (cid, uid)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  RETURN cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_channel_by_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_channel_by_invite(text) TO authenticated;
