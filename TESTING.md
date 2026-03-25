# Cova Device Testing Guide

## BEFORE EVERY DEVICE TEST — run these commands:
```
git pull origin main
npm run deploy
cd apps/mobile && npx expo start --clear
```

## COMPLETE USER FLOW TEST SEQUENCE:

### 1. Splash + Auth
- [ ] Dark navy (#0A1628) background on open
- [ ] Logo fades in over exactly 2 seconds
- [ ] Sign In / Create Account appear after fade
- [ ] Sign in → goes directly to dashboard (no splash repeat)

### 2. Style Quiz
- [ ] Instructions screen appears first
- [ ] Skip button visible on instructions only
- [ ] Cards swipeable with finger gesture
- [ ] No style names visible (no Japandi/Coastal/etc)
- [ ] Quiz ends automatically at confidence or 3 minutes
- [ ] Goes straight to Room Capture after quiz

### 3. Room Capture
- [ ] Budget slider appears FIRST before capture options
- [ ] Camera permission requested before options show
- [ ] Scan Room hidden on non-LiDAR devices
- [ ] 4-corner calibration overlay appears on photo/upload
- [ ] Loading stages shown in order
- [ ] Navigates to render view after processing

### 4. AI Render
- [ ] Render generates automatically — no button needed
- [ ] Progress stages shown: Analyzing → Applying → Generating → Done
- [ ] Panorama viewer loads with render (not flat image)
- [ ] Look around with one finger swipe
- [ ] Pinch to zoom
- [ ] No white space visible at any camera angle
- [ ] Before/after slider works — different images on each side
- [ ] Token balance stays at 999

### 5. Chatbot
- [ ] Chat bubble in bottom RIGHT corner
- [ ] Panel slides up to 60% height
- [ ] Render visible behind panel
- [ ] Can tap render image to reference area
- [ ] Chat is free — no token deduction

### 6. 3D Room Viewer
- [ ] Camera starts at doorway
- [ ] No white space visible
- [ ] Furniture tappable and draggable
- [ ] Style change preserves furniture positions
- [ ] No freeze after furniture tap

## KNOWN ISSUES AND FIXES:
- Depth error on first render → tap retry (Replicate cold start)
- White floor → texture path issue → run: npm run verify
- App not updating → run: npx expo start --clear

## IF ANYTHING FAILS:
1. Check Supabase Edge Function logs:
   https://supabase.com/dashboard/project/xdeacbmkdwqrwxonqaqh/functions
2. Check Sentry: sentry.io → Cova project
3. Run: npm run precheck
4. Paste error here and fix with Claude Code
