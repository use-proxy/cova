-- Append-only token ledger. Balance = SUM(delta) per user.
-- Cached in users.token_balance; updated only via deduct_tokens_atomic RPC.
-- NEVER allow direct UPDATE on users.token_balance from application code.

CREATE TABLE public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) <= 200),
  render_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic token deduction: uses FOR UPDATE to prevent race conditions.
-- Only this function may UPDATE users.token_balance for debits.
CREATE OR REPLACE FUNCTION public.deduct_tokens_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_render_id UUID DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT token_balance INTO v_balance FROM public.users
  WHERE id = p_user_id FOR UPDATE;
  IF v_balance < p_amount THEN RETURN FALSE; END IF;
  UPDATE public.users SET token_balance = token_balance - p_amount WHERE id = p_user_id;
  INSERT INTO public.token_transactions (user_id, delta, reason, render_id)
  VALUES (p_user_id, -p_amount, p_reason, p_render_id);
  RETURN TRUE;
END;
$$;
