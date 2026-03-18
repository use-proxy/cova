-- Users table with auto-create trigger, style_fingerprint JSONB, budget_dna JSONB,
-- token_balance with CHECK >= 0, stripe_customer_id, onboarding_completed

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (char_length(email) <= 500),
  full_name TEXT CHECK (full_name IS NULL OR char_length(full_name) <= 200),
  account_type TEXT NOT NULL DEFAULT 'consumer' CHECK (account_type IN ('consumer', 'realtor')),
  style_fingerprint JSONB NOT NULL DEFAULT '{}',
  budget_dna JSONB NOT NULL DEFAULT '{}',
  token_balance INTEGER NOT NULL DEFAULT 5 CHECK (token_balance >= 0),
  stripe_customer_id TEXT CHECK (stripe_customer_id IS NULL OR char_length(stripe_customer_id) <= 500),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user row when auth.users entry is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
