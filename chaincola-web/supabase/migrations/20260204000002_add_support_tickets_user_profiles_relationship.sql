-- Add foreign key relationship between support_tickets and user_profiles
-- This allows Supabase PostgREST to automatically detect the relationship
-- for nested queries like: support_tickets(...user_profiles(...))
--
-- Note: This adds a foreign key from support_tickets.user_id to user_profiles.user_id
-- Since user_profiles.user_id is UNIQUE and references auth.users(id), this is valid.
-- The existing foreign key to auth.users(id) remains, this adds an additional one for PostgREST.

DO $$
BEGIN
  -- First, ensure all support_tickets have corresponding user_profiles
  -- (This should already be the case due to the trigger, but we check to be safe)
  INSERT INTO public.user_profiles (user_id, email)
  SELECT DISTINCT st.user_id, au.email
  FROM public.support_tickets st
  INNER JOIN auth.users au ON au.id = st.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_profiles up WHERE up.user_id = st.user_id
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Check if the foreign key already exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_user_id_user_profiles_fkey'
    AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    -- Add the foreign key constraint
    ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_user_profiles_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.user_profiles(user_id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint: support_tickets.user_id -> user_profiles.user_id';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists: support_tickets_user_id_user_profiles_fkey';
  END IF;
END $$;

-- Add comment explaining the relationship
COMMENT ON CONSTRAINT support_tickets_user_id_user_profiles_fkey ON public.support_tickets 
IS 'Foreign key to user_profiles.user_id to enable Supabase PostgREST relationship detection. This is in addition to the existing foreign key to auth.users(id).';
