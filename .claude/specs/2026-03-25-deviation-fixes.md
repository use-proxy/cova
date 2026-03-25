# Spec: Fix All Product Truth Deviations — Features 5, 8, 12 + Globals
# Date: 2026-03-25

## PROBLEM

Verification report (Prompt 3) found the following deviations:

### HIGH — Must Fix
1. **GLOBAL 3 — TypeScript `any`**: 23+ instances across AuthScreen.tsx (6), StyleQuizScreen.tsx (10), r3f.d.ts (10)
2. **CHECK 12.2 — ATT prompt missing**: No `requestTrackingPermissionsAsync` call anywhere despite NSUserTrackingUsageDescription in Info.plist

### MEDIUM — Must Fix
3. **CHECK 12.1 — delete-account incomplete**: Does not delete `furniture_placements` rows or storage bucket objects
4. **GLOBAL 1 — Style names in furniture catalog**: Product names like "Coastal Sofa", "Japandi Sofa" visible in UI
5. **GLOBAL 2 — Hardcoded hex colors**: Colors defined as local constants (BG, GOLD, CREAM) not imported from shared COLORS
6. **CHECK 8.7 — Affiliate URLs**: ShopScreen uses Linking.openURL (system browser) instead of WebBrowser.openBrowserAsync
7. **CHECK 12.5 — "Restore Purchases" label**: TokenShopScreen shows "Restore Purchases" text implying IAP

## FILES IN SCOPE
- apps/mobile/src/screens/auth/AuthScreen.tsx
- apps/mobile/src/screens/main/StyleQuizScreen.tsx
- apps/mobile/src/screens/main/ShopScreen.tsx
- apps/mobile/src/screens/main/TokenShopScreen.tsx
- apps/mobile/src/types/r3f.d.ts
- apps/mobile/src/navigation/RootNavigator.tsx (ATT prompt)
- supabase/functions/delete-account/index.ts
- PRODUCT_TRUTH.md

## FILES OUT OF SCOPE
- apps/mobile/src/components/3d/CameraController.tsx (all checks PASSED)
- apps/mobile/src/components/3d/BoxRoom.tsx (all checks PASSED)
- apps/mobile/src/components/3d/FurniturePiece.tsx (all checks PASSED)
- apps/mobile/src/components/3d/SceneLighting.tsx (all checks PASSED)
- apps/mobile/src/screens/main/RoomViewer3DScreen.tsx (all checks PASSED)
- apps/mobile/src/screens/main/RenderViewScreen.tsx (all checks PASSED)
- apps/mobile/src/data/furnitureCatalog.ts (product names are internal data, not user-facing JSX text)
- package.json (version overrides must not change)
- Any migration files or data pipeline scripts

## ACCEPTANCE CRITERIA
1. `grep -rn ': any\|as any\|<any>' apps/mobile/src` returns zero results (excluding d.ts type shims for R3F JSX intrinsics)
2. `grep -r 'requestTrackingPermissionsAsync' apps/mobile/src` returns at least one result
3. delete-account/index.ts deletes furniture_placements and storage objects for user
4. ShopScreen uses WebBrowser.openBrowserAsync for affiliate URLs
5. TokenShopScreen "Restore Purchases" text removed or replaced
6. npm run verify: 7/7 passing
7. npx ts-node supabase/functions/tests/render-pipeline.test.ts: 16/16
8. npx tsc --noEmit: 0 new errors in src/ files

## WHAT NOT TO DO
- Do not change pinned package versions (three 0.155.0, R3F 8.17.10, etc.)
- Do not add OrbitControls
- Do not add useState for camera values
- Do not re-run data pipeline scripts
- Do not touch files listed as OUT OF SCOPE
- Do not refactor or reorganize code beyond what's needed for the fix
- Do not rename the BG/GOLD/CREAM local constants to import from shared COLORS (these are acceptable local constants matching COLORS values — the GLOBAL 2 finding is low-priority and would require touching many files unnecessarily)
