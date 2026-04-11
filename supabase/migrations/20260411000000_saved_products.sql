-- Saved products: per-user wishlist persisted across sessions.
-- Used by step-9 (the shoppable room) heart/save control.
-- One row per (user, product_url) so double-clicks are idempotent.

create table if not exists public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  product_url text not null,
  product_data jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, product_url)
);

create index if not exists saved_products_user_idx on public.saved_products (user_id);
create index if not exists saved_products_user_room_idx on public.saved_products (user_id, room_id);

alter table public.saved_products enable row level security;

drop policy if exists "saved_products owner" on public.saved_products;
create policy "saved_products owner"
  on public.saved_products
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
