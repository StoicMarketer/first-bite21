
CREATE OR REPLACE FUNCTION public.lookup_by_username(_username text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.username = lower(regexp_replace(_username, '[^a-zA-Z0-9_]', '', 'g'))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.update_my_username(_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_username text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  new_username := lower(regexp_replace(_username, '[^a-zA-Z0-9_]', '', 'g'));
  IF length(new_username) < 3 OR length(new_username) > 20 THEN
    RAISE EXCEPTION 'El usuario debe tener entre 3 y 20 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = new_username AND id <> uid) THEN
    RAISE EXCEPTION 'Ese usuario ya está en uso';
  END IF;
  UPDATE public.profiles SET username = new_username, updated_at = now() WHERE id = uid;
  RETURN new_username;
END;
$$;
