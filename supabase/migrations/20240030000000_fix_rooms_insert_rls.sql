-- Fix: rooms table INSERT blocked by RLS.
-- The existing "rooms_own" policy uses FOR ALL USING (...) which covers
-- SELECT/UPDATE/DELETE but NOT INSERT. INSERT requires WITH CHECK.
-- Replace with explicit per-operation policies.

DROP POLICY IF EXISTS "rooms_own" ON public.rooms;

CREATE POLICY "rooms_select_own" ON public.rooms
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "rooms_insert_own" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rooms_update_own" ON public.rooms
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "rooms_delete_own" ON public.rooms
  FOR DELETE USING (auth.uid() = user_id);

-- Apply same fix to any other tables using FOR ALL USING pattern

-- renders
DROP POLICY IF EXISTS "renders_own" ON public.renders;
CREATE POLICY "renders_select_own" ON public.renders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "renders_insert_own" ON public.renders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "renders_update_own" ON public.renders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "renders_delete_own" ON public.renders FOR DELETE USING (auth.uid() = user_id);

-- chat_messages
DROP POLICY IF EXISTS "chat_own" ON public.chat_messages;
CREATE POLICY "chat_messages_select_own" ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chat_messages_insert_own" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_messages_update_own" ON public.chat_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "chat_messages_delete_own" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);

-- token_transactions
DROP POLICY IF EXISTS "transactions_own" ON public.token_transactions;
CREATE POLICY "transactions_select_own" ON public.token_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert_own" ON public.token_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update_own" ON public.token_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "transactions_delete_own" ON public.token_transactions FOR DELETE USING (auth.uid() = user_id);

-- cart_items
DROP POLICY IF EXISTS "cart_own" ON public.cart_items;
CREATE POLICY "cart_items_select_own" ON public.cart_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cart_items_insert_own" ON public.cart_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cart_items_update_own" ON public.cart_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cart_items_delete_own" ON public.cart_items FOR DELETE USING (auth.uid() = user_id);

-- users
DROP POLICY IF EXISTS "users_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_delete_own" ON public.users FOR DELETE USING (auth.uid() = id);
