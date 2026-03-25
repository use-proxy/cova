# Spec: Depth Estimation + Render Pipeline Repair
# Date: 2026-03-24

## PROBLEM
The Style Quiz → Room Capture → Depth Estimation → AI Render → Panorama Viewer flow is
broken at depth estimation. Depth Pro times out (cold start ~60-90s exceeds 45s budget),
both fallback models fail, render-room returns 503, and the client shows a cryptic error
code instead of a user-friendly message. Additionally, generate-depth-map uses the old
/v1/predictions + version-hash endpoint instead of /v1/models/ format, and has no Depth Pro
at all — only a single model with no fallback.

## FILES IN SCOPE
- supabase/functions/generate-depth-map/index.ts
- supabase/functions/render-room/index.ts
- apps/mobile/src/hooks/useRender.ts

## FILES OUT OF SCOPE
- apps/mobile/src/screens/main/StyleQuizScreen.tsx
- apps/mobile/src/screens/main/RoomCaptureScreen.tsx
- apps/mobile/src/screens/main/RenderViewScreen.tsx
- supabase/functions/get-render-status/index.ts
- apps/mobile/src/store/index.ts
- supabase/functions/_shared/cors.ts

## ACCEPTANCE CRITERIA
1. generate-depth-map: calls Depth Pro (/v1/models/garg-aayush/ml-depth-pro/predictions)
   first; on failure falls back to Depth Anything V2 (/v1/models/depth-anything/depth-anything-v2-large/predictions);
   if both fail, returns 500 with clear message. Polling uses exponential backoff 3s→6s→12s→24s cap, max 90s.
2. render-room: if generateDepthMap throws (both models failed), proceed using imageDataUri
   as flat depth fallback instead of returning 503. Never hard-fail on depth alone.
3. useRender: validates imageBase64 is non-empty before calling render-room; retries
   callEdgeFunction('render-room') once on failure; after two failures sets
   renderError = "Could not analyze room depth. Please try a clearer photo."
   for depth errors, or the raw error message for other failures.
4. render-room: every catch block emits console.error('SENTRY_CAPTURE: <key>', {...details})
5. generate-depth-map: every catch block emits console.error('SENTRY_CAPTURE: <key>', {...details})
6. StyleBlend data integrity: confirmed by code review that style_blend flows correctly
   from StyleQuizScreen → Zustand store → RoomCaptureScreen → RenderViewScreen → useRender → render-room
7. Image compression confirmed present in both RoomCaptureScreen and RenderViewScreen
   (1024px wide, quality 0.8, JPEG format)
8. Integration test passes: npx ts-node supabase/functions/tests/render-pipeline.test.ts exits 0

## WHAT NOT TO DO
- Do not add Depth Anything V2 as the ONLY model — Depth Pro must remain primary
- Do not change the /v1/models/ endpoint format already correct in render-room
- Do not break the multi-angle averaging logic in generate-depth-map
- Do not remove CORS headers from any response
- Do not touch FILES OUT OF SCOPE
- Do not run data pipeline scripts
- Do not change pnpm version overrides
