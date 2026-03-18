-- Listings table with shareable_slug UNIQUE (8-char random for unpredictability),
-- vote_counts JSONB. Votes table with UNIQUE (listing_id, device_fingerprint).

CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (char_length(address) <= 500),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 10000),
  room_ids UUID[] DEFAULT '{}',
  render_ids UUID[] DEFAULT '{}',
  shareable_slug TEXT UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'),
  vote_counts JSONB DEFAULT '{}',
  qr_code_url TEXT CHECK (qr_code_url IS NULL OR char_length(qr_code_url) <= 2000),
  view_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER listings_updated_at
BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  render_id UUID NOT NULL REFERENCES public.renders(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL CHECK (char_length(device_fingerprint) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, device_fingerprint)
);
