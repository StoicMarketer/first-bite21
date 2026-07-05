-- Allow multiple alarms per user
ALTER TABLE public.alarms DROP CONSTRAINT IF EXISTS alarms_user_id_key;
CREATE INDEX IF NOT EXISTS alarms_user_id_idx ON public.alarms(user_id);
ALTER TABLE public.alarms ADD COLUMN IF NOT EXISTS label TEXT;