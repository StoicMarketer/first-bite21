
-- Generator (alfabeto Crockford sin O/0/I/1)
CREATE OR REPLACE FUNCTION public.generate_wake_code()
RETURNS TEXT
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
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE wake_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN RAISE EXCEPTION 'No se pudo generar wake_code único'; END IF;
  END LOOP;
END;
$$;

-- Columna
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wake_code TEXT;

-- Backfill
UPDATE public.profiles SET wake_code = public.generate_wake_code() WHERE wake_code IS NULL;

-- Constraints
ALTER TABLE public.profiles ALTER COLUMN wake_code SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_wake_code_key UNIQUE (wake_code);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_wake_code_format CHECK (wake_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$');

-- Default para nuevos perfiles
ALTER TABLE public.profiles ALTER COLUMN wake_code SET DEFAULT public.generate_wake_code();

-- Lookup público (devuelve solo campos seguros)
CREATE OR REPLACE FUNCTION public.lookup_by_wake_code(_code TEXT)
RETURNS TABLE (id UUID, username TEXT, display_name TEXT, avatar_url TEXT, wake_code TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.wake_code
  FROM public.profiles p
  WHERE p.wake_code = upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'))
  LIMIT 1;
$$;

-- Regenerar el propio código (rate-limited 1/min)
CREATE OR REPLACE FUNCTION public.regenerate_my_wake_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  last_update TIMESTAMPTZ;
  new_code TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT updated_at INTO last_update FROM public.profiles WHERE id = uid;
  IF last_update IS NOT NULL AND last_update > now() - interval '1 minute' THEN
    RAISE EXCEPTION 'Debes esperar un minuto antes de regenerar';
  END IF;
  new_code := public.generate_wake_code();
  UPDATE public.profiles SET wake_code = new_code WHERE id = uid;
  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_by_wake_code(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_my_wake_code() TO authenticated;

-- Actualizar handle_new_user para asignar wake_code (default ya lo hace, pero explícito)
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

  INSERT INTO public.profiles (id, username, display_name, avatar_url, wake_code)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
    NEW.raw_user_meta_data->>'avatar_url',
    public.generate_wake_code()
  );

  INSERT INTO public.alarms (user_id, alarm_time, is_active)
  VALUES (NEW.id, '07:00', false);

  RETURN NEW;
END;
$$;
