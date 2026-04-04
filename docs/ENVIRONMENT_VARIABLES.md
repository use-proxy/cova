# COVA V1 — Environment Variables Reference

## Required for Production

| Variable | Purpose | Where to Get |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL | Supabase dashboard → Settings → API |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase public key | Supabase dashboard → Settings → API |
| SUPABASE_SERVICE_ROLE_KEY | Supabase admin key | Supabase dashboard → Settings → API |
| REPLICATE_API_TOKEN | Replicate API access | replicate.com → Account → API tokens |
| ANTHROPIC_API_KEY | Claude API access | console.anthropic.com → API keys |
| MODAL_RENDER_ENDPOINT | Modal render webhook URL | Modal dashboard → deployed endpoint URL |
| MODAL_STATUS_ENDPOINT | Modal status webhook URL | Modal dashboard → deployed endpoint URL |

## Optional / Future

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_POSTHOG_KEY | Analytics (Session 2) |
| NEXT_PUBLIC_POSTHOG_HOST | Analytics host (Session 2) |
| SENTRY_DSN | Error monitoring (Session 2) |
| NEXT_PUBLIC_SENTRY_DSN | Client error monitoring (Session 2) |

## Vercel Deployment

Add all required variables in Vercel dashboard:
Project → Settings → Environment Variables
Use the exact variable names from this table.
Never commit actual values to git.
