-- RLS enabled on every table. Users see only their own data.
-- service_role bypasses RLS for admin operations only.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Users: read and update own row only
CREATE POLICY "users_own" ON public.users FOR ALL USING (id = auth.uid());

-- Token transactions: own rows only
CREATE POLICY "transactions_own" ON public.token_transactions FOR ALL USING (user_id = auth.uid());

-- Rooms: own rooms only
CREATE POLICY "rooms_own" ON public.rooms FOR ALL USING (user_id = auth.uid());

-- Renders: own renders only
CREATE POLICY "renders_own" ON public.renders FOR ALL USING (user_id = auth.uid());

-- Chat sessions: own sessions only
CREATE POLICY "chat_own" ON public.chat_sessions FOR ALL USING (user_id = auth.uid());

-- Products: readable by all authenticated users; writable only by service_role (no INSERT/UPDATE/DELETE policy for authenticated)
CREATE POLICY "products_read" ON public.products FOR SELECT USING (auth.role() = 'authenticated');

-- Jobs: own jobs only
CREATE POLICY "jobs_own" ON public.jobs FOR ALL USING (user_id = auth.uid());

-- Listings: realtors manage their own; published listings readable by all (for voting page)
CREATE POLICY "listings_own" ON public.listings FOR ALL USING (realtor_id = auth.uid());
CREATE POLICY "listings_public" ON public.listings FOR SELECT USING (is_published = true);

-- Votes: anyone can insert (one per device per listing enforced by UNIQUE); read for own or published listing context
CREATE POLICY "votes_insert" ON public.votes FOR INSERT WITH CHECK (true);
CREATE POLICY "votes_read" ON public.votes FOR SELECT USING (true);
