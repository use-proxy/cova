# Spec: Adaptive Style Quiz System

## PROBLEM
The style quiz currently doesn't work because:
1. swipe_cards table lacked style_weights/active columns (FIXED in DB migration)
2. No adaptive card selection — cards are static shuffled deck
3. Blend never changes because style_weights were always undefined
4. Dead Zustand quiz actions never called by screen
5. No anchor render lookup in render pipeline
6. No style-weighted product re-ranking

## FILES IN SCOPE
- apps/mobile/src/screens/main/StyleQuizScreen.tsx
- apps/mobile/src/store/index.ts (quiz slice only)
- packages/shared/src/types/index.ts (SwipeCard type)
- supabase/functions/render-room/index.ts
- supabase/functions/match-products/index.ts

## FILES OUT OF SCOPE
- All other screens, components, navigation, hooks
- Other edge functions
- Migration files (already applied)

## ACCEPTANCE CRITERIA
1. Phase 1 loads exactly 10 baseline cards (2 per style), room_type filtered
2. Phase 2 fetches cards dynamically based on top 2 styles from current blend
3. Blend changes after every swipe right/left (verifiable by logging)
4. style_weights derived from style string when null
5. Completion fires when maxBlendValue >= 0.65 AND swipeCount >= 10
6. Completion also fires at 120s timeout or user skip
7. On complete: blend saved to Zustand store + rooms table + users table in Supabase
8. No style names in user-facing UI
9. render-room queries anchor_renders for closest style match
10. match-products re-ranks by style match score
11. Zero TypeScript errors
12. Flow 02 Maestro test passes

## WHAT NOT TO DO
- Don't change UI layout/styles/animations (keep existing look)
- Don't touch navigation structure
- Don't change SWIPE_THRESHOLD, animation timing, PanResponder gesture handling
- Don't add new dependencies
- Don't change any other screen
