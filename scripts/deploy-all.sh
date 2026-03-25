#!/bin/bash
set -e
echo "=== Deploying all Cova edge functions ==="
supabase functions deploy render-room --no-verify-jwt
supabase functions deploy generate-depth-map --no-verify-jwt
supabase functions deploy get-render-status --no-verify-jwt
supabase functions deploy chat-room --no-verify-jwt
supabase functions deploy match-products --no-verify-jwt
supabase functions deploy clip-embed --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
echo "=== All functions deployed successfully ==="
